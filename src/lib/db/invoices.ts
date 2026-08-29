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
import { queryTenant, subscribeTenant, createInTenant, updateInTenant, type WithId } from './core';

const COLLECTION = 'invoices';

/** Einmaliges Laden aller Rechnungen des Mandanten (z. B. Dashboard). */
export function listInvoices(companyId: string) {
  return queryTenant<Invoice>(COLLECTION, companyId);
}

export function subscribeInvoices(
  companyId: string,
  cb: (rows: WithId<Invoice>[]) => void,
  onError: (e: Error) => void,
) {
  return subscribeTenant<Invoice>(COLLECTION, companyId, cb, onError);
}

/** Nächste Rechnungsnummer RE-YYYY-NNNN aus bestehenden ableiten (max+1). */
/**
 * Nächste freie Rechnungsnummer im Format RE-JJJJ-NNNN.
 *
 * Startet bei 1001, sofern noch nichts existiert — läuft aber NICHT auf 1000
 * hoch, wenn ein Betrieb bereits einen niedrigeren Nummernkreis nutzt: sonst
 * entstünden Lücken in der fortlaufenden Nummerierung, die steuerlich
 * begründet werden müssten.
 */
export function nextInvoiceNumber(existing: Invoice[]): string {
  const year = new Date().getFullYear();
  let max = 0;
  for (const inv of existing) {
    const m = /(\d+)$/.exec(inv.invoiceNumber ?? '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  const next = max > 0 ? max + 1 : 1001;
  return `RE-${year}-${String(next).padStart(4, '0')}`;
}

/** Prüft, ob eine Nummer bereits vergeben ist (Stornos zählen mit). */
export function isInvoiceNumberTaken(existing: Invoice[], number: string, exceptId?: string) {
  const n = number.trim().toLowerCase();
  return existing.some((i) => i.invoiceNumber?.toLowerCase() === n && i.id !== exceptId);
}

/**
 * Hebt einen Storno wieder auf. Ein Fehlstorno war sonst nur durch Löschen
 * und vollständiges Neuerstellen zu heilen — inklusive neuer Nummer.
 */
export async function reactivateInvoice(inv: WithId<Invoice>) {
  await updateInTenant(COLLECTION, inv.id, {
    paymentStatus: 'Offen',
    cancellationNote: null,
    cancelledAt: null,
  });
  await markBilled('timeEntries', inv.linkedEntries ?? [], inv.invoiceNumber);
  await markBilled('materialOrders', inv.linkedOrders ?? [], inv.invoiceNumber);
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
