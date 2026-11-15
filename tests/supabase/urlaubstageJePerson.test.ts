/**
 * DIE URLAUBSTAGE DER MITARBEITERÜBERSICHT JE PERSON (Durchsicht 15.11.2026,
 * L5, `20261117014000_urlaubstage_je_person.sql`).
 *
 * Statt jeder Urlaubsbuchung seit dem frühesten Start als ganze Zeile (bei
 * 50 Personen und zehn Jahren 8,2 MB) je Person eine Zeile mit den Tagen.
 * „Bleibt gleich“: dieselben Tage wie die Urlaubsbuchungen des Zeitraums,
 * auch doppelte; das Büro sieht alle, der Monteur nur seine; der Teilindex
 * trägt die Abfrage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });
const BETRIEB = `uj-${randomUUID().slice(0, 8)}`;
const BUERO = randomUUID();
const MONTEUR = randomUUID();
const KOLLEGE = randomUUID();

async function als<T>(uid: string, f: () => Promise<T>): Promise<T> {
  await db.query('savepoint als');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: 'authenticated', app_metadata: { company_id: BETRIEB } }),
    ]);
    await db.query('set local role authenticated');
    return await f();
  } finally {
    await db.query('rollback to savepoint als');
  }
}

const tage = async (uid: string, von: string, bis: string) => new Map(
  (await als(uid, async () => (await db.query(
    `select user_id, array(select to_char(d, 'YYYY-MM-DD') from unnest(tage) d) as tage from public.urlaubstage_je_person($1, $2)`,
    [von, bis],
  )).rows)).map((z) => [z.user_id as string, z.tage as string[]]),
);

beforeAll(async () => {
  await db.connect();
  await db.query('begin');
  await db.query('set local session_replication_role = replica');
  await db.query(`insert into public.companies (id, name) values ($1, 'U')`, [BETRIEB]);
  for (const [id, rolle] of [[BUERO, 'Buchhaltung'], [MONTEUR, 'Mitarbeiter'], [KOLLEGE, 'Mitarbeiter']]) {
    await db.query(`insert into auth.users (id, instance_id, aud, role, email)
                    values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`, [id, `${id}@uj.test`]);
    await db.query(`insert into public.users (id, company_id, name, email, role) values ($1, $2, $3, $4, $5)`,
      [id, BETRIEB, rolle, `${id}@uj.test`, rolle]);
  }
  await db.query(`
    insert into public.time_entries (id, company_id, user_id, date, status)
    select gen_random_uuid(), $1, u, d::date, case when extract(dow from d) = 3 then 'Krank' else 'Urlaub' end
      from unnest(array[$2::uuid, $3::uuid]) u, generate_series(date '2019-07-01', date '2026-08-31', interval '9 days') d`,
  [BETRIEB, MONTEUR, KOLLEGE]);
  // Wie im Betrieb: die meisten Buchungen sind Arbeit, nicht Urlaub (sonst wäre der Teilindex kein Vorteil).
  await db.query(`
    insert into public.time_entries (id, company_id, user_id, date, status, start_time, end_time)
    select gen_random_uuid(), $1, u, d::date, 'Anwesend', '07:00', '15:30'
      from unnest(array[$2::uuid, $3::uuid]) u, generate_series(date '2019-07-01', date '2026-08-31', interval '1 day') d,
           generate_series(1, 3) wiederholt`,
  [BETRIEB, MONTEUR, KOLLEGE]);
  // Ein doppelter Urlaubstag: die Übersicht zählte ihn bisher zweimal — so bleibt es.
  await db.query(`insert into public.time_entries (id, company_id, user_id, date, status) values ($1, $2, $3, '2020-01-06', 'Urlaub')`,
    [randomUUID(), BETRIEB, MONTEUR]);
  await db.query('set local session_replication_role = origin');
  await db.query('analyze public.time_entries');
});

afterAll(async () => {
  await db.query('rollback');
  await db.query('analyze public.time_entries');
  await db.end();
});

describe('urlaubstage_je_person', () => {
  it('dieselben Tage wie die Urlaubsbuchungen des Zeitraums — je Person, sortiert, Doppelte doppelt', async () => {
    const erwartet = new Map<string, string[]>();
    for (const z of (await db.query(
      `select user_id, to_char(date, 'YYYY-MM-DD') as tag from public.time_entries
        where company_id = $1 and status = 'Urlaub' and date between '2020-01-01' and '2025-12-31' order by user_id, date`, [BETRIEB],
    )).rows) erwartet.set(z.user_id, [...(erwartet.get(z.user_id) ?? []), z.tag]);
    const neu = await tage(BUERO, '2020-01-01', '2025-12-31');
    expect(neu).toEqual(erwartet);
    expect(neu.get(MONTEUR)!.filter((t) => t === '2020-01-06')).toHaveLength(2);
    expect(neu.get(MONTEUR)!.length).toBeGreaterThan(150);
  });

  it('der Monteur bekommt nur seine Tage', async () => {
    const neu = await tage(MONTEUR, '2019-01-01', '2026-12-31');
    expect([...neu.keys()]).toEqual([MONTEUR]);
  });

  it('der Teilindex trägt die Abfrage', async () => {
    await db.query('savepoint plan');
    await db.query('set local enable_seqscan = off');
    const { rows } = await db.query(`explain (format json)
      select user_id, date from public.time_entries where company_id = $1 and status = 'Urlaub' and date between '2020-01-01' and '2025-12-31'`,
    [BETRIEB]);
    await db.query('rollback to savepoint plan');
    expect(JSON.stringify(rows[0]['QUERY PLAN'])).toContain('time_entries_urlaubstage');
  });
});
