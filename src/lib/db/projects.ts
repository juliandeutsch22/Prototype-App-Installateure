import { where } from 'firebase/firestore';
import type { Project } from '@/types';
import { queryTenant, subscribeTenant, type WithId } from './core';

const COLLECTION = 'projects';

/** Aktive/pausierte Projekte des Mandanten (für Dropdowns & Matching). */
export async function listActiveProjects(companyId: string) {
  const all = await queryTenant<Project>(COLLECTION, companyId);
  return all.filter((p) => p.status === 'Aktiv' || p.status === 'Pausiert');
}

export function listAllProjects(companyId: string) {
  return queryTenant<Project>(COLLECTION, companyId);
}

/** Projekte, denen ein Mitarbeiter zugeordnet ist. */
export function listProjectsForEmployee(companyId: string, uid: string) {
  return queryTenant<Project>(COLLECTION, companyId, where('assignedEmployees', 'array-contains', uid));
}

export function subscribeProjects(
  companyId: string,
  cb: (rows: WithId<Project>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<Project>(COLLECTION, companyId, cb, onError);
}
