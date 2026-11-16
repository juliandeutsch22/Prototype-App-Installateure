/**
 * NACH DER DATANORM-ÜBERNAHME IST DIE WARTELISTE DER SUCHINDIZES LEER
 * (Durchsicht 15.11.2026, Befund 2 zu L3, `20261117015400_datanorm_warteliste.sql`).
 *
 * Ein GIN-Index nimmt neue Einträge zuerst in eine Warteliste und sortiert
 * sie erst beim nächsten `autovacuum` ein; bis dahin liest jede Suche sie
 * linear mit (gemessen 13–20 ms statt 1 ms nach 50.000 neuen Artikeln). Die
 * Übernahme räumt am Ende ihres letzten Blocks auf.
 *
 * Geprüft: nach einer Übernahme gibt es in keinem Trigramm-Index der Artikel
 * etwas einzusortieren (`gin_clean_pending_list` findet nichts mehr) — ohne
 * die Änderung schon (Gegenprobe gegen den Stand davor: > 0); ein Block, der
 * nicht der letzte ist, räumt nicht auf; das Ergebnis der Übernahme bleibt
 * dasselbe (Bericht und angelegte Artikel).
 *
 * Alles in einer Transaktion, die zurückgerollt wird.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });
const B = `dw-${randomUUID().slice(0, 8)}`;
const CHEF = randomUUID();
const LIEFERANT = randomUUID();
const ANZAHL = 1200;

/** Wie viele Seiten die Warteliste der Trigramm-Indizes der Artikel noch hat — und räumt sie dabei auf. */
async function warteliste(): Promise<number> {
  const { rows } = await db.query(`
    select coalesce(sum(gin_clean_pending_list(i.indexrelid::regclass)), 0) as n
      from pg_index i join pg_class c on c.oid = i.indexrelid join pg_am a on a.oid = c.relam
     where i.indrelid = 'public.materials'::regclass and a.amname = 'gin'
       and pg_get_indexdef(i.indexrelid) like '%gin_trgm_ops%'`);
  return Number(rows[0].n);
}

async function lauf(anzahl: number, praefix: string): Promise<string> {
  const id = randomUUID();
  await db.query(`insert into public.datanorm_laeufe (id, company_id, supplier_id, dateiname, status) values ($1, $2, $3, 'test.001', 'offen')`,
    [id, B, LIEFERANT]);
  await db.query(`
    insert into public.datanorm_zeilen (lauf_id, company_id, zeile, artikelnummer, name, einheit, preis, preis_art, verarbeitung)
    select $1, $2, i, $3 || lpad(i::text, 6, '0'),
           'Pressfitting Kupfer ' || $3 || ' ' || i, 'Stk', 1 + i % 50, 'netto', 'neu'
      from generate_series(1, $4) i`, [id, B, praefix, anzahl]);
  return id;
}

async function uebernehmen(id: string, menge: number | null) {
  await db.query('savepoint chef');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: CHEF, role: 'authenticated', app_metadata: { company_id: B } }),
    ]);
    await db.query('set local role authenticated');
    const { rows } = await db.query('select public.datanorm_uebernehmen($1, $2) as r', [id, menge]);
    await db.query('reset role');
    await db.query('release savepoint chef');
    return rows[0].r as Record<string, unknown>;
  } catch (e) {
    await db.query('rollback to savepoint chef');
    throw e;
  }
}

beforeAll(async () => {
  await db.connect();
  await db.query('begin');
  await db.query('set local session_replication_role = replica');
  await db.query(`insert into public.companies (id, name) values ($1, 'DW')`, [B]);
  await db.query(`insert into auth.users (id, instance_id, aud, role, email)
                  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`, [CHEF, `${CHEF}@dw.test`]);
  await db.query(`insert into public.users (id, company_id, name, email, role) values ($1, $2, 'Chefin', $3, 'Geschäftsführung')`,
    [CHEF, B, `${CHEF}@dw.test`]);
  await db.query(`insert into public.suppliers (id, company_id, name) values ($1, $2, 'Großhandel')`, [LIEFERANT, B]);
  await db.query('set local session_replication_role = origin');
  // Was andere Prüfungen in der Warteliste hinterlassen haben, zählt hier nicht.
  await warteliste();
}, 60_000);

afterAll(async () => {
  await db.query('rollback');
  await db.end();
});

describe('DATANORM-Übernahme und Warteliste der Suchindizes', () => {
  it('Voraussetzung: tausendzweihundert neue Artikel füllen die Warteliste', async () => {
    await db.query('savepoint voraus');
    await db.query(`insert into public.materials (company_id, name, article_number)
                    select $1, 'Pressfitting Kupfer V ' || i, 'V' || i from generate_series(1, ${ANZAHL}) i`, [B]);
    expect(await warteliste()).toBeGreaterThan(0);
    await db.query('rollback to savepoint voraus');
  });

  it('ein Block, der nicht der letzte ist, räumt nicht auf; der letzte räumt auf — die Warteliste ist leer', async () => {
    const id = await lauf(ANZAHL, 'A');
    const erster = await uebernehmen(id, ANZAHL - 10);
    expect(erster.fertig).toBe(false);
    expect(await warteliste()).toBeGreaterThan(0);
    const letzter = await uebernehmen(id, null);
    expect(letzter.fertig).toBe(true);
    expect(await warteliste()).toBe(0);
  }, 120_000);

  it('bleibt gleich: Bericht und angelegte Artikel der Übernahme', async () => {
    const id = await lauf(500, 'B');
    const r = await uebernehmen(id, null);
    expect(r).toMatchObject({ fertig: true, offen: 0, angelegt: 500, geaendert: 0, ausgelaufen: 0 });
    const { rows } = await db.query(
      `select count(*) as n, min(name) as erster from public.materials where company_id = $1 and article_number like 'B%'`, [B]);
    expect(Number(rows[0].n)).toBe(500);
    expect(rows[0].erster).toBe('Pressfitting Kupfer B 1');
    const stand = (await db.query(`select status from public.datanorm_laeufe where id = $1`, [id])).rows[0].status;
    expect(stand).toBe('uebernommen');
  }, 120_000);

  it('der Helfer räumt nur auf und ist für nicht angemeldete Aufrufer gesperrt', async () => {
    const { rows } = await db.query(`select has_function_privilege('anon', 'app.katalog_warteliste_aufraeumen()', 'execute') as anon,
                                            has_function_privilege('authenticated', 'app.katalog_warteliste_aufraeumen()', 'execute') as angemeldet`);
    expect(rows[0]).toEqual({ anon: false, angemeldet: true });
  });
});
