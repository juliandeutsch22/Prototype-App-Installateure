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
import { queryTenant, subscribeTenant, type WithId } from './core';

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

  const batch = writeBatch(db);
  for (const d of existing.docs) batch.delete(d.ref);
  for (const r of rows) {
    batch.set(doc(collection(db, COLLECTION)), {
      ...r,
      companyId,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export function deleteAssignment(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}

export type { WithId };
