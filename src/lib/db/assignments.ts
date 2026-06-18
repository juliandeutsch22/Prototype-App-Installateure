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
import { queryTenant, type WithId } from './core';

const COLLECTION = 'assignments';

/** Einsätze eines Mitarbeiters (Client-seitig nach Monat filtern). */
export function listAssignmentsForUser(companyId: string, uid: string) {
  return queryTenant<Assignment>(COLLECTION, companyId, where('userId', '==', uid));
}

/** Einsätze an einem Datum (Planungsansicht). */
export function listAssignmentsForDate(companyId: string, date: string) {
  return queryTenant<Assignment>(COLLECTION, companyId, where('date', '==', date));
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
