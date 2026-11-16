/**
 * Einsatzplanung — nur die Weiche.
 */
import type { Assignment, KalenderAbo, KalenderAboArt } from '@/types';
import type { WithId } from './core';
import * as pg from './pg/assignments';
import type { PaarGrundlage } from './paarFassung';
import type { RuestlisteWahl } from './ruestlisteFrage';

export type AssignmentInput = Omit<Assignment, 'id' | 'companyId' | 'createdAt'>;

export function listUpcomingAssignments(
  companyId: string,
  uid: string,
  from: string,
  max = 200,
): Promise<WithId<Assignment>[]> {
  return pg.listUpcomingAssignments(companyId, uid, from, max);
}

export function listAssignmentsForDate(
  companyId: string,
  date: string,
): Promise<WithId<Assignment>[]> {
  return pg.listAssignmentsForDate(companyId, date);
}

export function listAssignmentsForUserInRange(
  companyId: string,
  uid: string,
  from: string,
  to: string,
): Promise<WithId<Assignment>[]> {
  return pg.listAssignmentsForUserInRange(companyId, uid, from, to);
}

export function listAssignmentsInRange(
  companyId: string,
  from: string,
  to: string,
  max = 3000,
): Promise<WithId<Assignment>[]> {
  return pg.listAssignmentsInRange(companyId, from, to, max);
}

export function subscribeAssignmentsInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.subscribeAssignmentsInRange(companyId, from, to, cb, onError);
}

/** Wie viele Baustellen je Tag geplant sind, live — siehe `pg.beobachteEinsatzTage` (L9). */
export function beobachteEinsatzTage(
  companyId: string,
  von: string,
  bis: string,
  cb: (tage: Map<string, number>) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.beobachteEinsatzTage(companyId, von, bis, cb, onError);
}

export function saveAssignments(
  companyId: string,
  date: string,
  projectNumber: string,
  rows: AssignmentInput[],
  /** Worauf die Eingabe beruht (P1, `paarFassung.ts`); ohne Angabe keine Prüfung. */
  grundlage?: PaarGrundlage,
): Promise<void> {
  return pg.saveAssignments(companyId, date, projectNumber, rows, grundlage);
}

/** Einen Einsatz löschen; zur Rüstliste beim Letzten siehe `ruestlisteFrage.ts`. */
export function deleteAssignment(id: string, wahl?: RuestlisteWahl) {
  return pg.deleteAssignment(id, wahl);
}

/** Ein Kalender-Abo der Person — ob es eines gibt, und wann es zuletzt abgeholt wurde. */
export function kalenderAboStand(userId: string, art: KalenderAboArt = 'eigen'): Promise<KalenderAbo | null> {
  return pg.kalenderAboStand(userId, art);
}

/** Einen neuen Abo-Schlüssel anlegen; der bisherige derselben Art hört auf. Kommt nur hier zurück. */
export function kalenderAboAnlegen(art: KalenderAboArt = 'eigen'): Promise<string> {
  return pg.kalenderAboAnlegen(art);
}

export function kalenderAboBeenden(art: KalenderAboArt = 'eigen'): Promise<void> {
  return pg.kalenderAboBeenden(art);
}

export type { WithId };

/** Je Baustelle der letzte und der nächste Einsatz — siehe `pg.baustellenEinsatzlage`. */
export function baustellenEinsatzlage(companyId: string, von: string, heute: string, bis: string) {
  return pg.baustellenEinsatzlage(companyId, von, heute, bis);
}

/** Aktive Baustellen ohne Einsatz in den nächsten 14 Tagen — siehe `pg.baustellenOhneEinsatz` (P8). */
export function baustellenOhneEinsatz(heute: string) {
  return pg.baustellenOhneEinsatz(heute);
}

/** Nur Person, Tag und Baustelle — siehe `pg.listEinsatztageInRange`. */
export function listEinsatztageInRange(companyId: string, from: string, to: string, max = 3000) {
  return pg.listEinsatztageInRange(companyId, from, to, max);
}

/** Die nächsten und die letzten Einsätze einer Baustelle — siehe `pg.einsaetzeDerBaustelle`. */
export function einsaetzeDerBaustelle(companyId: string, projectNumber: string, heute: string, je = 20) {
  return pg.einsaetzeDerBaustelle(companyId, projectNumber, heute, je);
}

export type { FolgeTag } from './pg/assignments';

/** Die Einteilung auf die Folgetage übernehmen — siehe `pg.einsatzFolgetage`. */
export function einsatzFolgetage(
  companyId: string, von: string, bis: string, projectNumber: string,
  rows: Parameters<typeof pg.einsatzFolgetage>[4], nurWerktage: boolean, angleichen = false,
) {
  return pg.einsatzFolgetage(companyId, von, bis, projectNumber, rows, nurWerktage, angleichen);
}

export type { FolgeEntfernt } from './pg/assignments';

/** Eine Person oder alle an den Folgetagen herausnehmen — siehe `pg.einsatzFolgetageEntfernen` (V13). */
export function einsatzFolgetageEntfernen(
  von: string, bis: string, projectNumber: string, userId: string | null, wahl: 'aufloesen' | 'behalten',
) {
  return pg.einsatzFolgetageEntfernen(von, bis, projectNumber, userId, wahl);
}

/** Einen Einsatz verschieben oder kopieren — siehe `pg.einsatzUmplanen`. */
export function einsatzUmplanen(id: string, datum: string, userId: string, kopieren = false) {
  return pg.einsatzUmplanen(id, datum, userId, kopieren);
}

/** Einen Einsatz entfernen, samt Rüstliste — siehe `pg.einsatzEntfernen`. */
export function einsatzEntfernen(id: string, wahl?: RuestlisteWahl) {
  return pg.einsatzEntfernen(id, wahl);
}
