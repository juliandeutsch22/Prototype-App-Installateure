import { where, collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

export type NewProject = Omit<Project, 'id' | 'companyId' | 'createdAt'>;

export function createProject(companyId: string, p: NewProject) {
  return addDoc(collection(db, COLLECTION), { ...p, companyId, createdAt: serverTimestamp() });
}

export function updateProject(id: string, data: Partial<Project>) {
  return updateDoc(doc(db, COLLECTION, id), data);
}

export function deleteProject(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}
