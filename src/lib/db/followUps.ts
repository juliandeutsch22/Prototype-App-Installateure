/**
 * Nachfassungen — nur die Weiche.
 */
import type { FollowUp } from '@/types';
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/followUps';
import * as pg from './pg/followUps';

export type NewFollowUp = Omit<FollowUp, 'id' | 'companyId' | 'createdAt'>;

export function listOpenFollowUps(companyId: string): Promise<WithId<FollowUp>[]> {
  return nutztPostgres() ? pg.listOpenFollowUps(companyId) : fs.listOpenFollowUps(companyId);
}

export function createFollowUp(companyId: string, f: NewFollowUp): Promise<string> {
  return nutztPostgres() ? pg.createFollowUp(companyId, f) : fs.createFollowUp(companyId, f);
}

export function markFollowUpDone(id: string): Promise<void> {
  return nutztPostgres() ? pg.markFollowUpDone(id) : fs.markFollowUpDone(id);
}

export type { WithId };
