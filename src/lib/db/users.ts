/**
 * Die Belegschaft — nur die Weiche.
 */
import type { AppUser } from '@/types';
import { nutztPostgres } from './quelle';
import * as fs from './fs/users';
import * as pg from './pg/users';

/*
  Vorgaben und Eingabeform stehen in `benutzerVorgaben.ts` — einmal, weil sie
  Regeln des Betriebs sind und nicht der Datenbank. Hier nur durchgereicht,
  damit die Ansichten wie bisher aus einem Modul importieren.
*/
export {
  DEFAULT_WEEKLY_HOURS, DEFAULT_VACATION_DAYS, DEFAULT_WORK_DAYS,
} from './benutzerVorgaben';
export type { UserProfileInput } from './benutzerVorgaben';
import type { UserProfileInput } from './benutzerVorgaben';

export function listUsers(companyId: string): Promise<AppUser[]> {
  return nutztPostgres() ? pg.listUsers(companyId) : fs.listUsers(companyId);
}

export function getUserByUid(companyId: string, uid: string): Promise<AppUser | null> {
  return nutztPostgres() ? pg.getUserByUid(companyId, uid) : fs.getUserByUid(companyId, uid);
}

export function updateUserProfile(
  uid: string, p: Partial<UserProfileInput>,
): Promise<void> {
  return nutztPostgres() ? pg.updateUserProfile(uid, p) : fs.updateUserProfile(uid, p);
}

export function createUserDoc(
  companyId: string, uid: string, p: UserProfileInput,
): Promise<void> {
  return nutztPostgres()
    ? pg.createUserDoc(companyId, uid, p)
    : fs.createUserDoc(companyId, uid, p);
}
