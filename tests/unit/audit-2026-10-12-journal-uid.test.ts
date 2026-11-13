/** Regressionsprüfung: Alt-Journal mit zwei namensgleichen, UID-verschiedenen Kunden. */
import { describe, it, expect } from 'vitest';
import { buildInvoiceCsv } from '@/features/invoices/buchhaltungExport';
import type { Customer, Invoice } from '@/types';
const rechnung: Invoice = {
  id: 'audit-alt-rechnung', companyId: 'audit', invoiceNumber: 'RE-2026-0001',
  projectNumber: 'BAU-001', customerName: 'Muster GmbH', invoiceDate: '2026-08-15',
  dueDate: '2026-08-29', totalNetto: 100, totalVat: 20, totalBrutto: 120,
  vatRate: 0.2, paymentStatus: 'Offen',
};
const kunde = (id: string, vatId: string): Customer => ({
  id, companyId: 'audit', name: 'Muster GmbH', vatId,
});
describe('Audit: UID im Journal bei namensgleichen Kunden', () => {
  it('verwendet eine auf der Rechnung festgehaltene UID', () => {
    const r = { ...rechnung, customerVatId: 'ATU11111111' };
    const csv = buildInvoiceCsv([r], [kunde('a', 'ATU22222222')], '2026-08-01', '2026-08-31').csv;
    expect(csv).toContain('ATU11111111');
  });
  it.fails('verändert ohne UID-Snapshot die UID nicht allein durch Umordnen zweier gleichnamiger Kunden', () => {
    const a = kunde('a', 'ATU11111111'), b = kunde('b', 'ATU22222222');
    const vonBis = ['2026-08-01', '2026-08-31'] as const;
    const erster = buildInvoiceCsv([rechnung], [a, b], ...vonBis).csv;
    const zweiter = buildInvoiceCsv([rechnung], [b, a], ...vonBis).csv;
    expect(erster).toBe(zweiter);
  });
});
