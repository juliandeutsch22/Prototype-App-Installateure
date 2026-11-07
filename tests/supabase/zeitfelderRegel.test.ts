/**
 * DIE REGEL DER FREIEN ZEITFELDER IN SQL IST DIE DER APP (M06b).
 *
 * Server und App prüfen dieselbe veröffentlichte Regel: die Datenbank mit
 * `app.zeitfeld_wert_fehler`, `app.zeitfeld_regeln_fehler` und
 * `app.zeitfeld_gilt`, die Maske mit `src/lib/zeitfelder.ts`. Hier laufen
 * beide über DIESELBEN Fälle (`tests/faelle/zeitfelder.ts`) — Meldung für
 * Meldung. `tests/unit/zeitfelder.test.ts` hält die App an dieselben
 * erwarteten Meldungen.
 *
 * Gegenprobe (mit ausgeführt): eine in SQL veränderte Grenze findet derselbe
 * Vergleich.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { feldGilt, regelnFehler, wertFehler } from '@/lib/zeitfelder';
import { GELTUNGSFAELLE, REGELFAELLE, WERTFAELLE } from '../faelle/zeitfelder';

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

async function wertSql(feld: unknown, wert: unknown, alt: unknown): Promise<string | null> {
  const { rows } = await db.query<{ f: string | null }>(
    'select app.zeitfeld_wert_fehler($1::jsonb, $2::jsonb, $3::jsonb) as f',
    [JSON.stringify(feld), JSON.stringify(wert), alt === null || alt === undefined ? null : JSON.stringify(alt)],
  );
  return rows[0].f;
}

describe('Werte: SQL gleich App', () => {
  it.each(WERTFAELLE)('%s', async (_, feld, wert, alt, erwartet) => {
    expect(await wertSql(feld, wert, alt)).toBe(erwartet);
    expect(wertFehler(feld, wert, alt ?? undefined)).toBe(erwartet);
  });
});

describe('Regeln: SQL gleich App', () => {
  it.each(REGELFAELLE)('%s', async (_, typ, regeln, erwartet) => {
    const { rows } = await db.query<{ f: string | null }>(
      'select app.zeitfeld_regeln_fehler($1, $2::jsonb) as f', [typ, JSON.stringify(regeln)]);
    expect(rows[0].f).toBe(erwartet);
    expect(regelnFehler(typ, regeln)).toBe(erwartet);
  });
});

describe('Geltung: SQL gleich App', () => {
  it.each(GELTUNGSFAELLE)('%s', async (_, staende, rollen, stand, rolle, antrag, gilt) => {
    const { rows } = await db.query<{ g: boolean }>(
      'select app.zeitfeld_gilt($1::jsonb, $2, $3, $4) as g',
      [JSON.stringify({ staende, rollen }), stand, rolle, antrag]);
    expect(rows[0].g).toBe(gilt);
    expect(feldGilt({ staende, rollen }, stand, rolle, antrag)).toBe(gilt);
  });
});

describe('Gegenprobe', () => {
  it('eine in SQL veränderte Grenze fällt auf', async () => {
    await db.query('begin');
    try {
      await db.query(`
        create or replace function app.zeitfeld_wert_fehler(p_feld jsonb, p_wert jsonb, p_alt jsonb default null) returns text
          language sql immutable security definer set search_path = ''
        as $$ select case when p_feld ->> 'typ' = 'text' and char_length(p_wert #>> '{}') > 300 then 'Höchstens 300 Zeichen' end $$`);
      const [, feld, wert, alt, erwartet] = WERTFAELLE.find(([b]) => b === 'Text zu lang (Vorgabe 200)')!;
      expect(await wertSql(feld, wert, alt)).not.toBe(erwartet);
    } finally {
      await db.query('rollback');
    }
  });
});
