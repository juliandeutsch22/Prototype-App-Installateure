/**
 * Rechnungen suchen und in der Kundenakte — gegen die echte Datenbank.
 *
 * Die Liste lädt nur die jüngsten Rechnungen; die Suche geht über alle. Und
 * die Kundenakte findet die Rechnungen eines Kunden über seine Baustellen —
 * eine Rechnung trägt den Namen als Text, nicht die Kundenkennung.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listInvoicesForCustomer, sucheRechnungen } from '@/lib/db/pg/invoices';

const BETRIEB = 'rechnungen-suche';
const FREMD = 'rechnungen-suche-fremd';

let buch: Konto;
let huber: string;
let baustelleHuber: string;
let baustelleMaier: string;

async function rechnung(betrieb: string, nummer: string, felder: Record<string, unknown>) {
  const { error } = await admin.from('invoices').insert({
    company_id: betrieb, invoice_number: nummer, invoice_date: '2025-03-10', due_date: '2025-03-24',
    total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen', ...felder,
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'rsbuch');
  clientEinreichen(buch.client);

  const k = await admin.from('customers').insert({ company_id: BETRIEB, name: 'Familie Huber' })
    .select('id').single();
  huber = k.data!.id;
  const p1 = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: '2025-007', customer_name: 'Familie Huber', customer_id: huber, status: 'Aktiv',
  }).select('id').single();
  baustelleHuber = p1.data!.id;
  const p2 = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: '2025-008', customer_name: 'Maier', status: 'Aktiv',
  }).select('id').single();
  baustelleMaier = p2.data!.id;

  await rechnung(BETRIEB, 'RE-2025-1001', { project_number: '2025-007', customer_name: 'Familie Huber' });
  // Unter dem ALTEN Namen, vor einer Umbenennung — gehört trotzdem dazu.
  await rechnung(BETRIEB, 'RE-2025-1002', { project_number: '2025-007', customer_name: 'Huber Franz' });
  await rechnung(BETRIEB, 'RE-2025-1003', { project_number: '2025-008', customer_name: 'Maier' });
  // Gleicher Name, fremder Betrieb.
  await rechnung(FREMD, 'RE-2025-1001', { project_number: '2025-007', customer_name: 'Familie Huber' });
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Rechnungen suchen', () => {
  it('findet nach Nummer, Kunde und Baustelle — auch mitten im Wort', async () => {
    expect((await sucheRechnungen(BETRIEB, '1003')).map((r) => r.invoiceNumber)).toEqual(['RE-2025-1003']);
    expect((await sucheRechnungen(BETRIEB, 'uber')).map((r) => r.invoiceNumber).sort())
      .toEqual(['RE-2025-1001', 'RE-2025-1002']);
    expect((await sucheRechnungen(BETRIEB, '2025-008')).map((r) => r.customerName)).toEqual(['Maier']);
  });

  it('nur im eigenen Betrieb, und ein leerer Begriff sucht nichts', async () => {
    expect(await sucheRechnungen(BETRIEB, 'RE-2025-1001')).toHaveLength(1);
    expect(await sucheRechnungen(BETRIEB, '  ')).toEqual([]);
  });

  it('übersteht Satzzeichen im Begriff', async () => {
    await expect(sucheRechnungen(BETRIEB, 'Huber, Franz (alt)')).resolves.toEqual([]);
  });
});

describe('Die Rechnungen eines Kunden', () => {
  it('über seine Baustellen — auch unter einem alten Namen', async () => {
    const r = await listInvoicesForCustomer(BETRIEB, huber, [baustelleHuber]);
    expect(r.map((x) => x.invoiceNumber).sort()).toEqual(['RE-2025-1001', 'RE-2025-1002']);
  });

  it('und über die Kundenkennung, wo sie auf der Rechnung steht', async () => {
    await rechnung(BETRIEB, 'RE-2025-1004', {
      project_number: '2025-008', customer_name: 'Familie Huber', customer_id: huber,
    });
    const r = await listInvoicesForCustomer(BETRIEB, huber, [baustelleHuber]);
    expect(r.map((x) => x.invoiceNumber)).toContain('RE-2025-1004');
    expect(r.map((x) => x.invoiceNumber)).not.toContain('RE-2025-1003');
  });

  it('ohne Baustellen und mit einer ungültigen Kennung findet sie nichts Falsches', async () => {
    expect((await listInvoicesForCustomer(BETRIEB, huber, [])).map((x) => x.invoiceNumber))
      .toEqual(['RE-2025-1004']);
    expect(await listInvoicesForCustomer(BETRIEB, 'kein-uuid,or(1.eq.1)', [baustelleMaier])).toEqual([]);
  });
});
