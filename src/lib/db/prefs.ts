/**
 * Persönliche Einstellungen — nur die Weiche.
 *
 * Was jemand an Meldungen bekommen will und auf welchen Geräten, entscheidet
 * er selbst. Beide Datenquellen lassen deshalb genau das eigene Dokument zu,
 * und zwar auch beim Lesen.
 */
import type { UserPrefs } from '@/types';
import { nutztPostgres } from './quelle';
import * as fs from './fs/prefs';
import * as pg from './pg/prefs';

/*
  Meldungsart und Vorgabe stehen in `meldungsvorgaben.ts` — einmal, weil sie
  Regeln des Betriebs sind und keine der Datenbank. Hier nur durchgereicht,
  damit die Ansichten wie bisher aus einem Modul importieren.
*/
export { PREFS_DEFAULTS } from './meldungsvorgaben';
export type { NotifyPrefs } from './meldungsvorgaben';
import type { NotifyPrefs } from './meldungsvorgaben';

export function getPrefs(uid: string): Promise<UserPrefs | null> {
  return nutztPostgres() ? pg.getPrefs(uid) : fs.getPrefs(uid);
}

export function subscribePrefs(
  uid: string,
  cb: (p: UserPrefs | null) => void,
  onError?: (e: Error) => void,
): () => void {
  return nutztPostgres()
    ? pg.subscribePrefs(uid, cb, onError)
    : fs.subscribePrefs(uid, cb, onError);
}

export function savePrefs(
  companyId: string, uid: string, prefs: NotifyPrefs,
): Promise<void> {
  return nutztPostgres()
    ? pg.savePrefs(companyId, uid, prefs)
    : fs.savePrefs(companyId, uid, prefs);
}

export function addPushToken(
  companyId: string, uid: string, token: string,
): Promise<void> {
  return nutztPostgres()
    ? pg.addPushToken(companyId, uid, token)
    : fs.addPushToken(companyId, uid, token);
}

export function removePushToken(uid: string, token: string): Promise<void> {
  return nutztPostgres() ? pg.removePushToken(uid, token) : fs.removePushToken(uid, token);
}
