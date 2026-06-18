import { where } from 'firebase/firestore';
import type { TimeEntry } from '@/types';
import { queryTenant, subscribeTenant, createInTenant, updateInTenant, type WithId } from './core';

const COLLECTION = 'timeEntries';

/** Eigene Einträge eines Mitarbeiters. */
export function listOwnEntries(companyId: string, uid: string) {
  return queryTenant<TimeEntry>(COLLECTION, companyId, where('userId', '==', uid));
}

/** Live-Abo der eigenen Einträge. */
export function subscribeOwnEntries(
  companyId: string,
  uid: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<TimeEntry>(COLLECTION, companyId, cb, onError, where('userId', '==', uid));
}

/** Alle Einträge des Mandanten (Buchhaltung/Verwaltung-Übersicht). */
export function subscribeAllEntries(
  companyId: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<TimeEntry>(COLLECTION, companyId, cb, onError);
}

export type NewTimeEntry = Omit<TimeEntry, 'id' | 'companyId' | 'createdAt'>;

export function createTimeEntry(companyId: string, entry: NewTimeEntry) {
  return createInTenant(COLLECTION, companyId, entry);
}

export function updateTimeEntry(id: string, data: Partial<TimeEntry>) {
  return updateInTenant(COLLECTION, id, data);
}
