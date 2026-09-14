import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WithId } from '../core';

/**
 * Die Firestore-Helfer. Kernregel der Mandantenfähigkeit:
 * JEDE Abfrage ist auf `companyId` eingeschränkt, JEDER Schreibvorgang setzt
 * `companyId` aus dem Auth-Kontext (nie aus Client-Eingabe). Die identische
 * Prüfung erfolgt zusätzlich serverseitig in firestore.rules.
 */

/** Abfrage innerhalb eines Mandanten, mit optionalen Zusatz-Constraints. */
export async function queryTenant<T>(
  collectionName: string,
  companyId: string,
  ...constraints: QueryConstraint[]
): Promise<WithId<T>[]> {
  const q = query(
    collection(db, collectionName),
    where('companyId', '==', companyId),
    ...constraints,
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

/** Live-Abonnement innerhalb eines Mandanten. Gibt unsubscribe zurück. */
export function subscribeTenant<T>(
  collectionName: string,
  companyId: string,
  cb: (rows: WithId<T>[]) => void,
  onError: (e: Error) => void,
  ...constraints: QueryConstraint[]
): () => void {
  const q = query(
    collection(db, collectionName),
    where('companyId', '==', companyId),
    ...constraints,
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))),
    (err) => onError(err),
  );
}

/**
 * Entfernt `undefined`-Werte. Firestore lehnt sie hart ab ("Unsupported field
 * value: undefined") — ein leer gelassenes Optionalfeld (etwa eine Baustelle
 * ohne Stundenbudget) hätte das Speichern sonst komplett scheitern lassen.
 * `null` bleibt erhalten, denn das heißt "bewusst leer".
 */
export function stripUndefined(data: DocumentData): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Schreibt ein neues Dokument; companyId + createdAt werden serverseitig-nah gesetzt. */
export async function createInTenant(
  collectionName: string,
  companyId: string,
  data: DocumentData,
): Promise<string> {
  const ref = await addDoc(collection(db, collectionName), {
    ...stripUndefined(data),
    companyId, // immer aus dem Auth-Kontext, nie aus dem Payload
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Aktualisiert ein Dokument; companyId wird NICHT verändert. */
export async function updateInTenant(
  collectionName: string,
  id: string,
  data: DocumentData,
): Promise<void> {
  // companyId niemals überschreiben
  const { companyId: _ignore, ...rest } = data;
  void _ignore;
  await updateDoc(doc(db, collectionName, id), {
    ...stripUndefined(rest),
    updatedAt: serverTimestamp(),
  });
}

/** Löscht ein Dokument. Die Mandantenprüfung erzwingen die firestore.rules. */
export async function deleteInTenant(collectionName: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}

export { where, serverTimestamp };

export type { WithId };
