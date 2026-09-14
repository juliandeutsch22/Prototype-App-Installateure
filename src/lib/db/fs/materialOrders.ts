import {
  collection,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { writeWithOfflineNotice } from '@/lib/offlineWrite';
import type { MaterialOrder } from '@/types';
import { queryTenant, subscribeTenant, createInTenant, stripUndefined, type WithId } from './core';

const COLLECTION = 'materialOrders';

/**
 * Eigene Anforderungen, neueste zuerst, mit Obergrenze.
 *
 * Ein Monteur fordert ueber die Jahre hunderte Male Material an. Angesehen
 * wird davon, was gerade laeuft — die Anforderung von vorletztem Maerz
 * interessiert niemanden mehr, wurde aber mitgeladen und im Speicher
 * gehalten.
 */
export function subscribeOwnOrders(
  companyId: string,
  uid: string,
  max: number,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<MaterialOrder>(
    COLLECTION,
    companyId,
    cb,
    onError,
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
}

/**
 * Alle Anforderungen des Mandanten, neueste zuerst, mit Obergrenze.
 *
 * Die Sortierung war schon da, die Grenze fehlte — und ohne Grenze bringt
 * eine Sortierung nichts: es wurde trotzdem jede Anforderung des Betriebs
 * geladen, nur eben in der richtigen Reihenfolge.
 */
export function subscribeAllOrders(
  companyId: string,
  max: number,
  cb: (rows: WithId<MaterialOrder>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<MaterialOrder>(
    COLLECTION,
    companyId,
    cb,
    onError,
    orderBy('createdAt', 'desc'),
    limit(max),
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

/**
 * Retoure (docs §4.3): direkt 'Erledigt'; bei condition 'neu' Rückbuchung.
 *
 * BELEG UND GUTSCHRIFT IN EINEM SCHRITT. Vorher wurde erst der Beleg
 * geschrieben und danach, in einem zweiten Vorgang, der Bestand
 * gutgeschrieben. Scheiterte der zweite — kein Empfang, abgelaufene Regel —,
 * dann stand der Beleg schon in der Datenbank, mit `processed: true`, und der
 * Bestand war trotzdem nicht erhöht. Die Ansicht meldete daraufhin „Die
 * Retoure konnte nicht erfasst werden", was schlicht nicht stimmte: erfasst
 * war sie. Wer es daraufhin noch einmal versuchte, legte einen ZWEITEN Beleg
 * an — und wenn diesmal beides klappte, standen zwei Retouren im Buch und
 * eine Gutschrift im Lager.
 *
 * Die Suche nach dem Katalogeintrag läuft weiterhin VOR der Transaktion: eine
 * Firestore-Transaktion darf einzelne Dokumente lesen, aber nicht suchen.
 */
export async function createReturn(
  companyId: string,
  ret: Omit<NewMaterialOrder, 'status' | 'transactionType'> & { condition: string },
) {
  const beleg = {
    ...ret,
    status: 'Erledigt' as const,
    transactionType: 'return' as const,
    processed: true,
  };

  // Auch hier über den Namen, wenn kein Verweis mitkam: eine Retoure, die
  // nicht zurückgebucht wird, ist Material, das im Regal steht und in den
  // Büchern fehlt.
  const matId =
    ret.condition === 'neu'
      ? await resolveMaterialId({ ...beleg, companyId, id: '' } as MaterialOrder)
      : null;

  const belegRef = doc(collection(db, COLLECTION));
  await runTransaction(db, async (tx) => {
    // Lesen VOR jedem Schreiben — Firestore lässt in einer Transaktion nach
    // dem ersten Schreibvorgang keinen Lesevorgang mehr zu.
    const matRef = matId ? doc(db, 'materials', matId) : null;
    const matSnap = matRef ? await tx.get(matRef) : null;

    tx.set(belegRef, {
      ...stripUndefined(beleg),
      companyId,
      createdAt: serverTimestamp(),
      // Den tatsächlich gutgeschriebenen Katalogeintrag festhalten, damit
      // eine spätere Auswertung die Namenssuche nicht wiederholen muss.
      ...(matId && !beleg.materialId ? { materialId: matId } : {}),
    });
    if (matRef && matSnap?.exists()) {
      tx.update(matRef, { stock: increment(ret.quantity || 0) });
    }
  });
  return belegRef.id;
}

export function deleteOrder(orderId: string) {
  return deleteDoc(doc(db, COLLECTION, orderId));
}

/**
 * Die OFFENEN Anforderungen des Betriebs — fuer die Startseite.
 *
 * Die Startseite zeigt, was auf die Projektleitung wartet. „Erledigt" wartet
 * auf niemanden, wurde aber mitgeladen und erst im Browser weggefiltert:
 * nach ein paar Jahren die gesamte Bestellhistorie, um eine kurze Liste zu
 * zeigen. Offene Anforderungen sind von Natur aus wenige.
 */
export function listOpenOrders(companyId: string) {
  return queryTenant<MaterialOrder>(
    COLLECTION,
    companyId,
    where('status', 'in', ['Offen', 'In Bearbeitung', 'Abholbereit']),
  );
}

/** Die offenen Anforderungen EINES Mitarbeiters, gleiche Begruendung. */
export function listOwnOpenOrders(companyId: string, uid: string) {
  return queryTenant<MaterialOrder>(
    COLLECTION,
    companyId,
    where('userId', '==', uid),
    where('status', 'in', ['Offen', 'In Bearbeitung', 'Abholbereit']),
  );
}

/** Wie in `pg/` benannt; hier trägt es Firestore selbst. Fällt mit Stufe 9 weg. */
export function createMaterialOrderOhneEmpfang(companyId: string, order: NewMaterialOrder) {
  return writeWithOfflineNotice(createMaterialOrder(companyId, order));
}
