import { where } from 'firebase/firestore';
import type { MaterialOrder } from '@/types';
import { queryTenant, subscribeTenant, createInTenant, type WithId } from './core';

const COLLECTION = 'materialOrders';

export function subscribeOwnOrders(
  companyId: string,
  uid: string,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<MaterialOrder>(COLLECTION, companyId, cb, onError, where('userId', '==', uid));
}

export function listOpenOrders(companyId: string) {
  return queryTenant<MaterialOrder>(COLLECTION, companyId, where('status', '!=', 'Erledigt'));
}

export type NewMaterialOrder = Omit<MaterialOrder, 'id' | 'companyId' | 'createdAt'>;

export function createMaterialOrder(companyId: string, order: NewMaterialOrder) {
  return createInTenant(COLLECTION, companyId, order);
}
