/**
 * Die Anmeldung — nur die Weiche.
 *
 * WARUM ES SIE GIBT. Bis zum 14.09.2026 sprach `AuthContext.tsx` direkt mit
 * Firebase Auth und Firestore. Damit liess sich der Umzug gar nicht
 * umschalten: die Datenschicht hätte mit Postgres geredet, das Token wäre
 * weiter von Firebase gekommen, und keine einzige Zeilenregel hätte gegriffen.
 * Das war der letzte Block, der quer lag.
 *
 * DIE MITTE KENNT KEINE DER BEIDEN. Wie in `lib/db/` liegen die zwei
 * Fassungen in `fs/` und `pg/`, und hier steht nur, welche gilt.
 */
import type { Company, CurrentUser } from '@/types';
import { nutztPostgres } from '@/lib/db/quelle';
import type { Angemeldet } from './kern';
import * as fs from './fs/sitzung';
import * as pg from './pg/sitzung';

export { InactiveUserError } from './kern';
export type { Angemeldet } from './kern';

export function beiAenderung(ruf: (wer: Angemeldet | null) => void): () => void {
  return nutztPostgres() ? pg.beiAenderung(ruf) : fs.beiAenderung(ruf);
}

export function anmelden(
  email: string, passwort: string, merken = true,
): Promise<void> {
  return nutztPostgres()
    ? pg.anmelden(email, passwort, merken)
    : fs.anmelden(email, passwort, merken);
}

export function abmelden(): Promise<void> {
  return nutztPostgres() ? pg.abmelden() : fs.abmelden();
}

export function passwortZuruecksetzen(email: string): Promise<void> {
  return nutztPostgres() ? pg.passwortZuruecksetzen(email) : fs.passwortZuruecksetzen(email);
}

export function istPlattformAdmin(): Promise<boolean> {
  return nutztPostgres() ? pg.istPlattformAdmin() : fs.istPlattformAdmin();
}

export function kontoAnlegen(email: string, passwort: string): Promise<string> {
  return nutztPostgres() ? pg.kontoAnlegen(email, passwort) : fs.kontoAnlegen(email, passwort);
}

export function profilSchnell(uid: string, email: string): Promise<CurrentUser | null> {
  return nutztPostgres() ? pg.profilSchnell(uid, email) : fs.profilSchnell(uid, email);
}

export function profilVomServer(uid: string, email: string): Promise<CurrentUser | null> {
  return nutztPostgres() ? pg.profilVomServer(uid, email) : fs.profilVomServer(uid, email);
}

export function firmaSchnell(companyId: string): Promise<Company | null> {
  return nutztPostgres() ? pg.firmaSchnell(companyId) : fs.firmaSchnell(companyId);
}

export function profilMerken(profil: CurrentUser, firma: Company | null): void {
  return nutztPostgres() ? pg.profilMerken(profil, firma) : fs.profilMerken();
}
