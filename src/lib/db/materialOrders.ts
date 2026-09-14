/**
 * Materialanforderungen und Retouren — nur die Weiche.
 */
import type { MaterialOrder } from '@/types';
import { nutztPostgres } from './quelle';
import type { WriteOutcome } from '@/lib/sync/ausgangsfach';
import type { WithId } from './core';
import * as fs from './fs/materialOrders';
import * as pg from './pg/materialOrders';

export type NewMaterialOrder = Omit<MaterialOrder, 'id' | 'companyId' | 'createdAt'>;

export function subscribeOwnOrders(
  companyId: string,
  uid: string,
  max: number,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return nutztPostgres()
    ? pg.subscribeOwnOrders(companyId, uid, max, cb, onError)
    : fs.subscribeOwnOrders(companyId, uid, max, cb, onError);
}

export function subscribeAllOrders(
  companyId: string,
  max: number,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return nutztPostgres()
    ? pg.subscribeAllOrders(companyId, max, cb, onError)
    : fs.subscribeAllOrders(companyId, max, cb, onError);
}

export function createMaterialOrder(
  companyId: string, order: NewMaterialOrder,
): Promise<string> {
  return nutztPostgres()
    ? pg.createMaterialOrder(companyId, order)
    : fs.createMaterialOrder(companyId, order);
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
  if (!nutztPostgres()) return fs.createMaterialOrderOhneEmpfang(companyId, order);
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
  return nutztPostgres()
    ? pg.updateOrderStatus(orderId, newStatus)
    : fs.updateOrderStatus(orderId, newStatus);
}

export function createReturn(
  companyId: string,
  ret: Omit<NewMaterialOrder, 'status' | 'transactionType'> & { condition: string },
): Promise<string> {
  return nutztPostgres() ? pg.createReturn(companyId, ret) : fs.createReturn(companyId, ret);
}

export function deleteOrder(orderId: string): Promise<void> {
  return nutztPostgres() ? pg.deleteOrder(orderId) : fs.deleteOrder(orderId);
}

export function listOpenOrders(companyId: string): Promise<WithId<MaterialOrder>[]> {
  return nutztPostgres() ? pg.listOpenOrders(companyId) : fs.listOpenOrders(companyId);
}

export function listOwnOpenOrders(
  companyId: string, uid: string,
): Promise<WithId<MaterialOrder>[]> {
  return nutztPostgres()
    ? pg.listOwnOpenOrders(companyId, uid)
    : fs.listOwnOpenOrders(companyId, uid);
}
