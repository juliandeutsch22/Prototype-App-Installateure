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
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/vacations';
import * as pg from './pg/vacations';

export type NewVacation = Omit<Vacation, 'id' | 'companyId' | 'createdAt'>;

export function listOwnVacations(
  companyId: string, uid: string, max = 60,
): Promise<WithId<Vacation>[]> {
  return nutztPostgres()
    ? pg.listOwnVacations(companyId, uid, max)
    : fs.listOwnVacations(companyId, uid, max);
}

export function listOpenVacations(
  companyId: string, max = 100,
): Promise<WithId<Vacation>[]> {
  return nutztPostgres()
    ? pg.listOpenVacations(companyId, max)
    : fs.listOpenVacations(companyId, max);
}

export function listApprovedVacationsInRange(
  companyId: string, vonIso: string, bisIso: string, max = 200,
): Promise<WithId<Vacation>[]> {
  return nutztPostgres()
    ? pg.listApprovedVacationsInRange(companyId, vonIso, bisIso, max)
    : fs.listApprovedVacationsInRange(companyId, vonIso, bisIso, max);
}

export function createVacation(companyId: string, v: NewVacation): Promise<string> {
  return nutztPostgres() ? pg.createVacation(companyId, v) : fs.createVacation(companyId, v);
}

export function deleteVacation(id: string): Promise<void> {
  return nutztPostgres() ? pg.deleteVacation(id) : fs.deleteVacation(id);
}

export type { WithId };
