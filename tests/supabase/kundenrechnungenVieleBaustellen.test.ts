import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { createInvoice, listInvoicesForCustomer } from '@/lib/db/pg/invoices';

const BETRIEB = 'audit-kundenrechnungen';
let db: Client;
let kunde: string;
let baustellen: string[];
let rechnung: string;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  const buch = await konto(BETRIEB, 'Buchhaltung', 'kundenhistorie');
  clientEinreichen(buch.client);
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL
    ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  const k = await db.query(`insert into public.customers (company_id, name, address, kundenart)
    values ($1, 'Kunde', 'Hauptplatz 1, 8200 Gleisdorf', 'privat') returning id`, [BETRIEB]);
  kunde = k.rows[0].id;
  const p = await db.query(`insert into public.projects
    (company_id, project_number, customer_id, customer_name, status)
    select $1, 'B-' || g, $2::uuid, 'Kunde', 'Aktiv' from generate_series(1, 230) g
    returning id, project_number`, [BETRIEB, kunde]);
  baustellen = p.rows.map((p) => p.id);
  // Importierte Belege können eine Kundenkennung tragen, auch wenn das
  // heutige Rechnungsformular den Kunden über die Baustelle bestimmt.
  const daten: Parameters<typeof createInvoice>[1] & { customerId: string } = {
    invoiceNumber: 'RE-2026-1001', projectNumber: p.rows[229].project_number,
    customerId: kunde, customerName: 'Kunde', address: 'Hauptplatz 1, 8200 Gleisdorf',
    invoiceDate: '2026-10-08', dueDate: '2026-10-22', totalNetto: 100,
    totalVat: 20, totalBrutto: 120, vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
  };
  rechnung = await createInvoice(BETRIEB, daten);
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  await db?.end();
});

describe('Kundenakte mit vielen Baustellen', () => {
  it('findet die Rechnung auch mit 230 Baustellenkennungen, genau einmal', async () => {
    const liste = await listInvoicesForCustomer(BETRIEB, kunde, baustellen);
    expect(liste.map((r) => r.id)).toEqual([rechnung]);
  });

  it('findet die Rechnung weiterhin allein über die Kundenkennung', async () => {
    const liste = await listInvoicesForCustomer(BETRIEB, kunde, []);
    expect(liste.map((r) => r.id)).toEqual([rechnung]);
  });

  it('gibt mit ungültiger Kundenkennung weiterhin keine Daten zurück', async () => {
    expect(await listInvoicesForCustomer(BETRIEB, 'keine-kennung', baustellen)).toEqual([]);
  });

  it('behält über alle Teilabfragen genau die 500 jüngsten, mit stabilen Gleichständen', async () => {
    const { rows } = await db.query(`insert into public.invoices
      (company_id, invoice_number, project_number, customer_id, customer_name, address,
       invoice_date, due_date, total_netto, total_vat, total_brutto, vat_rate, payment_status)
      select $1, 'RE-PRUEF-' || g, p.project_number,
        case when g % 2 = 0 then $2::uuid else null end, 'Kunde', 'Hauptplatz 1, 8200 Gleisdorf',
        '2026-09-01'::date + (g % 30), '2026-11-01', 100, 20, 120, 0.2, 'Offen'
      from generate_series(1, 501) g join public.projects p
        on p.id = case when g % 2 = 0 then $3::uuid else $4::uuid end returning id`,
    [BETRIEB, kunde, baustellen[0], baustellen[229]]);
    // Importrechte wie beim Rücklauf einer Sicherung: gewöhnliche Aufrufer
    // dürfen einer ausgestellten Rechnung keine Positionen hinzufügen.
    const { error } = await admin.from('invoice_lines').insert(rows.map((r) => ({
      company_id: BETRIEB, invoice_id: r.id, position: 0, label: 'Leistung',
      qty: 1, unit: 'Pauschale', unit_price: 100, netto: 100,
    })));
    if (error) throw new Error(error.message);
    const erwartet = await db.query(`select id from public.invoices where company_id = $1
      order by invoice_date desc, id limit 500`, [BETRIEB]);
    const liste = await listInvoicesForCustomer(BETRIEB, kunde, [...baustellen, ...baustellen]);
    expect(liste.map((r) => r.id)).toEqual(erwartet.rows.map((r) => r.id));
    expect(new Set(liste.map((r) => r.id)).size).toBe(500);
    expect(liste.every((r) => r.positions?.length === 1)).toBe(true);
  });
});
