import { where } from 'firebase/firestore';
import type { TimeEntry } from '@/types';
import {
  queryTenant,
  subscribeTenant,
  createInTenant,
  updateInTenant,
  deleteInTenant,
  type WithId,
} from './core';

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

/**
 * Prüft, ob für einen Mitarbeiter an einem Datum bereits ein Eintrag existiert.
 * `exceptId` blendet den gerade bearbeiteten Eintrag aus.
 */
export async function findEntryForDate(
  companyId: string,
  uid: string,
  date: string,
  exceptId?: string,
): Promise<WithId<TimeEntry> | null> {
  const rows = await queryTenant<TimeEntry>(
    COLLECTION,
    companyId,
    where('userId', '==', uid),
    where('date', '==', date),
  );
  return rows.find((r) => r.id !== exceptId) ?? null;
}

/** Wird geworfen, wenn für den Tag schon gebucht ist (Legacy:2287-2293). */
export class DuplicateEntryError extends Error {
  constructor(public readonly date: string) {
    super(`Für den ${date} existiert bereits ein Eintrag.`);
    this.name = 'DuplicateEntryError';
  }
}

/**
 * Legt einen Zeiteintrag an. Blockt eine zweite Buchung am selben Tag — der
 * Legacy-Schutz (2287-2293), der hier fehlte: mehrere Einträge pro Tag
 * verfälschen den Überstunden-Saldo unbemerkt. Gilt bewusst auch für den
 * Sprachpfad, deshalb sitzt die Prüfung hier und nicht nur im Formular.
 */
export async function createTimeEntry(companyId: string, entry: NewTimeEntry) {
  const dupe = await findEntryForDate(companyId, entry.userId, entry.date);
  if (dupe) throw new DuplicateEntryError(entry.date);
  return createInTenant(COLLECTION, companyId, entry);
}

export function updateTimeEntry(id: string, data: Partial<TimeEntry>) {
  return updateInTenant(COLLECTION, id, data);
}

export function deleteTimeEntry(id: string) {
  return deleteInTenant(COLLECTION, id);
}

/** Einmaliges Laden aller Einträge des Mandanten (z. B. für Rechnungen). */
export function listAllEntries(companyId: string) {
  return queryTenant<TimeEntry>(COLLECTION, companyId);
}
