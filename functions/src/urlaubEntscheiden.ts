import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { urlaubsTage } from './generated/feiertage.js';

/**
 * Über einen Urlaubsantrag entscheiden — serverseitig.
 *
 * WARUM NICHT IM BROWSER, obwohl es dort schon lief.
 *
 * Die Genehmigung muss zwei Dinge tun, die ein Genehmigender selbst nicht
 * dürfen soll:
 *
 *  1. NACHSEHEN, an welchen Tagen der Antragsteller schon gebucht hat — sonst
 *     überschriebe die Genehmigung eine erfasste Arbeitsleistung. Das heißt:
 *     fremde Zeiteinträge lesen. Die enthalten Kranken- und Urlaubstage und
 *     damit Gesundheitsdaten nach Art. 9 DSGVO; die Rules verbieten es allen
 *     außer Buchhaltung und Leitung, und das zu Recht.
 *  2. FREMDE ZEITEINTRÄGE SCHREIBEN — dieselbe Grenze.
 *
 *  Solange nur Buchhaltung und Leitung genehmigen durften, fiel das nicht auf:
 *  sie dürfen beides ohnehin. Sobald die Geschäftsführung aber frei festlegen
 *  kann, WER genehmigt — etwa eine Bürokraft —, ginge es nicht mehr. Der
 *  naheliegende Ausweg wäre gewesen, dieser Person das Lesen aller
 *  Zeiteinträge zu erlauben. Eine Datenschutzgrenze aufzumachen, weil sonst
 *  eine Funktion nicht läuft, ist die falsche Reihenfolge — dasselbe
 *  Argument wie beim Handwerksschein.
 *
 * Stattdessen entscheidet der Server. Der Aufrufer schickt nur, WELCHER Antrag
 * wie entschieden wird; zu sehen bekommt er nichts, was er nicht ohnehin
 * sehen darf.
 */

const REGION = 'europe-west3';

/** Firestore erlaubt 500 Schreibvorgänge je Batch. */
const BATCH_GRENZE = 480;

interface Eingabe {
  vacationId?: string;
  entscheidung?: 'Genehmigt' | 'Abgelehnt' | 'Storniert';
  grund?: string;
}

interface Antwort {
  status: string;
  /** Wie viele Urlaubstage ins Zeitkonto geschrieben wurden. */
  angelegt: number;
  /** Tage, an denen schon gebucht war und die deshalb unangetastet blieben. */
  uebersprungen: number;
  /** Beim Storno: wie viele erzeugte Einträge wieder entfernt wurden. */
  entfernt: number;
}

