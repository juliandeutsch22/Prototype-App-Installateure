import { beforeAll, afterAll, expect, it } from 'vitest';
import { admin, betriebAnlegen, konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listInvoicesInRange } from '@/lib/db/pg/invoices';

const betrieb = 'rechnungsarchiv-gross';
const anzahl = 12001;
beforeAll(async () => {
  await betriebAnlegen(betrieb);
  const chef = await konto(betrieb, 'Geschäftsführung', 'rechnungsarchiv-gross');
  const rechnungen = Array.from({ length: anzahl }, (_, i) => ({
    id: crypto.randomUUID(), company_id: betrieb, invoice_number: `RE-2026-${i}`,
    project_number: 'B-1', customer_name: 'Archivkunde', invoice_date: '2026-01-01',
    due_date: '2026-02-01', total_netto: 100, total_vat: 20, total_brutto: 120,
    payment_status: 'Bezahlt', vat_rate: 0.2,
  }));
  for (const [tabelle, zeilen] of [
    ['invoices', rechnungen],
    ['invoice_lines', rechnungen.map((r) => ({ company_id: betrieb, invoice_id: r.id,
      position: 0, label: r.invoice_number, qty: 1, unit: 'h', unit_price: 100, netto: 100 }))],
    ['invoice_coverage', rechnungen.map((r) => ({ company_id: betrieb, invoice_id: r.id,
      art: 'time_entry', ziel_id: crypto.randomUUID() }))],
  ] as const) {
    const r = await admin.from(tabelle).insert(zeilen as Record<string, unknown>[]);
    if (r.error) throw r.error;
  }
  clientEinreichen(chef.client);
});
afterAll(() => clientEinreichen(null));

it('lädt alle 12.001 Archiv-Rechnungen samt Positionen und Abdeckung ohne überlange Adressen', async () => {
  const alle = await listInvoicesInRange(betrieb, '2026-01-01', '2026-12-31');
  expect(alle).toHaveLength(anzahl);
  expect(new Set(alle.map((r) => r.id)).size).toBe(anzahl);
  expect(alle.every((r) => r.positions?.length === 1 && r.positions[0].label === r.invoiceNumber)).toBe(true);
  expect(alle.every((r) => r.linkedEntries?.length === 1)).toBe(true);
  expect(await listInvoicesInRange(betrieb, '2025-01-01', '2025-12-31')).toEqual([]);
});
