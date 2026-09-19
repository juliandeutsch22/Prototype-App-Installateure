/**
 * Nachfassungen — nur die Weiche.
 */
import type { FollowUp } from '@/types';
import type { WithId } from './core';
import * as pg from './pg/followUps';

export type NewFollowUp = Omit<FollowUp, 'id' | 'companyId' | 'createdAt'>;

export function listOpenFollowUps(companyId: string): Promise<WithId<FollowUp>[]> {
  return pg.listOpenFollowUps(companyId);
}

export function createFollowUp(companyId: string, f: NewFollowUp): Promise<string> {
  return pg.createFollowUp(companyId, f);
}

export function markFollowUpDone(id: string): Promise<void> {
  return pg.markFollowUpDone(id);
}

export type { WithId };