export const urlaubEntscheiden = onCall<Eingabe, Promise<Antwort>>(
  { region: REGION },
  async (req) => {
    const claims = req.auth?.token as { companyId?: string; role?: string } | undefined;
    const companyId = claims?.companyId;
    const rolle = claims?.role ?? '';
    const uid = req.auth?.uid;
    if (!companyId || !uid) throw new HttpsError('unauthenticated', 'Keine Anmeldung.');

    const vacationId = (req.data?.vacationId ?? '').trim();
    const entscheidung = req.data?.entscheidung;
    const grund = (req.data?.grund ?? '').trim();
    if (!vacationId || !entscheidung) {
      throw new HttpsError('invalid-argument', 'Antrag und Entscheidung sind nötig.');
    }
    // Eine Ablehnung ohne Begründung ist für den, der sie bekommt, nicht von
    // Willkür zu unterscheiden. Dasselbe gilt für eine Rücknahme.
    if ((entscheidung === 'Abgelehnt' || entscheidung === 'Storniert') && grund.length < 3) {
      throw new HttpsError('invalid-argument', 'Bitte einen Grund angeben.');
    }

    const db = getFirestore();

    /**
     * Darf dieser Aufrufer entscheiden?
     *
     * Dieselbe Regel wie in `firestore.rules` und in `lib/permissions.ts`:
     * Geschäftsführung und Administration immer, sonst die in den
     * Einstellungen hinterlegten Personen — und ohne Festlegung die
     * Buchhaltung, damit das Einführen dieser Einstellung niemandem
     * stillschweigend Rechte entzogen hat.
     */
    const firma = await db.collection('companies').doc(companyId).get();
    const genehmiger = (firma.data()?.vacationApprovers ?? []) as string[];
    const istLeitung = rolle === 'Geschäftsführung' || rolle === 'Administrator';
    const darf = istLeitung
      ? true
      : genehmiger.length > 0
        ? genehmiger.includes(uid)
        : rolle === 'Buchhaltung';
    if (!darf) {
      throw new HttpsError('permission-denied', 'Keine Berechtigung, Urlaub zu entscheiden.');
    }

    const antragRef = db.collection('vacations').doc(vacationId);
    const antragSnap = await antragRef.get();
    if (!antragSnap.exists) throw new HttpsError('not-found', 'Der Antrag existiert nicht.');
    const antrag = antragSnap.data() as {
      companyId?: string;
      userId?: string;
      userName?: string;
      von?: string;
      bis?: string;
      status?: string;
    };
    // Mandantengrenze auch hier: die Function laeuft mit Admin-Rechten und ist
    // an die Rules nicht gebunden.
    if (antrag.companyId !== companyId) {
      throw new HttpsError('permission-denied', 'Fremder Mandant.');
    }

    const entscheiderName = (req.data as { entscheiderName?: string })?.entscheiderName;
    const entscheidungsFelder = {
      status: entscheidung,
      entschiedenVonUid: uid,
      entschiedenVonName: entscheiderName ?? 'Leitung',
      entschiedenAm: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(grund ? { grund } : {}),
    };

    // --- Ablehnen: keine Nebenwirkung auf das Zeitkonto. ---
    if (entscheidung === 'Abgelehnt') {
      if (antrag.status !== 'Beantragt') {
        throw new HttpsError('failed-precondition', 'Über den Antrag ist bereits entschieden.');
      }
      await antragRef.update(entscheidungsFelder);
      return { status: entscheidung, angelegt: 0, uebersprungen: 0, entfernt: 0 };
    }

    // --- Zurücknehmen: die erzeugten Zeiteinträge wieder einsammeln. ---
    if (entscheidung === 'Storniert') {
      if (antrag.status !== 'Genehmigt') {
        throw new HttpsError('failed-precondition', 'Nur ein genehmigter Urlaub wird zurückgenommen.');
      }
      /**
       * Gefunden werden sie über `vacationId`, nicht über den Zeitraum: ein von
       * Hand gebuchter Urlaubstag im selben Zeitraum darf nicht mit
       * verschwinden.
       */
      const erzeugte = await db
        .collection('timeEntries')
        .where('companyId', '==', companyId)
        .where('vacationId', '==', vacationId)
        .get();

      const batch = db.batch();
      batch.update(antragRef, entscheidungsFelder);
      let entfernt = 0;
      for (const d of erzeugte.docs) {
        if (entfernt >= BATCH_GRENZE) break;
        batch.delete(d.ref);
        entfernt++;
      }
      await batch.commit();
      return { status: entscheidung, angelegt: 0, uebersprungen: 0, entfernt };
    }

    // --- Genehmigen: Status setzen UND die Tage schreiben, in einem Batch. ---
    if (antrag.status !== 'Beantragt') {
      throw new HttpsError('failed-precondition', 'Über den Antrag ist bereits entschieden.');
    }
    if (!antrag.userId || !antrag.von || !antrag.bis) {
      throw new HttpsError('failed-precondition', 'Dem Antrag fehlen Zeitraum oder Antragsteller.');
    }

    // Die Arbeitstage des BETROFFENEN, nicht die des Entscheidenden: sonst
    // bekaeme ein Teilzeitmitarbeiter fuenf Tage abgezogen statt drei.
    const nutzer = await db
      .collection('users')
      .where('companyId', '==', companyId)
      .where('uid', '==', antrag.userId)
      .limit(1)
      .get();
    const workDays = nutzer.docs[0]?.data()?.workDays as number[] | undefined;
    const tage = urlaubsTage(workDays, antrag.von, antrag.bis);
    if (tage.length === 0) {
      throw new HttpsError('failed-precondition', 'Im Zeitraum liegt kein Arbeitstag.');
    }
    if (tage.length > BATCH_GRENZE) {
      throw new HttpsError('invalid-argument', 'Der Zeitraum ist zu lang.');
    }

    /**
     * Bereits gebuchte Tage überspringen, nicht überschreiben.
     *
     * Eine erfasste Arbeitsleistung darf eine Genehmigung nicht stillschweigend
     * wegwerfen — und niemand würde es merken.
     */
    const vorhandene = await db
      .collection('timeEntries')
      .where('companyId', '==', companyId)
      .where('userId', '==', antrag.userId)
      .where('date', '>=', antrag.von)
      .where('date', '<=', antrag.bis)
      .get();
    const belegt = new Set(vorhandene.docs.map((d) => d.data().date as string));
    const offen = tage.filter((t) => !belegt.has(t));

    const batch = db.batch();
    batch.update(antragRef, entscheidungsFelder);
    for (const datum of offen) {
      batch.set(db.collection('timeEntries').doc(), {
        companyId,
        date: datum,
        status: 'Urlaub',
        userId: antrag.userId,
        userName: antrag.userName ?? 'Mitarbeiter',
        breakDuration: 0,
        vacationId,
        comment: 'Genehmigter Urlaub',
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    return {
      status: entscheidung,
      angelegt: offen.length,
      uebersprungen: tage.length - offen.length,
      entfernt: 0,
    };
  },
);
