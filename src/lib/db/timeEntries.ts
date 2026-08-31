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

/**
 * Einträge eines Zeitraums, live — für die Mitarbeiterübersicht.
 *
 * Vorher lief dort `subscribeAllEntries`: alle Zeiteinträge des Betriebs seit
 * Einführung, im Browser auf den Monat gefiltert. Bei zwanzig Monteuren sind
 * das nach fünf Jahren über zwanzigtausend Dokumente je Seitenaufruf —
 * langsam, und weil Firestore je gelesenem Dokument abrechnet, unnötig teuer.
 *
 * Der Zeitraum ist ein Jahr, nicht ein Monat: der Resturlaub zählt die
 * Urlaubstage des ganzen Jahres, sonst stünde dort für jeden Monat der volle
 * Anspruch. Der Vergleich läuft über den Datums-STRING, was bei ISO-Angaben
 * gleicher Länge zeichenweise dasselbe ist wie ein Datumsvergleich.
 */
export function subscribeEntriesInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<TimeEntry>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<TimeEntry>(
    COLLECTION,
    companyId,
    cb,
    onError,
    where('date', '>=', from),
    where('date', '<=', to),
  );
}

/**
 * Einträge eines Zeitraums, einmalig geladen.
 *
 * Für die Zeitraum-Exporte: die Ansicht hält nur das angezeigte Jahr, ein
 * Stundennachweis darf aber über den Jahreswechsel gehen. Würde er aus der
 * geladenen Liste gefiltert, fehlte der Dezember im PDF — ohne Hinweis.
 */
export function listEntriesInRange(companyId: string, from: string, to: string) {
  return queryTenant<TimeEntry>(
    COLLECTION,
    companyId,
    where('date', '>=', from),
    where('date', '<=', to),
  );
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
