/**
 * Materialanforderungen und Retouren — nur die Weiche.
 */
import type { MaterialOrder } from '@/types';
import type { WriteOutcome } from '@/lib/sync/ausgangsfach';
import type { WithId } from './core';
import * as pg from './pg/materialOrders';

export type NewMaterialOrder = Omit<MaterialOrder, 'id' | 'companyId' | 'createdAt'>;

export function subscribeOwnOrders(
  companyId: string,
  uid: string,
  max: number,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.subscribeOwnOrders(companyId, uid, max, cb, onError);
}

export function subscribeAllOrders(
  companyId: string,
  max: number,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.subscribeAllOrders(companyId, max, cb, onError);
}

export function createMaterialOrder(
  companyId: string, order: NewMaterialOrder,
): Promise<string> {
  return pg.createMaterialOrder(companyId, order);
}

/**
 * Dasselbe für die Anforderung von der Baustelle — mit Ausgangsfach.
 *
 * Getrennt von `createMaterialOrder`, weil die Einsatzplanung im Büro dieselbe
 * Funktion ruft und dort nichts vorgemerkt werden soll.
 */
export async function createMaterialOrderOhneEmpfang(
  companyId: string, order: NewMaterialOrder,
): Promise<WriteOutcome> {
  const { stand } = await pg.createMaterialOrderOhneEmpfang(companyId, order);
  return stand;
}

/**
 * Die Reihenfolge, in der eine Anforderung durchlaeuft.
 *
 * Steht hier und nicht in fs/ oder pg/: sie beschreibt den Ablauf im Betrieb
 * und nicht die Datenbank — und sie zweimal zu fuehren hiesse, dass eines
 * Tages zwei verschiedene Reihenfolgen nebeneinander stehen.
 */
export const ORDER_STATUS_FLOW: MaterialOrder['status'][] = [
  'Offen',
  'In Bearbeitung',
  'Abholbereit',
  'Erledigt',
];

export function updateOrderStatus(
  orderId: string, newStatus: MaterialOrder['status'],
): Promise<void> {
  return pg.updateOrderStatus(orderId, newStatus);
}

export function createReturn(
  companyId: string,
  ret: Omit<NewMaterialOrder, 'status' | 'transactionType'> & { condition: string },
): Promise<string> {
  return pg.createReturn(companyId, ret);
}

export function deleteOrder(orderId: string): Promise<void> {
  return pg.deleteOrder(orderId);
}

export function listOpenOrders(companyId: string): Promise<WithId<MaterialOrder>[]> {
  return pg.listOpenOrders(companyId);
}

export function listOwnOpenOrders(
  companyId: string, uid: string,
): Promise<WithId<MaterialOrder>[]> {
  return pg.listOwnOpenOrders(companyId, uid);
}
