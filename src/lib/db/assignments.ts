/**
 * Einsatzplanung — nur die Weiche.
 */
import type { Assignment } from '@/types';
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/assignments';
import * as pg from './pg/assignments';

export type AssignmentInput = Omit<Assignment, 'id' | 'companyId' | 'createdAt'>;

export function listUpcomingAssignments(
  companyId: string,
  uid: string,
  from: string,
  max = 200,
): Promise<WithId<Assignment>[]> {
  return nutztPostgres()
    ? pg.listUpcomingAssignments(companyId, uid, from, max)
    : fs.listUpcomingAssignments(companyId, uid, from, max);
}

export function listAssignmentsForDate(
  companyId: string,
  date: string,
): Promise<WithId<Assignment>[]> {
  return nutztPostgres()
    ? pg.listAssignmentsForDate(companyId, date)
    : fs.listAssignmentsForDate(companyId, date);
}

export function listAssignmentsForUserInRange(
  companyId: string,
  uid: string,
  from: string,
  to: string,
): Promise<WithId<Assignment>[]> {
  return nutztPostgres()
    ? pg.listAssignmentsForUserInRange(companyId, uid, from, to)
    : fs.listAssignmentsForUserInRange(companyId, uid, from, to);
}

export function subscribeAssignmentsForMonth(
  companyId: string,
  year: number,
  month: number,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return nutztPostgres()
    ? pg.subscribeAssignmentsForMonth(companyId, year, month, cb, onError)
    : fs.subscribeAssignmentsForMonth(companyId, year, month, cb, onError);
}

export function subscribeAssignmentsInRange(
  companyId: string,
  from: string,
  to: string,
  cb: (rows: WithId<Assignment>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return nutztPostgres()
    ? pg.subscribeAssignmentsInRange(companyId, from, to, cb, onError)
    : fs.subscribeAssignmentsInRange(companyId, from, to, cb, onError);
}

export function saveAssignments(
  companyId: string,
  date: string,
  projectNumber: string,
  rows: AssignmentInput[],
): Promise<void> {
  return nutztPostgres()
    ? pg.saveAssignments(companyId, date, projectNumber, rows)
    : fs.saveAssignments(companyId, date, projectNumber, rows);
}

export function deleteAssignment(id: string): Promise<void> {
  return nutztPostgres() ? pg.deleteAssignment(id) : fs.deleteAssignment(id);
}

export type { WithId };
