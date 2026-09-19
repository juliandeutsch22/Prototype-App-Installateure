/**
 * Einsatzplanung — nur die Weiche.
 */
import type { Assignment } from '@/types';
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

export type { WithId };
