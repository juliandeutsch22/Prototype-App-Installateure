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

/**
 * Gemeinsame, typisierte Firestore-Helfer. Kernregel der Mandantenfähigkeit:
 * JEDE Abfrage ist auf `companyId` eingeschränkt, JEDER Schreibvorgang setzt
 * `companyId` aus dem Auth-Kontext (nie aus Client-Eingabe). Die identische
 * Prüfung erfolgt zusätzlich serverseitig in firestore.rules.
 */

export type WithId<T> = T & { id: string };

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

/** Schreibt ein neues Dokument; companyId + createdAt werden serverseitig-nah gesetzt. */
export async function createInTenant(
  collectionName: string,
  companyId: string,
  data: DocumentData,
): Promise<string> {
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
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
  await updateDoc(doc(db, collectionName, id), { ...rest, updatedAt: serverTimestamp() });
}

/** Löscht ein Dokument. Die Mandantenprüfung erzwingen die firestore.rules. */
export async function deleteInTenant(collectionName: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionName, id));
}

export { where, serverTimestamp };
