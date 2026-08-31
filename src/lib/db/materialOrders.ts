import {
  where,
  orderBy,
  doc,
  getDoc,
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
 * Findet den Katalogeintrag zu einer Position, die keine `materialId` trägt.
 *
 * Solche Positionen gibt es wirklich: der Altbestand kennt sie, und auch eine
 * per Sprache erfasste Zeile kann den Verweis verlieren. Ohne diesen Weg
 * übersprang der Lagerabzug sie stillschweigend — der Buchbestand lief dann
 * langsam gegen die Wirklichkeit, und zwar nach oben, ohne dass es je jemand
 * bemerkt hätte.
 *
 * Läuft VOR der Transaktion: eine Firestore-Transaktion darf einzelne
 * Dokumente lesen, aber nicht suchen.
 */
async function resolveMaterialId(order: MaterialOrder): Promise<string | null> {
  if (order.materialId) return order.materialId;
  const name = (order.materialName ?? '').trim();
  if (!name) return null;
  const hits = await queryTenant<{ name: string }>(
    'materials',
    order.companyId,
    where('name', '==', name),
  );
  // Bei zwei gleichnamigen Katalogeinträgen ist nicht entscheidbar, welcher
  // gemeint war. Dann lieber gar nichts abziehen als das Falsche.
  return hits.length === 1 ? hits[0].id : null;
}

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

  // Zuerst lesen, um ggf. den Katalogeintrag über den Namen zu finden. Die
  // Transaktion prüft danach erneut — sie entscheidet, nicht dieser Blick.
  const pre = await getDoc(orderRef);
  const preOrder = pre.exists() ? ({ ...pre.data(), id: pre.id } as MaterialOrder) : null;
  const resolvedId =
    preOrder && !preOrder.processed && preOrder.transactionType !== 'return'
      ? await resolveMaterialId(preOrder)
      : null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return;
    const order = snap.data() as MaterialOrder;
    if (order.processed) {
      tx.update(orderRef, { status: 'Erledigt', updatedAt: serverTimestamp() });
      return;
    }
    const matId = order.materialId || resolvedId;
    if (matId && order.transactionType !== 'return') {
      const matRef = doc(db, 'materials', matId);
      const matSnap = await tx.get(matRef);
      if (matSnap.exists()) {
        // Gerechnet statt increment(-x), damit bei null Schluss ist. Ein
        // negativer Lagerstand ist keine Aussage über ein Lager, sondern ein
        // Zeichen, dass die Buchführung nicht mehr stimmt — dann lieber die
        // ehrliche Null, die im Bestand sofort als „knapp" auffällt.
        const cur = Number((matSnap.data() as { stock?: number }).stock ?? 0);
        tx.update(matRef, { stock: Math.max(0, cur - (order.quantity || 0)) });
      }
    }
    tx.update(orderRef, {
      status: 'Erledigt',
      processed: true,
      // Den tatsächlich verwendeten Katalogeintrag festhalten: sonst müsste
      // jede spätere Auswertung dieselbe Namenssuche wiederholen.
      ...(matId && !order.materialId ? { materialId: matId } : {}),
      updatedAt: serverTimestamp(),
    });
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
  if (ret.condition === 'neu') {
    // Auch hier über den Namen, wenn kein Verweis mitkam: eine Retoure, die
    // nicht zurückgebucht wird, ist Material, das im Regal steht und in den
    // Büchern fehlt.
    const matId = await resolveMaterialId({
      ...ret,
      companyId,
      id,
      status: 'Erledigt',
      transactionType: 'return',
    } as MaterialOrder);
    if (matId) {
      const matRef = doc(db, 'materials', matId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(matRef);
        if (snap.exists()) tx.update(matRef, { stock: increment(ret.quantity || 0) });
      });
    }
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

/**
 * Nur die eigenen Bestellungen. Für Zähler auf dem Dashboard — ein Monteur
 * muss dafür nicht die Bestellungen aller Kollegen laden.
 */
export function listOwnOrders(companyId: string, uid: string) {
  return queryTenant<MaterialOrder>(COLLECTION, companyId, where('userId', '==', uid));
}
