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
 * Seit M02b steht auch der KERN darin (Baustellen, Kunden; seit M06b die
 * Zeiterfassung) mit seinen
 * Unterfähigkeiten — der Vergleich nimmt `KERN` mit, und `app.modul_kern()`
 * muss genau dessen Kennungen tragen: ein Kernbereich ist immer an, auch
 * wenn jemand ihn in die Festlegung schreibt.
 *
 * Gegenprobe (mit ausgeführt): eine in SQL veränderte Zeile findet derselbe
 * Vergleich.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { KERN, MODULE, aktiveSchalter } from '@/lib/module';

let db: Client;

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

/** Das Register der App, flach: Module, Kernbereiche (Standard an) und Unterfähigkeiten mit ihren eigenen Abhängigkeiten. */
function ausDerApp(): string[] {
  return [
    ...MODULE.map((m) => ({ id: m.id, standard: m.standard, abhaengigVon: m.abhaengigVon, unter: m.unter ?? [] })),
    ...KERN.map((k) => ({ id: k.id, standard: true, abhaengigVon: [] as string[], unter: k.unter })),
  ].flatMap((m) => [
    `${m.id} | ${m.standard} | ${[...(m.abhaengigVon ?? [])].sort().join(',')}`,
    ...m.unter.map((f) => `${f.id} | ${f.standard} | ${[...(f.abhaengigVon ?? [])].sort().join(',')}`),
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
    expect(ausDerApp()).toContain('baustellen.auftragseingang | true | ');
    // M06b: die Zeiterfassung als Kern mit den freien Zeitfeldern.
    expect(ausDerApp()).toContain('zeiterfassung.freie_zeitfelder | true | ');
    // M04b: Materialbereitschaft und Bestellvorschläge — die Vorschläge prüft der Server (V3).
    expect(await ausSql()).toEqual(expect.arrayContaining(['material.materialbereitschaft | true | ', 'material.bestellvorschlaege | true | ']));
    expect((await ausSql()).length).toBeGreaterThanOrEqual(21);
  });

  it('der Kern in SQL ist der Kern der App — und immer an, gleich was festgelegt ist (M02b)', async () => {
    const { rows } = await db.query<{ k: string }>('select k from app.modul_kern() k order by 1');
    expect(rows.map((r) => r.k)).toEqual(KERN.map((k) => k.id).sort());
    await db.query('begin');
    try {
      await db.query('set local session_replication_role = replica');
      await db.query(`insert into public.companies (id, name) values ('mrs-kern', 'Kern') on conflict (id) do nothing`);
      for (const festlegung of [
        { baustellen: false, kunden: false },
        { baustellen: false, 'baustellen.auftragseingang': true },
        { 'baustellen.auftragseingang': false },
        { 'baustellen.auftragseingang': 0 },
        { zeiterfassung: false, 'zeiterfassung.freie_zeitfelder': true },
        { 'zeiterfassung.freie_zeitfelder': false },
        {},
      ]) {
        await db.query('update public.companies set modules = $1 where id = $2', [JSON.stringify(festlegung), 'mrs-kern']);
        const erwartet = aktiveSchalter(festlegung as Record<string, boolean>);
        for (const id of ['baustellen', 'kunden', 'baustellen.auftragseingang', 'kunden.gibtsnicht',
          'zeiterfassung', 'zeiterfassung.freie_zeitfelder']) {
          const { rows: an } = await db.query<{ an: boolean }>('select app.modul_aktiv($1, $2) as an', ['mrs-kern', id]);
          expect({ festlegung, id, an: an[0].an }).toEqual({ festlegung, id, an: erwartet.has(id as never) });
        }
      }
    } finally {
      await db.query('rollback');
    }
  });

  it('Gegenprobe: eine abweichende Zeile in SQL fällt auf', async () => {
    await db.query('begin');
    try {
      await db.query(`
        create or replace function app.modul_register()
          returns table (kennung text, standard boolean, abhaengig_von text[])
          language sql immutable security definer set search_path = ''
        as $$ select r.kennung, case when r.kennung = 'angebote.online_annahme' then false else r.standard end, r.abhaengig_von
                from (values ('baustellen', true, '{}'::text[]), ('baustellen.auftragseingang', true, '{}'::text[]),
                             ('kunden', true, '{}'::text[]),
                             ('zeiterfassung', true, '{}'::text[]), ('zeiterfassung.freie_zeitfelder', true, '{}'::text[]),
                             ('einsatzplanung', true, '{}'::text[]), ('material', true, '{}'::text[]),
                             ('material.katalogversionen', true, '{}'::text[]), ('material.lieferantenvergleich', true, '{}'::text[]),
                             ('material.katalogpreisverlauf', true, '{}'::text[]), ('material.lagerorte_fahrzeuglager', true, '{}'::text[]),
                             ('material.materialbereitschaft', true, '{}'::text[]), ('material.bestellvorschlaege', true, '{}'::text[]),
                             ('urlaub', true, '{}'::text[]),
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
