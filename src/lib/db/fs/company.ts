import { doc, getDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Company } from '@/types';

/**
 * Stammdaten des Mandanten. Sonderfall gegenüber core.ts: `companies` ist
 * KEINE mandantengefilterte Collection — das Dokument IST der Mandant. Deshalb
 * wird hier direkt per ID gelesen und geschrieben; wer schreiben darf,
 * entscheiden die firestore.rules (Geschäftsführung/Administrator).
 */

export async function getCompany(companyId: string): Promise<Company | null> {
  const snap = await getDoc(doc(db, 'companies', companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Company, 'id'>) };
}

/** Aktualisiert Stammdaten. `id` ist die Dokument-ID und wird nie geschrieben. */
export async function updateCompany(
  companyId: string,
  data: Partial<Omit<Company, 'id'>>,
): Promise<void> {
  const clean: DocumentData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) clean[k] = v;
  }
  await updateDoc(doc(db, 'companies', companyId), clean);
}
