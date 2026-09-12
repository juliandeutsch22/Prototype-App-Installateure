import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Assignment } from '@/types';
import { getEinsatzMaterial } from './einsatzMaterial';
import { queryTenant, subscribeTenant, type WithId } from '../core';

const COLLECTION = 'assignments';

/**
 * Die anstehenden Einsaetze eines Mitarbeiters, ab einem Datum.
 *
 * Vorher ohne Grenze: jeder Einsatz, den dieser Mitarbeiter je hatte, nur um
 * den von heute herauszufiltern. Ein Monteur hat rund 220 Einsaetze im Jahr
 * — nach zehn Jahren 2.200 Dokumente fuer die Frage „wo muss ich heute hin?".
 *
 * Die Obergrenze steht auf einer Zahl, die keine echte Planung verdeckt:
 * Baustellen werden Wochen im Voraus eingeteilt, nicht Jahre. Wird sie
 * erreicht, fehlt hinten der am weitesten entfernte Einsatz — nicht der
 * naechste, und darauf kommt es an.
 */
export function listUpcomingAssignments(
  companyId: string,
  uid: string,
  from: string,
  max = 200,
) {
  return queryTenant<Assignment>(
    COLLECTION,
    companyId,
    where('userId', '==', uid),
    where('date', '>=', from),
    orderBy('date', 'asc'),
    limit(max),
  );
}

/** Einsätze an einem Datum (Planungsansicht). */
export function listAssignmentsForDate(companyId: string, date: string) {
  return queryTenant<Assignment>(COLLECTION, companyId, where('date', '==', date));
}

/** Einsätze EINES Mitarbeiters in einem Zeitraum — der Monatskalender. */
export function listAssignmentsForUserInRange(
  companyId: string,
  uid: string,
  from: string,
  to: string,
) {
  return queryTenant<Assignment>(
    COLLECTION,
    companyId,
    where('userId', '==', uid),
    where('date', '>=', from),
    where('date', '<=', to),
  );
}

/**
 * Alle Einsätze eines Monats, live.
 *
 * Der Kalender braucht den ganzen Monat auf einmal, sonst könnte er die
 * belegten Tage nicht markieren. Der Bereichsfilter läuft über den
 * Datums-STRING ('2026-08-01' … '2026-08-31'), was bei ISO-Datumsangaben
 * derselben Länge zeichenweise dasselbe ist wie ein Datumsvergleich. Der
 * zusammengesetzte Index (companyId, date) liegt bereits in
 * firestore.indexes.json.
 */
export function subscribeAssignmentsForMonth(
  companyId: string,
  year: number,
  month: number,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to = `${year}-${String(month + 1).padStart(2, '0')}-31`;
  return subscribeTenant<Assignment>(
    COLLECTION,
    companyId,
    cb,
    onError,
    where('date', '>=', from),
    where('date', '<=', to),
  );
}

/**
 * Alle Einsätze eines ZEITRAUMS, live — das Wochenbrett.
 *
 * Warum nicht `subscribeAssignmentsForMonth` mit zwei Aufrufen: eine Woche
 * läuft regelmäßig über den Monatswechsel (der 30. ist ein Montag, der 3.
 * ein Donnerstag). Zwei Abonnements müssten dann zusammengeführt werden, und
 * zwar an einer Stelle, an der ein Fehler wie eine leere Woche aussieht.
 *
 * Der Bereichsfilter läuft über den Datums-STRING, was bei ISO-Angaben
 * gleicher Länge zeichenweise dasselbe ist wie ein Datumsvergleich. Der
 * zusammengesetzte Index (companyId, date) liegt bereits vor.
 */
export function subscribeAssignmentsInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return subscribeTenant<Assignment>(
    COLLECTION,
    companyId,
    cb,
    onError,
    where('date', '>=', from),
    where('date', '<=', to),
  );
}

export type AssignmentInput = Omit<Assignment, 'id' | 'companyId' | 'createdAt'>;

