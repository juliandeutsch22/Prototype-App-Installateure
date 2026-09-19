/**
 * Die Anmeldung.
 *
 * WARUM DIESE SCHICHT BLEIBT, obwohl sie seit dem Abbau von Firebase nur noch
 * weiterreicht: `AuthContext.tsx` sprach bis zum 14.09.2026 direkt mit dem
 * Anmeldedienst. Damit hing die halbe App an einem bestimmten Anbieter — das
 * Token kam von dort, und an ihm hängt jede einzelne Zeilenregel. Diese Datei
 * ist die Naht, an der ein Wechsel wieder möglich wäre; die Arbeit steht in
 * `pg/sitzung.ts`.
 */
import type { Company, CurrentUser } from '@/types';
import type { Angemeldet } from './kern';
import * as pg from './pg/sitzung';

export { InactiveUserError } from './kern';
export type { Angemeldet } from './kern';

export function beiAenderung(ruf: (wer: Angemeldet | null) => void): () => void {
  return pg.beiAenderung(ruf);
}

export function anmelden(
  email: string, passwort: string, merken = true,
): Promise<void> {
  return pg.anmelden(email, passwort, merken);
}

export function abmelden(): Promise<void> {
  return pg.abmelden();
}

export function passwortZuruecksetzen(email: string): Promise<void> {
  return pg.passwortZuruecksetzen(email);
}

export function istPlattformAdmin(): Promise<boolean> {
  return pg.istPlattformAdmin();
}

export function kontoAnlegen(email: string, passwort: string): Promise<string> {
  return pg.kontoAnlegen(email, passwort);
}

export function profilSchnell(uid: string, email: string): Promise<CurrentUser | null> {
  return pg.profilSchnell(uid, email);
}

export function profilVomServer(uid: string, email: string): Promise<CurrentUser | null> {
  return pg.profilVomServer(uid, email);
}

export function firmaSchnell(companyId: string): Promise<Company | null> {
  return pg.firmaSchnell(companyId);
}

export function profilMerken(profil: CurrentUser, firma: Company | null): void {
  return pg.profilMerken(profil, firma);
}
