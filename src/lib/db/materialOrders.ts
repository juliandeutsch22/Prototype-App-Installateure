import {
  where,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  runTransaction,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

/** Alle Bestellungen des Mandanten (Material-Dashboard), neueste zuerst. */
export function subscribeAllOrders(
  companyId: string,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<MaterialOrder>(
    COLLECTION,
    companyId,
    cb,
    onError,
    orderBy('createdAt', 'desc'),
  );
}

export type NewMaterialOrder = Omit<MaterialOrder, 'id' | 'companyId' | 'createdAt'>;

export function createMaterialOrder(companyId: string, order: NewMaterialOrder) {
  return createInTenant(COLLECTION, companyId, order);
}

export const ORDER_STATUS_FLOW: MaterialOrder['status'][] = [
  'Offen',
  'In Bearbeitung',
  'Abholbereit',
  'Erledigt',
];

/**
 * Status einer Bestellung ändern (docs §4.3). Beim Übergang auf 'Erledigt'
 * wird der Lagerbestand atomar und idempotent (processed-Flag) reduziert.
 */
export async function updateOrderStatus(orderId: string, newStatus: MaterialOrder['status']) {
  const orderRef = doc(db, COLLECTION, orderId);

  if (newStatus !== 'Erledigt') {
    await updateDoc(orderRef, { status: newStatus, updatedAt: serverTimestamp() });
    return;
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return;
    const order = snap.data() as MaterialOrder;
    if (order.processed) {
      tx.update(orderRef, { status: 'Erledigt', updatedAt: serverTimestamp() });
      return;
    }
    if (order.materialId && order.transactionType !== 'return') {
      const matRef = doc(db, 'materials', order.materialId);
      const matSnap = await tx.get(matRef);
      if (matSnap.exists()) tx.update(matRef, { stock: increment(-(order.quantity || 0)) });
    }
    tx.update(orderRef, { status: 'Erledigt', processed: true, updatedAt: serverTimestamp() });
  });
}

/** Retoure (docs §4.3): direkt 'Erledigt'; bei condition 'neu' Rückbuchung. */
export async function createReturn(
  companyId: string,
  ret: Omit<NewMaterialOrder, 'status' | 'transactionType'> & { condition: string },
) {
  const id = await createMaterialOrder(companyId, {
    ...ret,
    status: 'Erledigt',
    transactionType: 'return',
    processed: true,
  });
  if (ret.condition === 'neu' && ret.materialId) {
    const matRef = doc(db, 'materials', ret.materialId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matRef);
      if (snap.exists()) tx.update(matRef, { stock: increment(ret.quantity || 0) });
    });
  }
  return id;
}

export function deleteOrder(orderId: string) {
  return deleteDoc(doc(db, COLLECTION, orderId));
}

/** Einmaliges Laden aller Bestellungen des Mandanten (z. B. für Rechnungen). */
export function listAllOrders(companyId: string) {
  return queryTenant<MaterialOrder>(COLLECTION, companyId);
}
