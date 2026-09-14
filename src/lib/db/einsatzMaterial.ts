/**
 * Die Rüstliste eines Einsatzes — nur die Weiche.
 *
 * Was eine Rüstliste ist und warum sie ein eigener Datensatz je Paar aus Tag
 * und Baustelle ist, steht am Typ `EinsatzMaterial` in `types/index.ts`.
 * Kurz: `assignments` trägt eine Zeile je Mitarbeiter, die Kiste steht aber
 * nur einmal im Bus.
 *
 * `einsatzMaterialId` steht NICHT hier. Die berechenbare Dokumentkennung ist
 * ein Firestore-Kunstgriff (ein Dokument je Einsatz ohne Abfrage lesen); in
 * Postgres gibt es sie nicht, und eine Weiche, die unter der einen
 * Datenquelle etwas Falsches zurückgibt, ist schlimmer als keine. Sie lebt
 * jetzt in `fs/einsatzMaterial.ts`, wo sie gebraucht wird und stimmt.
 */
import type { EinsatzMaterial, RuestPosition } from '@/types';
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/einsatzMaterial';
import * as pg from './pg/einsatzMaterial';

export function listEinsatzMaterialForDate(
  companyId: string,
  date: string,
): Promise<WithId<EinsatzMaterial>[]> {
  return nutztPostgres()
    ? pg.listEinsatzMaterialForDate(companyId, date)
    : fs.listEinsatzMaterialForDate(companyId, date);
}

export function subscribeEinsatzMaterialForDate(
  companyId: string,
  date: string,
  cb: (rows: WithId<EinsatzMaterial>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return nutztPostgres()
    ? pg.subscribeEinsatzMaterialForDate(companyId, date, cb, onError)
    : fs.subscribeEinsatzMaterialForDate(companyId, date, cb, onError);
}

export function getEinsatzMaterial(
  companyId: string,
  date: string,
  projectNumber: string,
): Promise<WithId<EinsatzMaterial> | null> {
  return nutztPostgres()
    ? pg.getEinsatzMaterial(companyId, date, projectNumber)
    : fs.getEinsatzMaterial(companyId, date, projectNumber);
}

export function saveEinsatzMaterial(
  companyId: string,
  date: string,
  projectNumber: string,
  positionen: RuestPosition[],
  uids: string[],
  updatedBy: string,
): Promise<void> {
  return nutztPostgres()
    ? pg.saveEinsatzMaterial(companyId, date, projectNumber, positionen, uids, updatedBy)
    : fs.saveEinsatzMaterial(companyId, date, projectNumber, positionen, uids, updatedBy);
}

export function ladenUmschalten(
  companyId: string,
  date: string,
  projectNumber: string,
  positionId: string,
  an: boolean,
  vonName: string,
): Promise<void> {
  return nutztPostgres()
    ? pg.ladenUmschalten(companyId, date, projectNumber, positionId, an, vonName)
    : fs.ladenUmschalten(companyId, date, projectNumber, positionId, an, vonName);
}

export type { WithId };
