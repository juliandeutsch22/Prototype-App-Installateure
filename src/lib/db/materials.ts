/**
 * Materialstamm — nur die Weiche.
 *
 * Die Grenze selbst und die Frage, ob sie greift, stehen in
 * `lib/listengrenzen.ts` — ohne Datenbankbezug, weil sechs Ansichten sie
 * brauchen.
 */
import type { Lagerbewegung, Material } from '@/types';
import { KATALOG_GRENZE } from '@/lib/listengrenzen';
import type { WithId } from './core';
import * as pg from './pg/materials';

export { KATALOG_GRENZE, katalogAbgeschnitten } from '@/lib/listengrenzen';

export type NewMaterial = Pick<Material, 'name' | 'category' | 'stock' | 'articleNumber' | 'unit'>
  & Partial<Pick<Material, 'lagerartikel' | 'mindestmenge' | 'warengruppe' | 'verkaufspreis' | 'einkaufspreis'>>;

/** Ab diesem Bestand gilt Material als knapp (Legacy markiert das rot). */
export const LOW_STOCK_THRESHOLD = 5;

export function subscribeMaterials(
  companyId: string,
  cb: (rows: WithId<Material>[]) => void,
  onError: (e: Error) => void,
  max = KATALOG_GRENZE,
  nurLager = false,
): () => void {
  return pg.subscribeMaterials(companyId, cb, onError, max, nurLager);
}

export function createMaterial(companyId: string, m: NewMaterial): Promise<string> {
  return pg.createMaterial(companyId, m);
}

export function updateMaterial(id: string, data: Partial<Material>): Promise<void> {
  return pg.updateMaterial(id, data);
}

export function deleteMaterial(id: string): Promise<void> {
  return pg.deleteMaterial(id);
}

export function adjustStock(materialId: string, delta: number): Promise<void> {
  return pg.adjustStock(materialId, delta);
}

/** Wareneingang mit Lieferant, Lieferschein und Bezug (M29). */
export function lagerEingang(eingang: {
  materialId: string; menge: number; lieferant: string; lieferschein?: string; bezug?: string;
}): Promise<number> {
  return pg.lagerEingang(eingang);
}

/** Verkaufspreise aus Einkauf und Aufschlag, nur wo keiner steht (M31). */
export function verkaufspreiseVorschlagen(): Promise<{ gesetzt: number; ohneEinkauf: number; ohneAufschlag: number }> {
  return pg.verkaufspreiseVorschlagen();
}

/** Inventur mit Grund (M28). */
export function lagerInventur(materialId: string, bestand: number, grund: string): Promise<number> {
  return pg.lagerInventur(materialId, bestand, grund);
}

/** Das Bewegungsprotokoll eines Artikels (M28). */
export function listLagerbewegungen(materialId: string, max = 200): Promise<Lagerbewegung[]> {
  return pg.listLagerbewegungen(materialId, max);
}

export type { LagerStand } from './pg/materials';

/** Je Artikel Bestand, Zugesagtes, auf Rüstlisten Geplantes und Freies (M32, G19). */
export function lagerFrei(materialIds?: string[]): Promise<Map<string, pg.LagerStand>> {
  return pg.lagerFrei(materialIds);
}

export function listKnappeLagerArtikel(grenze = LOW_STOCK_THRESHOLD): Promise<pg.KnapperLagerArtikel[]> {
  return pg.listKnappeLagerArtikel(grenze);
}

export function listMaterials(companyId: string, max = KATALOG_GRENZE, nurLager = false): Promise<WithId<Material>[]> {
  return pg.listMaterials(companyId, max, nurLager);
}

/** Artikel aus dem Katalog suchen, auf dem Server (M18). */
export function sucheKatalog(companyId: string, begriff: string, max?: number): Promise<WithId<Material>[]> {
  return pg.sucheKatalog(companyId, begriff, max);
}
