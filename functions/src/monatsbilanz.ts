import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  bilanzAusEintraegen,
  betroffeneMonate,
  bilanzId,
  monatVon,
  type EintragDoc,
} from './generated/monatsbilanz.js';

/**
 * Monatsbilanzen: der Stundensaldo ohne die ganze Buchungsgeschichte.
 *
 * Je Mitarbeiter und Monat ein Dokument mit dem IST — gearbeitete Minuten,
 * gezählte Krank- und Urlaubstage, die gebuchten Daten. Aus zweiundzwanzig
 * Dokumenten wird eines; nach zehn Dienstjahren aus 2.640 rund 120.
 *
 * DREI REGELN, die diese Umsetzung tragen:
 *
 * 1. NEU BERECHNEN STATT HOCHZÄHLEN. Firestore-Trigger laufen MINDESTENS
 *    einmal, nicht GENAU einmal — bei einem Wiederholungslauf verzählte sich
 *    ein `+= delta` unbemerkt und dauerhaft. Jeder Lauf hier liest den
 *    betroffenen Monat komplett neu (rund 20 Dokumente) und schreibt das
 *    Ergebnis. Zweimal laufen ändert nichts.
 *
 * 2. NUR DAS IST SPEICHERN, NIE DEN SALDO. Siehe monatsbilanzLogik.ts.
 *
 * 3. DRIFT HEILT VON SELBST. Kein Knopf zum Neuaufbau, den jemand drücken
 *    müsste: ein nächtlicher Lauf rechnet den laufenden und den Vormonat neu.
 *    Eine Abweichung — verlorener Trigger, Fehler beim Schreiben — kann damit
 *    höchstens einen Tag alt werden.
 *
 * DER VOLLSTÄNDIGKEITS-MARKER ist der wichtigste Teil. Der Client darf die
 * Bilanzen nur verwenden, wenn er WEISS, dass sie den Zeitraum seit Eintritt
 * lückenlos decken. Fehlte auch nur ein Monat, wäre der Saldo zu niedrig —
 * und zwar lautlos, denn eine fehlende Bilanz sieht aus wie ein Monat ohne
 * Buchungen. Das Ergebnis wäre ein falscher Lohnzettel. Ohne gültigen Marker
 * rechnet der Client deshalb wie bisher direkt aus den Einträgen: langsamer,
 * aber richtig.
 */

/**
 * Frankfurt — dieselbe Region wie alle anderen Functions und wie der
 * Firestore-Bestand (DSGVO, Spec §10).
 *
 * Stand hier zuerst auf europe-west1. Der Trigger haette funktioniert, der
 * AUFRUF aus der App aber nicht: sie richtet ihren Functions-Client fest auf
 * europe-west3 (`FUNCTIONS_REGION`). Der Erstaufbau waere mit „not found"
 * gescheitert — und zwar erst in der Produktion, weil im Emulator alle
 * Regionen unter derselben Adresse erreichbar sind.
 */
const REGION = 'europe-west3';
const BILANZEN = 'monthlyStats';
const MARKER = 'monthlyStatsMeta';

interface EintragRoh {
  companyId?: string;
  userId?: string;
  date?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  breakDuration?: number;
  hours?: number;
}

/**
 * Rechnet EINE Monatsbilanz neu — vollständig, aus den Einträgen.
 *
 * Die Abfrage ist auf Mandant, Mitarbeiter und Monat begrenzt: rund 20
 * Dokumente, unabhängig davon, wie lange der Betrieb die App schon nutzt.
 */
async function bilanzNeuRechnen(companyId: string, userId: string, monat: string): Promise<void> {
  const db = getFirestore();
  const snap = await db
    .collection('timeEntries')
    .where('companyId', '==', companyId)
    .where('userId', '==', userId)
    .where('date', '>=', `${monat}-01`)
    .where('date', '<=', `${monat}-31`)
    .get();

  const eintraege: EintragDoc[] = snap.docs.map((d) => {
    const r = d.data() as EintragRoh;
    return {
      userId: r.userId ?? userId,
      date: r.date ?? '',
      status: (r.status as EintragDoc['status']) ?? 'Anwesend',
      startTime: r.startTime,
      endTime: r.endTime,
      breakDuration: r.breakDuration,
      hours: r.hours,
    };
  });

  const bilanz = bilanzAusEintraegen(monat, eintraege);
  await db
    .collection(BILANZEN)
    .doc(bilanzId(companyId, userId, monat))
    .set(
      { companyId, userId, ...bilanz, aktualisiert: FieldValue.serverTimestamp() },
      // Vollständig ersetzen, nicht zusammenführen: ein gelöschter letzter
      // Eintrag muss die Bilanz auf null bringen und nicht den alten Wert
      // stehen lassen.
      { merge: false },
    );
}

/**
 * Jede Änderung an einem Zeiteintrag zieht die betroffenen Monate nach.
 *
 * `onDocumentWritten` deckt Anlegen, Ändern und Löschen in einem — drei
 * getrennte Trigger wären drei Gelegenheiten, einen Fall zu vergessen.
 */
