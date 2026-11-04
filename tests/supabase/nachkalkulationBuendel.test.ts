/**
 * DIE NACHKALKULATION FRAGT IN EINEM ZUG (Auftrag 03.11.2026: „lädt im
 * Vergleich zu den anderen sehr langsam“).
 *
 * Scheine, Rechnungen und Angebote mehrerer Baustellen kommen seither aus je
 * einer Abfrage statt aus einer je Baustelle. Geprüft wird hier gegen die
 * echte Datenbank, dass dabei GENAU DASSELBE herauskommt wie aus den
 * Einzelabfragen zusammen: dieselben Belege mit denselben Zeilen, auch in der
 * Schreibweise „PR-“ aus Altbeständen — und nichts von einer Baustelle, nach
 * der nicht gefragt war.
 *
 * Gegenprobe: ohne die neuen Abfragen schlägt die Datei fehl (sie fehlen);
 * gleich bleiben die Einzelabfragen, mit denen verglichen wird.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as scheine from '@/lib/db/pg/workSheets';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as angebote from '@/lib/db/pg/quotes';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'nk-buendel';
let chef: Konto;
const projekt: Record<string, string> = {};

const nachId = <T extends { id: string }>(liste: T[]) => [...liste].sort((a, b) => a.id.localeCompare(b.id));

async function einfuegen(tabelle: string, zeilen: Record<string, unknown>[]): Promise<{ id: string }[]> {
  const { data, error } = await admin.from(tabelle).insert(zeilen).select('id');
  if (error) throw new Error(`${tabelle}: ${error.message}`);
  return data as { id: string }[];
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'nkbchef');
  clientEinreichen(chef.client);

  // Drei Baustellen; gefragt wird nach zweien.
  for (const nr of ['NK-1', 'NK-2', 'NK-3']) {
    const [p] = await einfuegen('projects', [{ company_id: BETRIEB, project_number: nr, customer_name: `Kunde ${nr}`, status: 'Abgeschlossen' }]);
    projekt[nr] = p.id;
  }

  // Scheine: NK-2 auch einmal in der alten Schreibweise mit „PR-“.
  const schein = (nr: string, datum: string) => ({
    company_id: BETRIEB, project_number: nr, customer_name: 'Kunde', datum, status: 'Entwurf', abrechnung: 'Regie',
    erstellt_von_uid: chef.uid, erstellt_von_name: 'Chefin', id: crypto.randomUUID(),
  });
  const s = await einfuegen('work_sheets', [
    schein('NK-1', '2026-10-01'), schein('NK-1', '2026-10-02'), schein('NK-2', '2026-10-03'),
    schein('PR-NK-2', '2026-10-04'), schein('NK-3', '2026-10-05'),
  ]);
  await einfuegen('work_sheet_material', s.map((x, i) => ({
    company_id: BETRIEB, work_sheet_id: x.id, position: 1, name: `Artikel ${i}`, menge: i + 1, einheit: 'Stk',
  })));

  const rechnung = (nr: string, nummer: string) => ({
    company_id: BETRIEB, invoice_number: nummer, project_number: nr, customer_name: 'Kunde', invoice_date: '2026-10-20',
    due_date: '2026-11-03', total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
  });
  const r = await einfuegen('invoices', [
    rechnung('NK-1', 'NKB-1'), rechnung('PR-NK-2', 'NKB-2'), rechnung('NK-2', 'NKB-3'), rechnung('NK-3', 'NKB-4'),
  ]);
  await einfuegen('invoice_lines', r.map((x) => ({
    company_id: BETRIEB, invoice_id: x.id, position: 1, label: 'Leistung', qty: 1, unit: 'Pausch.', unit_price: 100, netto: 100,
  })));

  const angebot = (nr: string, nummer: string, status: string) => ({
    company_id: BETRIEB, quote_number: nummer, customer_name: 'Kunde', quote_date: '2026-09-01', valid_until: '2026-10-01',
    status, vat_rate: 0.2, project_id: projekt[nr], project_number: nr,
  });
  const q = await einfuegen('quotes', [
    angebot('NK-1', 'NKA-1', 'Abgelehnt'), angebot('NK-1', 'NKA-2', 'Angenommen'), angebot('NK-2', 'NKA-3', 'Angenommen'),
    angebot('NK-3', 'NKA-4', 'Angenommen'),
  ]);
  await einfuegen('quote_lines', q.map((x) => ({
    company_id: BETRIEB, quote_id: x.id, position: 1, label: 'Heizkörper', qty: 1, unit: 'Stk', unit_price: 250, netto: 250,
  })));
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Nachkalkulation: Belege mehrerer Baustellen in einem Zug', () => {
  it('Scheine: dieselben wie je Baustelle geholt, mit Material, auch mit „PR-“ — ohne die dritte Baustelle', async () => {
    const zusammen = await scheine.listWorkSheetsForProjects(BETRIEB, ['NK-1', 'NK-2']);
    const einzeln = [
      ...(await scheine.listWorkSheetsForProject(BETRIEB, 'NK-1')),
      ...(await scheine.listWorkSheetsForProject(BETRIEB, 'NK-2')),
    ];
    expect(zusammen).toHaveLength(4);
    expect(nachId(zusammen)).toEqual(nachId(einzeln));
    expect(zusammen.every((x) => (x.material ?? []).length === 1)).toBe(true);
    expect(zusammen.some((x) => x.projectNumber === 'PR-NK-2')).toBe(true);
    expect(zusammen.some((x) => x.projectNumber === 'NK-3')).toBe(false);
  });

  it('Rechnungen: dieselben wie je Baustelle geholt, mit Positionen — ohne die dritte Baustelle', async () => {
    const zusammen = await rechnungen.listInvoicesForProjects(BETRIEB, ['NK-1', 'NK-2']);
    const einzeln = [
      ...(await rechnungen.listInvoicesForProject(BETRIEB, 'NK-1')),
      ...(await rechnungen.listInvoicesForProject(BETRIEB, 'NK-2')),
    ];
    expect(zusammen.map((x) => x.invoiceNumber).sort()).toEqual(['NKB-1', 'NKB-2', 'NKB-3']);
    expect(nachId(zusammen)).toEqual(nachId(einzeln));
    expect(zusammen.every((x) => (x.positions ?? []).length === 1)).toBe(true);
  });

  it('Angebote: über die Kennung, dieselben wie je Baustelle geholt — ohne die dritte Baustelle', async () => {
    const zusammen = await angebote.listQuotesForProjects(BETRIEB, [projekt['NK-1'], projekt['NK-2']]);
    const einzeln = [
      ...(await angebote.listQuotesForProject(BETRIEB, projekt['NK-1'])),
      ...(await angebote.listQuotesForProject(BETRIEB, projekt['NK-2'])),
    ];
    expect(zusammen.map((x) => x.quoteNumber).sort()).toEqual(['NKA-1', 'NKA-2', 'NKA-3']);
    expect(nachId(zusammen)).toEqual(nachId(einzeln));
    expect(zusammen.every((x) => (x.positions ?? []).length === 1)).toBe(true);
  });

  it('ohne Baustelle keine Abfrage und keine Belege', async () => {
    expect(await scheine.listWorkSheetsForProjects(BETRIEB, [])).toEqual([]);
    expect(await rechnungen.listInvoicesForProjects(BETRIEB, ['  '])).toEqual([]);
    expect(await angebote.listQuotesForProjects(BETRIEB, [])).toEqual([]);
  });
});
