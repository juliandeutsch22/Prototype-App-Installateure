/**
 * Rechnungen — nur die Weiche.
 *
 * `deleteInvoice` GIBT ES NICHT, und zwar ersatzlos. § 132 BAO verlangt
 * sieben Jahre Aufbewahrung, und die gezogene Nummer hinterliesse eine Lücke
 * im Kreis, die der Buchhaltungs-Export danach zu Recht meldet. Die Korrektur
 * heisst Storno: der Beleg bleibt stehen, trägt seinen Grund und lässt sich
 * mit `reactivateInvoice` wieder aufheben. Beide Datenquellen sagen dasselbe
 * — `allow delete: if false` in den Regeln, keine Löschrichtlinie im Schema.
 */
import type { Invoice } from '@/types';
import { nutztPostgres } from './quelle';
import type { WithId } from './core';
import * as fs from './fs/invoices';
import * as pg from './pg/invoices';

// Die reinen Rechenregeln liegen in lib/invoiceNumbers — ohne Datenbank und
// damit ohne Stack prüfbar. Hier durchgereicht, damit die Aufrufer wie bisher
// aus einem Modul importieren.
export {
  nextInvoiceNumber,
  isInvoiceNumberTaken,
  highestInvoiceSeq,
  invoiceSeqOf,
  formatInvoiceNumber,
  decideInvoiceSeq,
} from '@/lib/invoiceNumbers';

export type NewInvoice = Omit<Invoice, 'id' | 'companyId' | 'createdAt'>;

export function listUnpaidInvoices(companyId: string): Promise<WithId<Invoice>[]> {
  return nutztPostgres() ? pg.listUnpaidInvoices(companyId) : fs.listUnpaidInvoices(companyId);
}

export function subscribeRecentInvoices(
  companyId: string,
  max: number,
  cb: (rows: WithId<Invoice>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return nutztPostgres()
    ? pg.subscribeRecentInvoices(companyId, max, cb, onError)
    : fs.subscribeRecentInvoices(companyId, max, cb, onError);
}

export function listInvoicesInRange(
  companyId: string, von: string, bis: string,
): Promise<WithId<Invoice>[]> {
  return nutztPostgres()
    ? pg.listInvoicesInRange(companyId, von, bis)
    : fs.listInvoicesInRange(companyId, von, bis);
}

export function reserveInvoiceNumber(
  companyId: string, opts: { seedFrom: number; desired?: number; praefix?: string },
): Promise<string> {
  return nutztPostgres()
    ? pg.reserveInvoiceNumber(companyId, opts)
    : fs.reserveInvoiceNumber(companyId, opts);
}

export function createInvoice(companyId: string, inv: NewInvoice): Promise<string> {
  return nutztPostgres() ? pg.createInvoice(companyId, inv) : fs.createInvoice(companyId, inv);
}

export function updateInvoiceStatus(
  id: string, paymentStatus: Invoice['paymentStatus'],
): Promise<void> {
  return nutztPostgres()
    ? pg.updateInvoiceStatus(id, paymentStatus)
    : fs.updateInvoiceStatus(id, paymentStatus);
}

export function cancelInvoice(inv: WithId<Invoice>, note: string): Promise<void> {
  return nutztPostgres() ? pg.cancelInvoice(inv, note) : fs.cancelInvoice(inv, note);
}

export function reactivateInvoice(inv: WithId<Invoice>): Promise<void> {
  return nutztPostgres() ? pg.reactivateInvoice(inv) : fs.reactivateInvoice(inv);
}

export function mahnungFesthalten(
  id: string,
  daten: { stufe: number; gemahntAm: string; frist: string; spesen: number },
): Promise<void> {
  return nutztPostgres() ? pg.mahnungFesthalten(id, daten) : fs.mahnungFesthalten(id, daten);
}

export function markBilled(
  coll: string, ids: string[], invoiceNumber: string,
): Promise<void> {
  return nutztPostgres()
    ? pg.markBilled(coll, ids, invoiceNumber)
    : fs.markBilled(coll, ids, invoiceNumber);
}

export type { WithId };