export const bilanzNachziehen = onDocumentWritten(
  { region: REGION, document: 'timeEntries/{id}' },
  async (event) => {
    const vorher = event.data?.before?.data() as EintragRoh | undefined;
    const nachher = event.data?.after?.data() as EintragRoh | undefined;
    const companyId = nachher?.companyId ?? vorher?.companyId;
    if (!companyId) return;

    const monate = betroffeneMonate(
      vorher?.userId && vorher?.date ? { userId: vorher.userId, date: vorher.date } : null,
      nachher?.userId && nachher?.date ? { userId: nachher.userId, date: nachher.date } : null,
    );

    for (const { userId, monat } of monate) {
      try {
        await bilanzNeuRechnen(companyId, userId, monat);
      } catch (e) {
        // Weitermachen: ein Fehler in einem Monat darf den anderen nicht
        // mitreissen. Der naechtliche Lauf holt ihn ohnehin nach.
        logger.error('Monatsbilanz fehlgeschlagen', { companyId, userId, monat, e });
      }
    }
  },
);

/** 'YYYY-MM' des Monats, der `versatz` Monate vor heute liegt. */
function monatVersetzt(versatz: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - versatz);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Nächtliche Selbstheilung: laufender Monat und Vormonat, für alle aktiven
 * Mitarbeiter mit Zeitkonto.
 *
 * Der Vormonat ist bewusst dabei. Eine Buchung, die am Monatsersten für den
 * Letzten des Vormonats nachgetragen wird, ist der Normalfall und nicht die
 * Ausnahme — ohne ihn bliebe eine verlorene Aktualisierung dort für immer
 * stehen.
 */
export const bilanzenNachtlauf = onSchedule(
  { region: REGION, schedule: '15 3 * * *', timeZone: 'Europe/Vienna' },
  async () => {
    const db = getFirestore();
    const nutzer = await db.collection('users').where('active', '!=', false).get();
    const monate = [monatVersetzt(0), monatVersetzt(1)];

    let gerechnet = 0;
    for (const doc of nutzer.docs) {
      const u = doc.data() as { companyId?: string; uid?: string; app_start_date?: string | null };
      if (!u.companyId || !u.uid || !u.app_start_date) continue;
      for (const monat of monate) {
        // Monate vor dem Eintritt gibt es nicht.
        if (monat < monatVon(u.app_start_date)) continue;
        try {
          await bilanzNeuRechnen(u.companyId, u.uid, monat);
          gerechnet++;
        } catch (e) {
          logger.error('Nachtlauf fehlgeschlagen', { uid: u.uid, monat, e });
        }
      }
    }
    logger.info('Monatsbilanzen im Nachtlauf erneuert', { gerechnet });
  },
);

/**
 * Erstaufbau: alle Monate seit Eintritt, für einen ganzen Mandanten.
 *
 * Erst danach darf der Client die Bilanzen benutzen — deshalb schreibt dieser
 * Lauf am Ende je Mitarbeiter den Marker `vollstaendigAb`. Ohne ihn fällt der
 * Client auf die direkte Rechnung zurück.
 *
 * Nur für die Geschäftsführung. Der Lauf liest die gesamte Buchungsgeschichte
 * — genau das, was im laufenden Betrieb vermieden werden soll — und gehört
 * deshalb einmalig angestoßen, nicht in eine Ansicht.
 */
export const bilanzenNeuAufbauen = onCall({ region: REGION }, async (req) => {
  const claims = req.auth?.token as { companyId?: string; role?: string } | undefined;
  const companyId = claims?.companyId;
  const role = claims?.role;
  if (!companyId) throw new HttpsError('unauthenticated', 'Keine Anmeldung.');
  if (role !== 'Geschäftsführung' && role !== 'Administrator') {
    throw new HttpsError('permission-denied', 'Nur Geschäftsführung oder Administrator.');
  }

  const db = getFirestore();
  const nutzer = await db.collection('users').where('companyId', '==', companyId).get();

  let bilanzen = 0;
  let mitarbeiter = 0;
  for (const doc of nutzer.docs) {
    const u = doc.data() as { uid?: string; app_start_date?: string | null };
    if (!u.uid || !u.app_start_date) continue;

    // Alle Monate von Eintritt bis heute.
    const start = new Date(`${u.app_start_date}T00:00:00`);
    const heute = new Date();
    const monate: string[] = [];
    for (
      const d = new Date(start.getFullYear(), start.getMonth(), 1);
      d <= heute;
      d.setMonth(d.getMonth() + 1)
    ) {
      monate.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    for (const monat of monate) {
      await bilanzNeuRechnen(companyId, u.uid, monat);
      bilanzen++;
    }

    /**
     * Der Marker wird ZULETZT gesetzt — nach allen Bilanzen dieses
     * Mitarbeiters. Bricht der Lauf vorher ab, fehlt er, und der Client
     * rechnet weiter direkt: langsamer, aber richtig. Umgekehrt wäre es ein
     * lautlos zu niedriger Saldo.
     */
    await db
      .collection(MARKER)
      .doc(`${companyId}_${u.uid}`)
      .set({
        companyId,
        userId: u.uid,
        vollstaendigAb: monatVon(u.app_start_date),
        aufgebaut: FieldValue.serverTimestamp(),
      });
    mitarbeiter++;
  }

  logger.info('Monatsbilanzen aufgebaut', { companyId, mitarbeiter, bilanzen });
  return { mitarbeiter, bilanzen };
});
