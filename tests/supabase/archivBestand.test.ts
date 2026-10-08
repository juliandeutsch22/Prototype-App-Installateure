import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listQuotesInRange, listRecentQuotes } from '@/lib/db/pg/quotes';
import { listWorkSheetsForArchive } from '@/lib/db/pg/workSheets';

const betrieb = 'archiv-gross';
const anzahl = 601;
let chef: Konto;
beforeAll(async () => {
  await betriebAnlegen(betrieb);
  chef = await konto(betrieb, 'Geschäftsführung', 'archiv-gross');
  const angebote = Array.from({ length: anzahl }, (_, i) => ({
    id: crypto.randomUUID(), company_id: betrieb, quote_number: `AN-2026-${i}`,
    customer_name: 'Archivkunde', quote_date: '2026-01-01', valid_until: '2026-02-01',
    status: 'Versendet', vat_rate: 0.2,
  }));
  const scheine = angebote.map(() => ({ id: crypto.randomUUID(), company_id: betrieb,
    project_number: 'B-1', customer_name: 'Archivkunde', datum: '2026-01-01',
    status: 'Entwurf', abrechnung: 'Regie',
    erstellt_von_uid: chef.uid, erstellt_von_name: 'Archivchef',
  }));
  for (const [tabelle, zeilen] of [
    ['quotes', angebote], ['work_sheets', scheine],
    ['quote_lines', angebote.map((q) => ({ company_id: betrieb, quote_id: q.id,
      position: 0, label: q.quote_number, qty: 1, unit: 'h', unit_price: 100, netto: 100 }))],
    ['work_sheet_hours', scheine.map((s) => ({ company_id: betrieb, work_sheet_id: s.id,
      position: 0, datum: '2026-01-01', mitarbeiter: 'Archivchef', minuten: 60 }))],
  ] as const) {
    const r = await admin.from(tabelle).insert(zeilen as Record<string, unknown>[]);
    if (r.error) throw r.error;
  }
  for (let i = 0; i < scheine.length; i += 100) {
    const ids = scheine.slice(i, i + 100).map((s) => s.id);
    const r = await admin.from('work_sheets').update({ status: i % 200 ? 'Unterschrieben' : 'Storniert' }).in('id', ids);
    if (r.error) throw r.error;
  }
  clientEinreichen(chef.client);
});
afterAll(() => clientEinreichen(null));

describe('Belegarchiv über die Arbeitslisten- und HTTP-Grenzen hinweg', () => {
  it('holt alle 601 Angebote samt Positionen, lässt die Arbeitsliste bei 100', async () => {
    const alle = await listQuotesInRange(betrieb, '2026-01-01', '2026-12-31');
    expect(alle).toHaveLength(anzahl);
    expect(new Set(alle.map((q) => q.id)).size).toBe(anzahl);
    expect(alle.every((q) => q.positions.length === 1 && q.positions[0].label === q.quoteNumber)).toBe(true);
    expect(await listRecentQuotes(betrieb)).toHaveLength(100);
    expect(await listQuotesInRange(betrieb, '2025-01-01', '2025-12-31')).toEqual([]);
  });
  it('holt alle unterschriebenen und stornierten Scheine samt Zeiten', async () => {
    const alle = await listWorkSheetsForArchive(betrieb, '2026-01-01', '2026-12-31');
    expect(alle).toHaveLength(anzahl);
    expect(new Set(alle.map((s) => s.id)).size).toBe(anzahl);
    expect(alle.every((s) => s.zeiten.length === 1 && s.zeiten[0].minuten === 60)).toBe(true);
  });
});
