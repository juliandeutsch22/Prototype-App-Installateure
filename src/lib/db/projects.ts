/**
 * Baustellen.
 *
 * Nur die Weiche — siehe `fs/projects.ts` und `pg/projects.ts`. Die
 * Signaturen hier sind der Vertrag mit den Ansichten.
 */
import type { Project } from '@/types';
import { BAUSTELLEN_AUSWAHL_GRENZE } from '@/lib/listengrenzen';
import type { WithId } from './core';
import * as pg from './pg/projects';

export type NewProject = Omit<Project, 'id' | 'companyId' | 'createdAt'>;

export function listActiveProjects(
  companyId: string, max = BAUSTELLEN_AUSWAHL_GRENZE,
): Promise<WithId<Project>[]> {
  return pg.listActiveProjects(companyId, max);
}

export function listProjectsByNumbers(
  companyId: string, numbers: string[],
): Promise<WithId<Project>[]> {
  return pg.listProjectsByNumbers(companyId, numbers);
}

export function listProjectsByIds(
  companyId: string, ids: string[],
): Promise<WithId<Project>[]> {
  return pg.listProjectsByIds(companyId, ids);
}

export function listRecentProjects(companyId: string, max: number): Promise<WithId<Project>[]> {
  return pg.listRecentProjects(companyId, max);
}

export function listProjectsForEmployee(
  companyId: string, uid: string,
): Promise<WithId<Project>[]> {
  return pg.listProjectsForEmployee(companyId, uid);
}

export function subscribeRecentProjects(
  companyId: string,
  max: number,
  cb: (rows: WithId<Project>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.subscribeRecentProjects(companyId, max, cb, onError);
}

/**
 * Ein VORSCHLAG für die nächste Baustellennummer — `null`, wenn keiner geht.
 *
 * `null` HEISST „KEIN VORSCHLAG" UND IST KEIN FEHLER. Wer den Zähler nicht
 * ziehen darf oder ihn gerade nicht erreicht, bekommt ein leeres Feld und
 * tippt die Nummer. Zu werfen wäre hier falsch: die Nummer ist ein Vorschlag,
 * und ein Vorschlag, der die ganze Ansicht mitreisst, ist keiner.
 */
export async function reserveProjectNumber(
  companyId: string, opts: { seedFrom: number; praefix?: string },
): Promise<string | null> {
  try {
    return await pg.reserveProjectNumber(companyId, opts);
  } catch {
    return null;
  }
}

export function createProject(companyId: string, p: NewProject): Promise<string> {
  return pg.createProject(companyId, p);
}

export function updateProject(id: string, data: Partial<Project>): Promise<void> {
  return pg.updateProject(id, data);
}

export function baustelleUmnummern(id: string, neu: string): Promise<void> {
  return pg.baustelleUmnummern(id, neu);
}

export function deleteProject(id: string): Promise<void> {
  return pg.deleteProject(id);
}

/**
 * Baustellen suchen.
 *
 * DIE SUCHE LÄUFT IN DER DATENBANK, über den ganzen Bestand, und findet auch
 * mitten im Wort. Bis zum Umzug lud die App die ersten `max` Zeilen und
 * filterte im Browser: was dahinter lag, war unauffindbar, und die Ansicht
 * sagte nichts dazu.
 *
 * Der Unterschied ist der Grund für den Umzug und nicht sein Nebenprodukt.
 */
export function searchProjects(
  companyId: string, begriff: string, max = 300,
): Promise<WithId<Project>[]> {
  return pg.searchProjects(companyId, begriff, max);
}
