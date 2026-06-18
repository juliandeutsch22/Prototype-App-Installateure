import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Invoice } from '@/types';
import { subscribeTenant, createInTenant, type WithId } from './core';

const COLLECTION = 'invoices';

export function subscribeInvoices(
  companyId: string,
  cb: (rows: WithId<Invoice>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<Invoice>(COLLECTION, companyId, cb, onError);
}

/** Nächste Rechnungsnummer RE-YYYY-NNNN aus bestehenden ableiten (max+1). */
export function nextInvoiceNumber(existing: Invoice[]): string {
  const year = new Date().getFullYear();
  let max = 1000;
  for (const inv of existing) {
    const m = /(\d+)$/.exec(inv.invoiceNumber ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `RE-${year}-${max + 1}`;
}

export type NewInvoice = Omit<Invoice, 'id' | 'companyId' | 'createdAt'>;

export function createInvoice(companyId: string, inv: NewInvoice) {
  return createInTenant(COLLECTION, companyId, inv);
}

export function updateInvoiceStatus(id: string, paymentStatus: Invoice['paymentStatus']) {
  return updateDoc(doc(db, COLLECTION, id), { paymentStatus, updatedAt: serverTimestamp() });
}

/** Storniert eine Rechnung und gibt die verknüpften Belege wieder frei. */
export async function cancelInvoice(inv: WithId<Invoice>, note: string) {
  await updateDoc(doc(db, COLLECTION, inv.id), {
    paymentStatus: 'Storniert',
    cancellationNote: note,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await releaseBilled('timeEntries', inv.linkedEntries ?? []);
  await releaseBilled('materialOrders', inv.linkedOrders ?? []);
}

export function deleteInvoice(id: string) {
  return deleteDoc(doc(db, COLLECTION, id));
}

/** Markiert Belege als verrechnet (isBilled + invoiceNumber). */
export async function markBilled(coll: string, ids: string[], invoiceNumber: string) {
  await Promise.all(
    ids.map((id) => updateDoc(doc(db, coll, id), { isBilled: true, invoiceNumber })),
  );
}

/** Gibt Belege wieder frei (Firestore kann Felder nicht löschen -> ''). */
async function releaseBilled(coll: string, ids: string[]) {
  await Promise.all(
    ids.map((id) => updateDoc(doc(db, coll, id), { isBilled: false, invoiceNumber: '' })),
  );
}

export { collection, addDoc };
