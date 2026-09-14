/**
 * Materialstamm — nur die Weiche.
 *
 * Die Grenze selbst und die Frage, ob sie greift, stehen in
 * `lib/listengrenzen.ts` — ohne Datenbankbezug, weil sechs Ansichten sie
 * brauchen.
 */
import type { Material } from '@/types';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/materials';
import * as pg from './pg/materials';

export { KATALOG_GRENZE, katalogAbgeschnitten } from '@/lib/listengrenzen';

export type NewMaterial = Pick<Material, 'name' | 'category' | 'stock' | 'articleNumber' | 'unit'>;

/** Ab diesem Bestand gilt Material als knapp (Legacy markiert das rot). */
export const LOW_STOCK_THRESHOLD = 5;

export function subscribeMaterials(
  companyId: string,
  cb: (rows: WithId<Material>[]) => void,
  onError: (e: Error) => void,
  max = KATALOG_GRENZE,
): () => void {
  return nutztPostgres()
    ? pg.subscribeMaterials(companyId, cb, onError, max)
    : fs.subscribeMaterials(companyId, cb, onError, max);
}

export function createMaterial(companyId: string, m: NewMaterial): Promise<string> {
  return nutztPostgres() ? pg.createMaterial(companyId, m) : fs.createMaterial(companyId, m);
}

export function updateMaterial(id: string, data: Partial<Material>): Promise<void> {
  return nutztPostgres() ? pg.updateMaterial(id, data) : fs.updateMaterial(id, data);
}

export function deleteMaterial(id: string): Promise<void> {
  return nutztPostgres() ? pg.deleteMaterial(id) : fs.deleteMaterial(id);
}

export function adjustStock(materialId: string, delta: number): Promise<void> {
  return nutztPostgres() ? pg.adjustStock(materialId, delta) : fs.adjustStock(materialId, delta);
}

export function listMaterials(companyId: string, max = KATALOG_GRENZE): Promise<WithId<Material>[]> {
  return nutztPostgres() ? pg.listMaterials(companyId, max) : fs.listMaterials(companyId, max);
}
