import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * DSGVO-Datenexport (Spec §10): Ein Mandant kann seine kompletten Daten
 * exportieren — technische Einlösung des „eure Daten gehören euch"-Versprechens.
 * Nur Geschäftsführung/Administrator.
 *
 * VOLLSTÄNDIG HEISST VOLLSTÄNDIG. Die Liste umfasste vorher neun der sechzehn
 * Sammlungen; es fehlten Kunden, Angebote, Handwerksscheine, Urlaubsanträge
 * und — am folgenreichsten — die Nummernkreise. Ein Wiederanlauf aus so einem
 * Export hätte den Rechnungszähler bei null begonnen, und der Betrieb hätte
 * zwei Rechnungen mit derselben Nummer in den Büchern. Genau der Schaden, vor
 * dem `firestore.rules` das Löschen der Zähler bewahrt.
 *
 * Wer hier eine Sammlung ergänzt, ergänzt sie auch in dieser Liste. Der Test
 * `tests/unit/mandantenexport.test.ts` gleicht sie gegen `firestore.rules` ab
 * und schlägt fehl, wenn eine Sammlung ohne Entscheidung dazukommt.
 */

/** Sammlungen, die über ein `companyId`-Feld zum Mandanten gehören. */
export const EXPORTABLE = [
  'users',
  'userPrefs',
  'projects',
  'assignments',
  'materials',
  'materialOrders',
  'timeEntries',
  'workSheets',
  'quotes',
  'customers',
  'vacations',
  'invoices',
  'counters',
  'followUps',
  // Verdichtete Zeitkonten. Ableitbar aus den Zeiteinträgen, aber der
  // Neuaufbau dauert und braucht die Function — in einem Export, der als
  // Ausweg gedacht ist, wäre „lässt sich rekonstruieren" die falsche Zusage.
  'monthlyStats',
  'monthlyStatsMeta',
] as const;

/**
 * Felder, die aus dem Export herausfallen, mit Grund.
 *
 * Push-Tokens sind Kanäle auf die Geräte einzelner Mitarbeiter, kein
 * Geschäftsdatum. Für einen Wiederanlauf taugen sie nichts — beim nächsten
 * Anmelden entstehen sie neu —, in einer heruntergeladenen Datei wären sie
 * nur ein Risiko.
 */
const AUSGENOMMENE_FELDER: Record<string, string[]> = {
  userPrefs: ['pushTokens'],
};

/** Wie viele Dokumente je Abfrage. Firestore erlaubt mehr; das hier ist RAM. */
const SEITE = 500;

/**
 * Obergrenze für die Antwort.
 *
 * Ein `onCall` gibt alles in EINER Antwort zurück, und Firebase deckelt die
 * bei 10 MB. Ein Betrieb mit 15.660 Zeiteinträgen — die gemessene Größe —
 * kommt in diese Nähe. Ohne eigene Grenze scheitert der Aufruf dann an einer
 * Stelle, an der niemand die Ursache erkennt: der Client bekommt einen
 * abgebrochenen Aufruf ohne Text. Lieber hier abbrechen und sagen, was los ist.
 */
const MAX_BYTES = 8 * 1024 * 1024;

function ohneAusgenommeneFelder(name: string, daten: Record<string, unknown>) {
  const raus = AUSGENOMMENE_FELDER[name];
  if (!raus) return daten;
  const kopie = { ...daten };
  for (const feld of raus) delete kopie[feld];
  return kopie;
}

export const exportCompanyData = onCall(
  {
    region: 'europe-west3',
    // Ein DSGVO-Export wird ein paar Mal im Jahr angefordert, liest dabei aber
    // den gesamten Mandanten. Eng begrenzen, damit wiederholtes Klicken nicht
    // die halbe Datenbank mehrfach parallel liest.
    maxInstances: 3,
    // Die Vorgaben (256 MiB, 60 s) reichten für einen Betrieb mit Historie
    // nicht: der Lauf liest jede Sammlung vollständig.
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.');
    const companyId = request.auth.token.companyId as string | undefined;
    const role = request.auth.token.role as string | undefined;
    if (!companyId) throw new HttpsError('permission-denied', 'Kein Mandantenkontext.');
    if (role !== 'Geschäftsführung' && role !== 'Administrator') {
      throw new HttpsError('permission-denied', 'Nur Geschäftsführung/Administrator.');
    }

    const db = getFirestore();
    const out: Record<string, unknown[]> = {};
    let bytes = 0;

    /** Mitzählen und rechtzeitig abbrechen, statt am Ende stumm zu scheitern. */
    function aufnehmen(name: string, zeile: Record<string, unknown>) {
      bytes += JSON.stringify(zeile).length;
      if (bytes > MAX_BYTES) {
        throw new HttpsError(
          'resource-exhausted',
          'Der Datenbestand ist zu groß für einen Export in einem Stück. ' +
            'Bitte die nächtliche Ausleitung verwenden oder den Zeitraum einschränken.',
        );
      }
      (out[name] ??= []).push(zeile);
    }

    // Das Firmendokument hängt an der Dokument-ID, nicht an einem Feld.
    const firma = await db.collection('companies').doc(companyId).get();
    out.companies = firma.exists ? [{ id: firma.id, ...firma.data() }] : [];

    for (const name of EXPORTABLE) {
      out[name] ??= [];
      let letzter: QueryDocumentSnapshot | undefined;
      /**
       * Seitenweise statt in einem Rutsch. `.get()` über eine ganze Sammlung
       * hält jedes Dokument gleichzeitig im Speicher — bei drei Jahren
       * Zeiteinträgen ist das der Punkt, an dem die Function ohne verwertbare
       * Meldung abbricht.
       */
      for (;;) {
        let q = db
          .collection(name)
          .where('companyId', '==', companyId)
          .orderBy(FieldPath.documentId())
          .limit(SEITE);
        if (letzter) q = q.startAfter(letzter);
        const snap = await q.get();
        for (const d of snap.docs) {
          aufnehmen(name, { id: d.id, ...ohneAusgenommeneFelder(name, d.data()) });
        }
        if (snap.size < SEITE) break;
        letzter = snap.docs[snap.size - 1];
      }
    }

    const anzahl = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
    logger.info('Mandantenexport erstellt', { companyId, bytes, anzahl });

    return { companyId, exportedAt: new Date().toISOString(), anzahl, data: out };
  },
);
