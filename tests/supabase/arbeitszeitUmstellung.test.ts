/**
 * App und Datenbank zählen die Nacht der Zeitumstellung gleich (offene
 * Punkte B6): `app.arbeitsminuten` gegen dieselbe Tabelle wie `calcWorkMin`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { calcWorkMin } from '@shared/arbeitszeit';
import { UMSTELLUNG } from '../faelle/zeitumstellung';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
});
afterAll(async () => { await db.end(); });

describe('app.arbeitsminuten über die Zeitumstellung', () => {
  it.each(UMSTELLUNG)('$was', async ({ datum, von, bis, minuten }) => {
    const { rows } = await db.query<{ m: number }>(
      "select app.arbeitsminuten('Anwesend', $1::time, $2::time, 0, null, $3::date) as m",
      [von, bis, datum],
    );
    expect(rows[0].m).toBe(minuten);
    expect(calcWorkMin({ status: 'Anwesend', startTime: von, endTime: bis, breakDuration: 0, date: datum })).toBe(minuten);
  });

  it('die Monatssicht zählt mit dem Tag', async () => {
    // Die Sicht ruft die Fassung mit Tag — sonst hülfe die Funktion der
    // Lohnverrechnung nichts.
    const { rows } = await db.query<{ def: string }>("select pg_get_viewdef('public.monthly_stats') as def");
    expect(rows[0].def).toMatch(/arbeitsminuten\([^)]*t\.date\)/);
  });
});
