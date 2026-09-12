/**
 * Handwerksscheine — nur die Weiche.
 *
 * Der Beleg, den der Kunde auf der Baustelle unterschreibt. Zustände, und der
 * Übergang zur Unterschrift ist endgültig:
 *
 *   ENTWURF          — änderbar, noch nichts unterschrieben
 *   UNTERSCHRIEBEN   — eingefroren. Weder Inhalt noch Unterschriften lassen
 *                      sich danach ändern; das verbietet die Datenbank, nicht
 *                      nur die Oberfläche.
 *   STORNIERT        — der widerrufene Beleg. Nur die Führung, nur mit Grund.
 *   VERWORFEN        — der aufgegebene Entwurf. Aus der Arbeitsliste heraus,
 *                      aber nicht aus der Datenbank; als einziger Zustand
 *                      wieder aufnehmbar.
 *
 * Korrekturen laufen ausschließlich über einen Storno und einen neuen Schein
 * — dasselbe Muster wie bei den Rechnungen. Ein nachträglich geänderter Beleg
 * wäre wertlos: der Kunde hat etwas anderes unterschrieben, als im System
 * steht, und niemand könnte den Unterschied nachweisen.
 */
import type { WorkSheet, WorkSheetFoto, WorkSheetUnterschrift } from '@/types';
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/workSheets';
import * as pg from './pg/workSheets';

export type NewWorkSheet = Omit<WorkSheet, 'id' | 'companyId' | 'createdAt'>;

export function listRecentWorkSheets(
  companyId: string, max = 100,
): Promise<WithId<WorkSheet>[]> {
  return nutztPostgres()
    ? pg.listRecentWorkSheets(companyId, max)
    : fs.listRecentWorkSheets(companyId, max);
}

export function listOwnWorkSheetsSince(
  companyId: string, uid: string, abDatum: string, max = 20,
): Promise<WithId<WorkSheet>[]> {
  return nutztPostgres()
    ? pg.listOwnWorkSheetsSince(companyId, uid, abDatum, max)
    : fs.listOwnWorkSheetsSince(companyId, uid, abDatum, max);
}

export function listSignedWorkSheetsInRange(
  companyId: string, von: string, bis: string, max = 150,
): Promise<WithId<WorkSheet>[]> {
  return nutztPostgres()
    ? pg.listSignedWorkSheetsInRange(companyId, von, bis, max)
    : fs.listSignedWorkSheetsInRange(companyId, von, bis, max);
}

export function listWorkSheetsForProject(
  companyId: string, projectNumber: string, max = 100,
): Promise<WithId<WorkSheet>[]> {
  return nutztPostgres()
    ? pg.listWorkSheetsForProject(companyId, projectNumber, max)
    : fs.listWorkSheetsForProject(companyId, projectNumber, max);
}

export function listWorkSheetsInRange(
  companyId: string, von: string, bis: string, max = 150,
): Promise<WithId<WorkSheet>[]> {
  return nutztPostgres()
    ? pg.listWorkSheetsInRange(companyId, von, bis, max)
    : fs.listWorkSheetsInRange(companyId, von, bis, max);
}

export function getWorkSheet(id: string): Promise<WithId<WorkSheet> | undefined> {
  return nutztPostgres() ? pg.getWorkSheet(id) : fs.getWorkSheet(id);
}

export function createWorkSheet(companyId: string, s: NewWorkSheet): Promise<string> {
  return nutztPostgres() ? pg.createWorkSheet(companyId, s) : fs.createWorkSheet(companyId, s);
}

export function updateWorkSheetDraft(
  id: string, data: Partial<NewWorkSheet>,
): Promise<void> {
  return nutztPostgres() ? pg.updateWorkSheetDraft(id, data) : fs.updateWorkSheetDraft(id, data);
}

export function fotosAmEntwurf(id: string, fotos: WorkSheetFoto[]): Promise<void> {
  return nutztPostgres() ? pg.fotosAmEntwurf(id, fotos) : fs.fotosAmEntwurf(id, fotos);
}

export function signWorkSheet(
  id: string, monteur: WorkSheetUnterschrift, kunde: WorkSheetUnterschrift,
): Promise<void> {
  return nutztPostgres()
    ? pg.signWorkSheet(id, monteur, kunde)
    : fs.signWorkSheet(id, monteur, kunde);
}

export function cancelWorkSheet(id: string, grund: string, vonName: string): Promise<void> {
  return nutztPostgres()
    ? pg.cancelWorkSheet(id, grund, vonName)
    : fs.cancelWorkSheet(id, grund, vonName);
}

export function discardWorkSheetDraft(id: string, vonName: string): Promise<void> {
  return nutztPostgres()
    ? pg.discardWorkSheetDraft(id, vonName)
    : fs.discardWorkSheetDraft(id, vonName);
}

export function restoreWorkSheetDraft(id: string): Promise<void> {
  return nutztPostgres() ? pg.restoreWorkSheetDraft(id) : fs.restoreWorkSheetDraft(id);
}

export type { WithId };
