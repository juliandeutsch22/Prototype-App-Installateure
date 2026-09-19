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
import type { WithId } from './core';
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
  return pg.listUnpaidInvoices(companyId);
}

export function subscribeRecentInvoices(
  companyId: string,
  max: number,
  cb: (rows: WithId<Invoice>[]) => void,
  onError: (e: Error) => void,
): () => void {
  return pg.subscribeRecentInvoices(companyId, max, cb, onError);
}

export function listInvoicesInRange(
  companyId: string, von: string, bis: string,
): Promise<WithId<Invoice>[]> {
  return pg.listInvoicesInRange(companyId, von, bis);
}

export function reserveInvoiceNumber(
  companyId: string, opts: { seedFrom: number; desired?: number; praefix?: string },
): Promise<string> {
  return pg.reserveInvoiceNumber(companyId, opts);
}

export function createInvoice(companyId: string, inv: NewInvoice): Promise<string> {
  return pg.createInvoice(companyId, inv);
}

export type { SetzbarerStand } from './pg/invoices';

export function updateInvoiceStatus(
  id: string, paymentStatus: pg.SetzbarerStand,
): Promise<void> {
  return pg.updateInvoiceStatus(id, paymentStatus);
}

export function cancelInvoice(inv: WithId<Invoice>, note: string): Promise<void> {
  return pg.cancelInvoice(inv, note);
}

export function reactivateInvoice(inv: WithId<Invoice>): Promise<void> {
  return pg.reactivateInvoice(inv);
}

export function mahnungFesthalten(
  id: string,
  daten: {
    stufe: number; gemahntAm: string; frist: string; spesen: number;
    standJetzt: Invoice['paymentStatus'];
  },
): Promise<void> {
  return pg.mahnungFesthalten(id, daten);
}

export function markBilled(
  coll: string, ids: string[], invoiceNumber: string,
): Promise<void> {
  return pg.markBilled(coll, ids, invoiceNumber);
}

export type { WithId };
