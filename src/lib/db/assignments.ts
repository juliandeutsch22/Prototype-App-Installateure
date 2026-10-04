/**
 * Einsatzplanung — nur die Weiche.
 */
import type { Assignment, KalenderAbo, KalenderAboArt } from '@/types';
import type { WithId } from './core';
import * as pg from './pg/assignments';

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

export function subscribeAssignmentsForMonth(
  companyId: string,
  year: number,
  month: number,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.subscribeAssignmentsForMonth(companyId, year, month, cb, onError);
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

export function saveAssignments(
  companyId: string,
  date: string,
  projectNumber: string,
  rows: AssignmentInput[],
): Promise<void> {
  return pg.saveAssignments(companyId, date, projectNumber, rows);
}

export function deleteAssignment(id: string): Promise<void> {
  return pg.deleteAssignment(id);
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
