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
import type { WithId } from './core';
import * as pg from './pg/workSheets';

export type NewWorkSheet = Omit<WorkSheet, 'id' | 'companyId' | 'createdAt'>;

export function listRecentWorkSheets(
  companyId: string, max = 100,
): Promise<WithId<WorkSheet>[]> {
  return pg.listRecentWorkSheets(companyId, max);
}

export function listOwnWorkSheetsSince(
  companyId: string, uid: string, abDatum: string, max = 20,
): Promise<WithId<WorkSheet>[]> {
  return pg.listOwnWorkSheetsSince(companyId, uid, abDatum, max);
}

export function listSignedWorkSheetsInRange(
  companyId: string, von: string, bis: string, max = 150,
): Promise<WithId<WorkSheet>[]> {
  return pg.listSignedWorkSheetsInRange(companyId, von, bis, max);
}

export function listWorkSheetsForProject(
  companyId: string, projectNumber: string, max = 100,
): Promise<WithId<WorkSheet>[]> {
  return pg.listWorkSheetsForProject(companyId, projectNumber, max);
}

export function listWorkSheetsInRange(
  companyId: string, von: string, bis: string, max = 150,
): Promise<WithId<WorkSheet>[]> {
  return pg.listWorkSheetsInRange(companyId, von, bis, max);
}

export function getWorkSheet(id: string): Promise<WithId<WorkSheet> | undefined> {
  return pg.getWorkSheet(id);
}

export function createWorkSheet(companyId: string, s: NewWorkSheet): Promise<string> {
  return pg.createWorkSheet(companyId, s);
}

export function updateWorkSheetDraft(
  id: string, data: Partial<NewWorkSheet>,
): Promise<void> {
  return pg.updateWorkSheetDraft(id, data);
}

export function fotosAmEntwurf(id: string, fotos: WorkSheetFoto[]): Promise<void> {
  return pg.fotosAmEntwurf(id, fotos);
}

export function signWorkSheet(
  id: string, monteur: WorkSheetUnterschrift, kunde: WorkSheetUnterschrift,
): Promise<void> {
  return pg.signWorkSheet(id, monteur, kunde);
}

export function cancelWorkSheet(id: string, grund: string, vonName: string): Promise<void> {
  return pg.cancelWorkSheet(id, grund, vonName);
}

export function discardWorkSheetDraft(id: string, vonName: string): Promise<void> {
  return pg.discardWorkSheetDraft(id, vonName);
}

export function restoreWorkSheetDraft(id: string): Promise<void> {
  return pg.restoreWorkSheetDraft(id);
}

/**
 * Die Stunden der ganzen Mannschaft für einen Schein.
 *
 * Eine Abfrage mit erhöhten Rechten: der Schein braucht die Stunden aller, ein
 * Monteur darf die Zeiteinträge seiner Kollegen aber nicht lesen — in
 * derselben Ablage stehen Kranken- und Urlaubstage, also Gesundheitsdaten nach
 * Art. 9 DSGVO. Zurück kommen nur Anwesenheitszeiten EINER Baustelle an EINEM
 * Tag; die Datenschutzgrenze bleibt, wo sie ist.
 */
export function vorbereiten(
  projectNumber: string, datum: string,
): Promise<{ zeiten: pg.ScheinZeit[] }> {
  return pg.vorbereiten(projectNumber, datum);
}

export type { ScheinZeit } from './pg/workSheets';
export type { WithId };
