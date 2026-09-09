import {
  doc,
  deleteDoc,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Material } from '@/types';
import { KATALOG_GRENZE } from '@/lib/katalogGrenze';
import { limit } from 'firebase/firestore';
import { queryTenant, subscribeTenant, createInTenant, updateInTenant, type WithId } from './core';

const COLLECTION = 'materials';

/*
  Die Grenze selbst und die Frage, ob sie greift, stehen in
  `lib/katalogGrenze.ts` — ohne Firebase, weil sechs Ansichten sie brauchen.

  KEIN `orderBy` ZUR GRENZE, und das ist Absicht: Firestore liefert bei einer
  Sortierung ausschliesslich Dokumente, die das Feld ÜBERHAUPT HABEN. Ein
  importierter Artikel ohne Namen verschwände damit lautlos aus dem Katalog —
  genau die Fehlerform, die hier verschwinden soll. Sortiert wird in den
  Ansichten, und die tun es ohnehin alle.
*/
export { KATALOG_GRENZE, katalogAbgeschnitten } from '@/lib/katalogGrenze';

export function subscribeMaterials(
  companyId: string,
  cb: (rows: WithId<Material>[]) => void,
  onError: (e: Error) => void,
  max = KATALOG_GRENZE,
) {
  return subscribeTenant<Material>(COLLECTION, companyId, cb, onError, limit(max));
}

export type NewMaterial = Pick<
  Material,
  'name' | 'category' | 'stock' | 'articleNumber' | 'unit'
>;

/** Ab diesem Bestand gilt Material als knapp (Legacy markiert das rot). */
export const LOW_STOCK_THRESHOLD = 5;

export function createMaterial(companyId: string, m: NewMaterial) {
  // Siehe projects.ts: leere Optionalfelder (etwa keine Artikelnummer) dürfen
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

/**
 * Einmaliges Laden des Materialkatalogs des Mandanten, mit Obergrenze.
 *
 * Wer die Zahl braucht und nicht nur die Liste — Nachkalkulation und
 * Rechnung ordnen Material über den NAMEN zu —, muss prüfen, ob abgeschnitten
 * wurde (`katalogAbgeschnitten`). Eine abgeschnittene Zuordnung ergibt keine
 * falsche Summe: fehlt der Preis, landet der Artikel in „ohne Einkaufspreis"
 * und steht sichtbar da. Der GRUND wäre aber ein anderer als sonst, und
 * deshalb sagen es beide Ansichten ausdrücklich.
 */
export function listMaterials(companyId: string, max = KATALOG_GRENZE) {
  return queryTenant<Material>(COLLECTION, companyId, limit(max));
}
