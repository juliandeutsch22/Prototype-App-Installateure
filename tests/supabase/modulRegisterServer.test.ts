/**
 * DAS MODULREGISTER IN SQL IST DAS DER APP (M02a, E51 V3).
 *
 * Neue Fachbefehle prüfen das Modul auf dem Server (`app.modul_aktiv`). Die
 * Standards und Abhängigkeiten stehen dafür in SQL als Liste
 * (`app.modul_register`). Läuft sie vom Register in `src/lib/module.ts`
 * weg, schaltet der Server etwas ab, was die App als an zeigt — oder
 * umgekehrt. Diese Prüfung vergleicht beide Zeile für Zeile: Kennung,
 * Standard, Abhängigkeiten; keine darf fehlen, keine dazukommen.
 *
 * Gegenprobe (mit ausgeführt): eine in SQL veränderte Zeile findet derselbe
 * Vergleich.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { MODULE } from '@/lib/module';

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

/** Das Register der App, flach: Module und Unterfähigkeiten mit ihren eigenen Abhängigkeiten. */
function ausDerApp(): string[] {
  return MODULE.flatMap((m) => [
    `${m.id} | ${m.standard} | ${[...(m.abhaengigVon ?? [])].sort().join(',')}`,
    ...(m.unter ?? []).map((f) => `${f.id} | ${f.standard} | ${[...(f.abhaengigVon ?? [])].sort().join(',')}`),
  ]).sort();
}

async function ausSql(): Promise<string[]> {
  const { rows } = await db.query<{ zeile: string }>(`
    select r.kennung || ' | ' || r.standard::text || ' | '
           || coalesce((select string_agg(a, ',' order by a) from unnest(r.abhaengig_von) a), '') as zeile
      from app.modul_register() r`);
  return rows.map((r) => r.zeile).sort();
}

describe('app.modul_register', () => {
  it('trägt jedes Modul und jede Unterfähigkeit der App mit Standard und Abhängigkeiten', async () => {
    expect(await ausSql()).toEqual(ausDerApp());
  });

  it('findet überhaupt etwas — und die erste Unterfähigkeit mit Serverprüfung', async () => {
    expect(ausDerApp()).toContain('angebote.online_annahme | true | ');
    expect((await ausSql()).length).toBeGreaterThanOrEqual(10);
  });

  it('Gegenprobe: eine abweichende Zeile in SQL fällt auf', async () => {
    await db.query('begin');
    try {
      await db.query(`
        create or replace function app.modul_register()
          returns table (kennung text, standard boolean, abhaengig_von text[])
          language sql immutable security definer set search_path = ''
        as $$ select r.kennung, case when r.kennung = 'angebote.online_annahme' then false else r.standard end, r.abhaengig_von
                from (values ('einsatzplanung', true, '{}'::text[]), ('material', true, '{}'::text[]), ('urlaub', true, '{}'::text[]),
                             ('scheine', true, '{}'::text[]), ('angebote', true, '{}'::text[]), ('angebote.online_annahme', true, '{}'::text[]),
                             ('rechnungen', true, '{}'::text[]), ('nachkalkulation', true, '{rechnungen}'::text[]),
                             ('wartung', true, '{}'::text[]), ('zeitkonten', true, '{}'::text[])) r(kennung, standard, abhaengig_von) $$`);
      expect(await ausSql()).not.toEqual(ausDerApp());
    } finally {
      await db.query('rollback');
    }
    expect(await ausSql()).toEqual(ausDerApp());
  });
});
