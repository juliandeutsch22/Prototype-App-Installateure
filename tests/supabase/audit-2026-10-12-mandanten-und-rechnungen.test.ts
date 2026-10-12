/**
 * Audit: konservative End-to-End-Gegenprobe gegen den ISOLIERTEN CI-Supabase-Stack.
 * Keine Produktivtabellen, keine externer Aufruf, keine Schemaänderungen.
 * Ergänzt – ersetzt nicht – die umfangreichen bestehenden RLS-Tests.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const A = 'audit-qa-a';
const B = 'audit-qa-b';
let monteurA: Konto;
let buchhaltungA: Konto;
let monteurB: Konto;
let fremderKunde = '';
let rechnungA = '';

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  monteurA = await konto(A, 'Mitarbeiter', 'audit-mon-a');
  buchhaltungA = await konto(A, 'Buchhaltung', 'audit-buch-a');
  monteurB = await konto(B, 'Mitarbeiter', 'audit-mon-b');
  const { data: kunde, error: fehlerKunde } = await admin.from('customers')
    .insert({ company_id: A, name: 'Auditkunde A', address: 'Prüfweg 1' })
    .select('id').single();
  if (fehlerKunde) throw fehlerKunde;
  fremderKunde = kunde!.id;
  const { data: rechnung, error: fehlerRechnung } = await admin.from('invoices')
    .insert({
      company_id: A, invoice_number: 'RE-AUDIT-1',
      project_number: 'AUDIT-1', customer_name: 'Auditkunde A',
      invoice_date: '2026-10-12', due_date: '2026-10-26',
      total_netto: 100, total_vat: 20, total_brutto: 120,
      payment_status: 'Offen',
    }).select('id').single();
  if (fehlerRechnung) throw fehlerRechnung;
  rechnungA = rechnung!.id;
}, 180_000);

describe('Audit: RLS – Daten des anderen Betriebs bleiben getrennt', () => {
  it('zeigt Kunden eines anderen Betriebs auch bei bekannter Kennung nicht', async () => {
    const { data, error } = await monteurB.client.from('customers')
      .select('id').eq('id', fremderKunde);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('kann einen fremden Kunden nicht ändern', async () => {
    const { data, error } = await monteurB.client.from('customers')
      .update({ name: 'Unerlaubt' }).eq('id', fremderKunde).select('id');
    expect(error === null && (data?.length ?? 0) === 0 || error !== null).toBe(true);
    const { data: nachher } = await admin.from('customers').select('name').eq('id', fremderKunde).single();
    expect(nachher?.name).toBe('Auditkunde A');
  });

  it('verweigert dem eigenen Monteur das Lesen von Rechnungen', async () => {
    const { data, error } = await monteurA.client.from('invoices').select('id').eq('id', rechnungA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('erlaubt der zuständigen Buchhaltung dieselbe Rechnung zu lesen', async () => {
    const { data, error } = await buchhaltungA.client.from('invoices').select('id').eq('id', rechnungA);
    expect(error).toBeNull();
    expect(data?.map((r) => r.id)).toContain(rechnungA);
  });

  it('verhindert mandantenfremde Rechnungsleserechte auch für andere Rollen', async () => {
    const { data, error } = await monteurB.client.from('invoices').select('id').eq('id', rechnungA);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
