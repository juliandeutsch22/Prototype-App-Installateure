/**
 * „OFFEN“ IN DER ANGEBOTSLISTE AUS DER DATENBANK (Durchsicht 15.11.2026, A6).
 *
 * Vorher filterte die Liste nur die jüngsten hundert — ein altes versendetes
 * Angebot fiel still heraus. Hier: die Abfrage nach dem Zustand findet es
 * zuerst (älteste Bindefrist), die Zählung stimmt mit ihr überein, und ein
 * Teilindex trägt den Weg (`20261116042000`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listOffeneQuotes, listRecentQuotes, zaehleOffeneQuotes, zaehleQuotes } from '@/lib/db/pg/quotes';

const A = 'a6-offen';
let chefin: Konto;
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(A, 'Offen Installationen');
  chefin = await konto(A, 'Geschäftsführung', 'a6-chefin');
  const zeilen = [
    { quote_number: 'AN-A6-ALT', status: 'Versendet', valid_until: '2026-02-01', created_at: '2026-01-05T08:00:00Z' },
    ...Array.from({ length: 5 }, (_, i) => ({
      quote_number: `AN-A6-${i}`, status: 'Angenommen', valid_until: '2026-12-01', created_at: `2026-11-0${i + 1}T08:00:00Z`,
    })),
    { quote_number: 'AN-A6-NEU', status: 'Entwurf', valid_until: '2026-12-20', created_at: '2026-11-09T08:00:00Z' },
    { quote_number: 'AN-A6-WEG', status: 'Verworfen', valid_until: '2026-01-01', created_at: '2026-11-10T08:00:00Z' },
  ];
  const { error } = await admin.from('quotes').insert(zeilen.map((z) => ({
    company_id: A, customer_name: 'Familie Offen', quote_date: '2026-01-05', vat_rate: 0.2, ...z,
  })));
  if (error) throw new Error(error.message);
  clientEinreichen(chefin.client);
}, 60_000);
afterAll(async () => { clientEinreichen(null); await db?.end(); });

describe('Offene Angebote', () => {
  it('das alte versendete steht zuerst — auch wenn die jüngsten es nicht mehr enthalten', async () => {
    const juengste = await listRecentQuotes(A, 3);
    expect(juengste.map((q) => q.quoteNumber)).not.toContain('AN-A6-ALT');
    const offen = await listOffeneQuotes(A, 1);
    expect(offen.map((q) => q.quoteNumber)).toEqual(['AN-A6-ALT']);
    expect((await listOffeneQuotes(A, 10)).map((q) => q.quoteNumber)).toEqual(['AN-A6-ALT', 'AN-A6-NEU']);
  });

  it('die Zahl kommt aus derselben Bedingung; „alle“ ohne Papierkorb', async () => {
    expect(await zaehleOffeneQuotes(A)).toBe(2);
    expect(await zaehleQuotes(A)).toBe(7);
  });

  it('ein Teilindex trägt den Weg', async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where tablename = 'quotes' and indexname = 'quotes_offen_nach_frist'`);
    expect(rows[0]?.indexdef).toMatch(/\(company_id, valid_until\) WHERE \(status = ANY/);
  });
});
