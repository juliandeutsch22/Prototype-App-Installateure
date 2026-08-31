import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Assignment } from '@/types';
import { queryTenant, subscribeTenant, type WithId } from './core';

const COLLECTION = 'assignments';

/** Einsätze eines Mitarbeiters (Client-seitig nach Monat filtern). */
export function listAssignmentsForUser(companyId: string, uid: string) {
  return queryTenant<Assignment>(COLLECTION, companyId, where('userId', '==', uid));
}

/** Einsätze an einem Datum (Planungsansicht). */
export function listAssignmentsForDate(companyId: string, date: string) {
  return queryTenant<Assignment>(COLLECTION, companyId, where('date', '==', date));
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
  await Promise.all(existing.docs.map((d) => deleteDoc(d.ref)));
  await Promise.all(
    rows.map((r) =>
      addDoc(collection(db, COLLECTION), { ...r, companyId, createdAt: serverTimestamp() }),
    ),
  );
}

export function deleteAssignment(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}

export type { WithId };
