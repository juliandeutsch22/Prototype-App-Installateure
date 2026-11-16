/**
 * DIE KÖPFE DER RECHNUNGSLISTEN (L6, Durchsicht 15.11.2026): alle Spalten von
 * `invoices` außer dem festgehaltenen Leistungsnachweis. Die Liste steht
 * ausdrücklich in `rechnungSpalten.ts`, weil PostgREST kein „alle außer“
 * kennt — kommt eine Spalte dazu, fiele sie in Liste, Startseite und Mahnlauf
 * still weg. Diese Prüfung vergleicht mit der Tabelle.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { KOPF_SPALTEN } from '@/lib/db/pg/rechnungSpalten';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });

beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

describe('Kopfspalten der Rechnungslisten', () => {
  it('jede Spalte von invoices außer leistungsnachweis — nicht mehr, nicht weniger', async () => {
    const { rows } = await db.query<{ name: string }>(
      `select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'invoices'`,
    );
    const tabelle = rows.map((r) => r.name).filter((n) => n !== 'leistungsnachweis').sort();
    expect(KOPF_SPALTEN.split(',').sort()).toEqual(tabelle);
    expect(KOPF_SPALTEN.split(',')).not.toContain('leistungsnachweis');
  });
});
