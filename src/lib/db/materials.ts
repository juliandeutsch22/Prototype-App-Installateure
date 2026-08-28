import {
  doc,
  deleteDoc,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Material } from '@/types';
import { queryTenant, subscribeTenant, createInTenant, updateInTenant, type WithId } from './core';

const COLLECTION = 'materials';

export function subscribeMaterials(
  companyId: string,
  cb: (rows: WithId<Material>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<Material>(COLLECTION, companyId, cb, onError);
}

export type NewMaterial = Pick<
  Material,
  'name' | 'category' | 'stock' | 'articleNumber' | 'unit' | 'purchasePrice'
>;

/** Ab diesem Bestand gilt Material als knapp (Legacy markiert das rot). */
export const LOW_STOCK_THRESHOLD = 5;

export function createMaterial(companyId: string, m: NewMaterial) {
  // Siehe projects.ts: leere Optionalfelder (kein Einkaufspreis) dürfen
  // das Anlegen nicht scheitern lassen.
  return createInTenant(COLLECTION, companyId, m);
}

export function updateMaterial(id: string, data: Partial<Material>) {
  return updateInTenant(COLLECTION, id, data);
}

export function deleteMaterial(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Atomare, idempotente Lageranpassung (portiert aus der Legacy-Transaktion,
 * docs §4.3). delta < 0 = Abgang, delta > 0 = Rückbuchung.
 */
export async function adjustStock(materialId: string, delta: number) {
  if (!materialId) return; // Ad-hoc-Material ohne Katalogeintrag
  const ref = doc(db, COLLECTION, materialId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    tx.update(ref, { stock: increment(delta) });
  });
}

/** Einmaliges Laden des Materialkatalogs des Mandanten. */
export function listMaterials(companyId: string) {
  return queryTenant<Material>(COLLECTION, companyId);
}
