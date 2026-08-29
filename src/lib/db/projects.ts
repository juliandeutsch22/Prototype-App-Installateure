import { where, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Project } from '@/types';
import { queryTenant, subscribeTenant, createInTenant, updateInTenant, type WithId } from './core';

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

export type NewProject = Omit<Project, 'id' | 'companyId' | 'createdAt'>;

export function createProject(companyId: string, p: NewProject) {
  // Über createInTenant, damit leere Optionalfelder (z. B. kein Budget)
  // nicht als undefined bei Firestore landen und das Anlegen scheitern lassen.
  return createInTenant(COLLECTION, companyId, p);
}

export function updateProject(id: string, data: Partial<Project>) {
  return updateInTenant(COLLECTION, id, data);
}

export function deleteProject(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}
