/**
 * Urlaubsanträge — nur die Weiche.
 *
 * Der Ablauf hat drei Beteiligte und muss für alle drei ehrlich sein:
 *
 *  - Der Monteur stellt den Antrag und will jederzeit wissen, woran er ist.
 *    „Beantragt" ist kein Urlaub; danach zu planen wäre ein Missverständnis
 *    mit Folgen.
 *  - Geschäftsführung, Administration und Buchhaltung entscheiden. Eine
 *    Ablehnung trägt einen Grund, sonst ist sie von Willkür nicht zu
 *    unterscheiden.
 *  - Wer Einsätze plant, muss den genehmigten Urlaub SEHEN, bevor er jemanden
 *    einteilt. Ein Urlaub, der erst am Einsatztag auffällt, ist doppelte
 *    Arbeit für alle.
 *
 * Entschieden wird SERVERSEITIG — siehe `lib/functions.ts:callUrlaubEntscheiden`.
 * Der Genehmigende bekommt dabei nichts zu sehen, was er nicht ohnehin sehen
 * darf: Zeiteinträge tragen Kranken- und Urlaubstage und damit
 * Gesundheitsdaten nach Art. 9 DSGVO.
 */
import type { Vacation } from '@/types';
import type { WithId } from './core';
import * as pg from './pg/vacations';

export type NewVacation = Omit<Vacation, 'id' | 'companyId' | 'createdAt'>;

export function listOwnVacations(
  companyId: string, uid: string, max = 60,
): Promise<WithId<Vacation>[]> {
  return pg.listOwnVacations(companyId, uid, max);
}

export function listOpenVacations(
  companyId: string, max = 100,
): Promise<WithId<Vacation>[]> {
  return pg.listOpenVacations(companyId, max);
}

export function listApprovedVacationsInRange(
  companyId: string, vonIso: string, bisIso: string, max = 200,
): Promise<WithId<Vacation>[]> {
  return pg.listApprovedVacationsInRange(companyId, vonIso, bisIso, max);
}

/** Wer in diesem Zeitraum abwesend ist — ohne Grund; für den Wochenplan. */
export function listAbwesendInRange(vonIso: string, bisIso: string): Promise<pg.Abwesenheit[]> {
  return pg.listAbwesendInRange(vonIso, bisIso);
}

export type { Abwesenheit } from './pg/vacations';

export function createVacation(companyId: string, v: NewVacation): Promise<string> {
  return pg.createVacation(companyId, v);
}

export function deleteVacation(id: string): Promise<void> {
  return pg.deleteVacation(id);
}

export type { UrlaubsEntscheidung } from './pg/vacations';
import type { UrlaubsEntscheidung } from './pg/vacations';

/**
 * Über einen Antrag entscheiden.
 *
 * Eine Datenbankfunktion, und das war schon vor dem Umzug so (dort eine Cloud
 * Function) — aus demselben Grund: die Genehmigung muss fremde Zeiteinträge
 * lesen und schreiben, und das darf der Genehmigende nicht.
 *
 * DAS IST KEINE FUNCTION, SONDERN EIN AUFRUF AN DIE DATENBANK — in EINER
 * Transaktion statt in einem Stapel, den ein Abbruch halb stehen liesse.
 * `lib/functions.ts` reicht ihn nur durch, damit die Ansicht nichts merkt.
 */
export function entscheiden(daten: {
  vacationId: string;
  entscheidung: 'Genehmigt' | 'Abgelehnt' | 'Storniert';
  grund?: string;
  entscheiderName?: string;
}): Promise<UrlaubsEntscheidung> {
  return pg.entscheiden(daten);
}

export type { WithId };
