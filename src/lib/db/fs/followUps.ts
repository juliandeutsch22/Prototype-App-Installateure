import { where } from 'firebase/firestore';
import type { FollowUp } from '@/types';
import { queryTenant, createInTenant, updateInTenant } from '../core';

const COLLECTION = 'followUps';

export function listOpenFollowUps(companyId: string) {
  return queryTenant<FollowUp>(COLLECTION, companyId, where('done', '==', false));
}

export type NewFollowUp = Omit<FollowUp, 'id' | 'companyId' | 'createdAt'>;

export function createFollowUp(companyId: string, f: NewFollowUp) {
  return createInTenant(COLLECTION, companyId, f);
}

export function markFollowUpDone(id: string) {
  return updateInTenant(COLLECTION, id, { done: true });
}
