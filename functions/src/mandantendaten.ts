import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FieldPath } from 'firebase-admin/firestore';

/**
 * Was die Daten eines Mandanten ausmacht — an EINER Stelle.
 *
 * Zwei Wege lesen denselben Bestand: der Auskunftsexport auf Knopfdruck
 * (`export.ts`) und die nächtliche Ausleitung an einen zweiten Ort
 * (`ausleitung.ts`). Zwei Listen wären hier derselbe Fehler wie zwei
 * Implementierungen einer Formel: sie laufen auseinander, und bemerkt würde
 * es an einem Wiederanlauf, bei dem die Hälfte fehlt.
 *
 * VOLLSTÄNDIG HEISST VOLLSTÄNDIG. Die Liste umfasste vorher neun der sechzehn
 * Sammlungen; es fehlten Kunden, Angebote, Handwerksscheine, Urlaubsanträge
 * und — am folgenreichsten — die Nummernkreise. Ein Wiederanlauf aus so einem
 * Export hätte den Rechnungszähler bei null begonnen, und der Betrieb hätte
 * zwei Rechnungen mit derselben Nummer in den Büchern.
 *
 * Wer eine Sammlung ergänzt, ergänzt sie hier. Der Test
 * `tests/unit/mandantenexport.test.ts` gleicht die Liste gegen
 * `firestore.rules` ab und schlägt fehl, wenn eine ohne Entscheidung
 * dazukommt.
 */

/** Sammlungen, die über ein `companyId`-Feld zum Mandanten gehören. */
export const EXPORTABLE = [
  'users',
  'userPrefs',
  'projects',
  'assignments',
  // Die Ruestlisten zu den Einsaetzen. Sie tragen fest, was an einem Tag auf
  // eine Baustelle mitgenommen werden sollte und wer es eingeladen hat — bei
  // einer Rueckfrage Wochen spaeter ist das der einzige Beleg dafuer.
  'einsatzMaterial',
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
 * Anmelden entstehen sie neu —, in einer abgelegten Datei wären sie nur ein
 * Risiko.
 */
export const AUSGENOMMENE_FELDER: Record<string, string[]> = {
  userPrefs: ['pushTokens'],
};

/** Wie viele Dokumente je Abfrage. Firestore erlaubt mehr; das hier ist RAM. */
const SEITE = 500;

export function ohneAusgenommeneFelder(name: string, daten: Record<string, unknown>) {
  const raus = AUSGENOMMENE_FELDER[name];
  if (!raus) return daten;
  const kopie = { ...daten };
  for (const feld of raus) delete kopie[feld];
  return kopie;
}

/**
 * Jedes Dokument eines Mandanten, seitenweise, an `jeZeile` gereicht.
 *
 * SEITENWEISE IST HIER KEIN FEINSCHLIFF. Ein `.get()` über eine ganze
 * Sammlung hält jedes Dokument gleichzeitig im Speicher; bei drei Jahren
 * Zeiteinträgen — gemessen 15.660 Stück — ist das der Punkt, an dem die
 * Function ohne verwertbare Meldung abbricht.
 *
 * Der Rückruf statt eines Rückgabewerts ist derselbe Gedanke: der Aufrufer
 * entscheidet, ob er sammelt (Auskunft) oder wegschreibt (Ausleitung). Nur
 * der Sammler muss dann noch auf seine Größe achten.
 */
export async function jedesDokument(
  db: Firestore,
  companyId: string,
  jeZeile: (sammlung: string, zeile: Record<string, unknown>) => void | Promise<void>,
): Promise<void> {
  // Das Firmendokument hängt an der Dokument-ID, nicht an einem Feld.
  const firma = await db.collection('companies').doc(companyId).get();
  if (firma.exists) await jeZeile('companies', { id: firma.id, ...firma.data() });

  for (const name of EXPORTABLE) {
    let letzter: QueryDocumentSnapshot | undefined;
    for (;;) {
      let q = db
        .collection(name)
        .where('companyId', '==', companyId)
        .orderBy(FieldPath.documentId())
        .limit(SEITE);
      if (letzter) q = q.startAfter(letzter);
      const snap = await q.get();
      for (const d of snap.docs) {
        await jeZeile(name, { id: d.id, ...ohneAusgenommeneFelder(name, d.data()) });
      }
      if (snap.size < SEITE) break;
      letzter = snap.docs[snap.size - 1];
    }
  }
}