/**
 * Speichern = delete-then-recreate für das Paar (date, projectNumber)
 * (docs §4.4): alle bestehenden Einsätze dieses Paares löschen, dann je
 * gewähltem Mitarbeiter neu anlegen.
 *
 * Beides in EINEM Batch. Vorher waren es zwei getrennte Schritte: erst alle
 * löschen, dann alle schreiben. Brach die Verbindung dazwischen ab — auf der
 * Baustelle keine Seltenheit —, war der Tag für diese Baustelle leer, und
 * niemand erfuhr davon. Ein Batch geht ganz durch oder gar nicht.
 *
 * Firestore erlaubt 500 Schreibvorgänge je Batch. Das reicht hier mit großem
 * Abstand: Löschungen plus neue Einsätze bleiben in der Größenordnung der
 * Belegschaft, nicht in Hunderten.
 */
export async function saveAssignments(
  companyId: string,
  date: string,
  projectNumber: string,
  rows: AssignmentInput[],
) {
  const existing = await getDocs(
    query(
      collection(db, COLLECTION),
      where('companyId', '==', companyId),
      where('date', '==', date),
      where('projectNumber', '==', projectNumber),
    ),
  );

  /**
   * Die Rüstliste dieses Einsatzes muss wissen, WER eingeteilt ist.
   *
   * Nicht aus Bequemlichkeit: an dieser Liste von Kennungen hängt die
   * Sicherheitsregel, die entscheidet, ob ein Monteur eine Position abhaken
   * darf. Die Kennungen der Einsätze sind zufällig, eine Regel könnte die
   * Einteilung also gar nicht nachschlagen (siehe `firestore.rules`).
   *
   * IM SELBEN BATCH, nicht danach. Bräche die Verbindung dazwischen ab —
   * auf der Baustelle keine Seltenheit —, wäre die Mannschaft geändert und
   * die Liste dächte weiter, es sei die alte: der neue Kollege sähe das
   * Material und käme beim Antippen nicht durch.
   *
   * ANGELEGT WIRD HIER NICHTS. Gibt es keine Rüstliste, gibt es auch nichts
   * nachzuziehen; ein leeres Materialdokument je Einsatz wäre Ballast.
   */
  const vorhandeneListe = await getEinsatzMaterial(companyId, date, projectNumber);

  const batch = writeBatch(db);
  for (const d of existing.docs) batch.delete(d.ref);
  for (const r of rows) {
    batch.set(doc(collection(db, COLLECTION)), {
      ...r,
      companyId,
      createdAt: serverTimestamp(),
    });
  }
  if (vorhandeneListe) {
    batch.update(doc(db, 'einsatzMaterial', vorhandeneListe.id), {
      uids: rows.map((r) => r.userId),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/**
 * Einen einzelnen Einsatz entfernen.
 *
 * WAS HIER BEWUSST NICHT PASSIERT: `uids` an der Ruestliste schrumpft nicht
 * mit. Wer hier entfernt wird, steht dort also weiter — und duerfte nach den
 * Regeln noch abhaken.
 *
 * Warum das vertretbar ist: den Weg dorthin gibt es in der App nicht mehr.
 * Ohne Einsatz erscheint die Baustelle auf seiner Startseite nicht, es gibt
 * also nichts anzutippen. Bliebe ein direkter Zugriff unter Umgehung der
 * Oberflaeche — und der koennte an einer Liste, auf der er an diesem Tag
 * tatsaechlich stand, einen Haken setzen oder loesen. Das ist sichtbar (der
 * Name steht daneben) und in einem Tipp zurueckzunehmen.
 *
 * Der saubere Weg waere, die verbliebene Mannschaft neu zu berechnen. Das
 * hiesse eine zusaetzliche Abfrage je Loeschung und eine geaenderte
 * Signatur an einer Funktion, die heute richtig arbeitet. Beim naechsten
 * Speichern der Einteilung steht `uids` ohnehin wieder richtig.
 */
export function deleteAssignment(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}

export type { WithId };
