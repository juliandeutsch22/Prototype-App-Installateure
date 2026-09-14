/**
 * Einsatzplanung — auf Postgres.
 *
 * Der Unterschied zur Firestore-Fassung steht ganz unten: `saveAssignments`
 * war dort ein Batch aus Löschungen, Anlagen und einer Mitzieh-Änderung an
 * der Rüstliste; hier ist es EIN Aufruf, der in einer Transaktion läuft.
 */
import type { Assignment } from '@/types';
import { monatsEnde } from '@shared/feiertage';
import { abfragen, abonnieren, derClient, loeschen, type WithId } from './kern';
import { objektAlsZeile } from './felder';

const EINSAETZE = 'assignments';

/**
 * Die anstehenden Einsätze eines Mitarbeiters, ab einem Datum.
 *
 * Die Obergrenze steht auf einer Zahl, die keine echte Planung verdeckt:
 * Baustellen werden Wochen im Voraus eingeteilt, nicht Jahre. Wird sie
 * erreicht, fehlt hinten der am weitesten entfernte Einsatz — nicht der
 * nächste, und darauf kommt es an.
 */
export function listUpcomingAssignments(
  companyId: string,
  uid: string,
  from: string,
  max = 200,
) {
  return abfragen<Assignment>(EINSAETZE, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'ab', feld: 'date', wert: from },
    ],
    sortiere: { feld: 'date' },
    grenze: max,
  });
}

/** Einsätze an einem Datum (Planungsansicht). */
export function listAssignmentsForDate(companyId: string, date: string) {
  return abfragen<Assignment>(EINSAETZE, companyId, {
    wo: [{ art: 'gleich', feld: 'date', wert: date }],
  });
}

/** Einsätze EINES Mitarbeiters in einem Zeitraum — der Monatskalender. */
export function listAssignmentsForUserInRange(
  companyId: string,
  uid: string,
  from: string,
  to: string,
) {
  return abfragen<Assignment>(EINSAETZE, companyId, {
    wo: [
      { art: 'gleich', feld: 'userId', wert: uid },
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
  });
}

/**
 * Alle Einsätze eines Monats, live.
 *
 * Der Kalender braucht den ganzen Monat auf einmal, sonst könnte er die
 * belegten Tage nicht markieren.
 *
 * DAS ENDE WIRD GERECHNET, NICHT AUF 31 GESETZT. Firestore verglich den
 * Zeitraum als ZEICHENKETTE, und '2026-09-31' lag dort einfach hinter dem
 * letzten echten Tag — harmlos. Postgres liest denselben Wert als DATUM und
 * bricht ab: `date/time field value out of range`. Die Einsatzplanung war
 * nach dem Umschalten genau deshalb nicht benutzbar.
 */
export function subscribeAssignmentsForMonth(
  companyId: string,
  year: number,
  month: number,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to = monatsEnde(year, month + 1);
  return subscribeAssignmentsInRange(companyId, from, to, cb, onError);
}

/**
 * Alle Einsätze eines ZEITRAUMS, live — das Wochenbrett.
 *
 * Warum nicht zweimal der Monat: eine Woche läuft regelmäßig über den
 * Monatswechsel. Zwei Abonnements müssten dann zusammengeführt werden, und
 * zwar an einer Stelle, an der ein Fehler wie eine leere Woche aussieht.
 */
export function subscribeAssignmentsInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return abonnieren<Assignment>(EINSAETZE, companyId, cb, onError, {
    wo: [
      { art: 'ab', feld: 'date', wert: from },
      { art: 'bis', feld: 'date', wert: to },
    ],
  });
}

export type AssignmentInput = Omit<Assignment, 'id' | 'companyId' | 'createdAt'>;

/**
 * Speichern = die alte Einteilung dieses Paares aus Tag und Baustelle fällt
 * weg, die neue entsteht.
 *
 * ALLES ODER NICHTS, deshalb eine Datenbankfunktion und nicht drei Aufrufe.
 * Bräche die Verbindung zwischen Löschen und Schreiben ab — auf der
 * Baustelle keine Seltenheit —, wäre der Tag für diese Baustelle leer, und
 * niemand erführe davon.
 *
 * IM SELBEN ZUG zieht die Rüstliste des Einsatzes ihre Mitarbeiterliste
 * nach. Nicht aus Bequemlichkeit: an dieser Liste hängt die Entscheidung, ob
 * ein Monteur eine Position abhaken darf (`app.ruestliste_geschuetzt`).
 * Liefe sie hinterher und ginge dazwischen etwas schief, sähe der neue
 * Kollege das Material und käme beim Antippen nicht durch.
 */
export async function saveAssignments(
  companyId: string,
  date: string,
  projectNumber: string,
  rows: AssignmentInput[],
): Promise<void> {
  /*
    Der Betrieb steht im Anmeldekontext, die Datenbankfunktion holt ihn sich
    dort (`app.betrieb()`). Der Parameter bleibt trotzdem in der Signatur:
    sie ist für beide Datenquellen dieselbe, und die Firestore-Fassung braucht
    ihn. Ihn hier wegzulassen hiesse, die Weiche könnte nicht mehr beide
    Seiten bedienen.
  */
  void companyId;

  /*
    Tag und Baustelle stehen im Kopf des Aufrufs, nicht in den Zeilen. Sie
    dort nochmals mitzuschicken hiesse, dass eine Zeile mit abweichendem
    Datum stillschweigend unter dem falschen Tag landete — die Funktion
    schreibt jede Zeile auf `p_datum`.
  */
  const zeilen = rows.map(({ date: _tag, projectNumber: _bau, ...rest }) => {
    void _tag;
    void _bau;
    return objektAlsZeile(EINSAETZE, rest);
  });
  const { error } = await derClient().rpc('einsatz_speichern', {
    p_datum: date,
    p_baustelle: projectNumber,
    p_zeilen: zeilen,
  });
  if (error) throw new Error(error.message);
}

/**
 * Einen einzelnen Einsatz entfernen.
 *
 * WAS HIER BEWUSST NICHT PASSIERT: `uids` an der Rüstliste schrumpft nicht
 * mit. Wer hier entfernt wird, steht dort also weiter — und dürfte noch
 * abhaken. Den Weg dorthin gibt es in der App nicht: ohne Einsatz erscheint
 * die Baustelle auf seiner Startseite nicht. Beim nächsten Speichern der
 * Einteilung steht `uids` ohnehin wieder richtig.
 */
export function deleteAssignment(id: string): Promise<void> {
  return loeschen(EINSAETZE, id);
}
