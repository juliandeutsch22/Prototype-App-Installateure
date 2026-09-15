/**
 * Baustellen.
 *
 * Nur die Weiche — siehe `fs/projects.ts` und `pg/projects.ts`. Die
 * Signaturen hier sind der Vertrag mit den Ansichten.
 */
import type { Project } from '@/types';
import { BAUSTELLEN_AUSWAHL_GRENZE } from '@/lib/listengrenzen';
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/projects';
import * as pg from './pg/projects';

export type NewProject = Omit<Project, 'id' | 'companyId' | 'createdAt'>;

export function listActiveProjects(
  companyId: string, max = BAUSTELLEN_AUSWAHL_GRENZE,
): Promise<WithId<Project>[]> {
  return nutztPostgres() ? pg.listActiveProjects(companyId, max) : fs.listActiveProjects(companyId, max);
}

export function listProjectsByNumbers(
  companyId: string, numbers: string[],
): Promise<WithId<Project>[]> {
  return nutztPostgres()
    ? pg.listProjectsByNumbers(companyId, numbers)
    : fs.listProjectsByNumbers(companyId, numbers);
}

export function listProjectsByIds(
  companyId: string, ids: string[],
): Promise<WithId<Project>[]> {
  return nutztPostgres() ? pg.listProjectsByIds(companyId, ids) : fs.listProjectsByIds(companyId, ids);
}

export function findProjectsByNumber(
  companyId: string, formen: string[],
): Promise<WithId<Project>[]> {
  return nutztPostgres()
    ? pg.findProjectsByNumber(companyId, formen)
    : fs.findProjectsByNumber(companyId, formen);
}

export function listRecentProjects(companyId: string, max: number): Promise<WithId<Project>[]> {
  return nutztPostgres() ? pg.listRecentProjects(companyId, max) : fs.listRecentProjects(companyId, max);
}

export function listProjectsForEmployee(
  companyId: string, uid: string,
): Promise<WithId<Project>[]> {
  return nutztPostgres()
    ? pg.listProjectsForEmployee(companyId, uid)
    : fs.listProjectsForEmployee(companyId, uid);
}

export function subscribeRecentProjects(
  companyId: string,
  max: number,
  cb: (rows: WithId<Project>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return nutztPostgres()
    ? pg.subscribeRecentProjects(companyId, max, cb, onError)
    : fs.subscribeRecentProjects(companyId, max, cb, onError);
}

export function createProject(companyId: string, p: NewProject): Promise<string> {
  return nutztPostgres() ? pg.createProject(companyId, p) : fs.createProject(companyId, p);
}

export function updateProject(id: string, data: Partial<Project>): Promise<void> {
  return nutztPostgres() ? pg.updateProject(id, data) : fs.updateProject(id, data);
}

export function deleteProject(id: string): Promise<void> {
  return nutztPostgres() ? pg.deleteProject(id) : fs.deleteProject(id);
}

/**
 * Baustellen suchen.
 *
 * DIE EINE WEICHE, HINTER DER SICH ZWEI VERSCHIEDENE ZUSAGEN VERBERGEN — und
 * das steht hier, weil es sonst niemand wüsste. Unter Postgres sucht die
 * Datenbank über den ganzen Bestand und findet auch mitten im Wort. Unter
 * Firestore lädt die App die ersten `max` Zeilen und filtert im Browser: was
 * dahinter liegt, ist unauffindbar.
 *
 * Der Unterschied ist der Grund für den Umzug und nicht sein Nebenprodukt.
 */
export function searchProjects(
  companyId: string, begriff: string, max = 300,
): Promise<WithId<Project>[]> {
  return nutztPostgres()
    ? pg.searchProjects(companyId, begriff, max)
    : fs.searchProjects(companyId, begriff, max);
}
