/**
 * DIE MARKIERUNGEN DER TAGESPLANUNG ALS ZÄHLUNG (Durchsicht 15.11.2026, L9,
 * `20261117013000_einsatz_tage.sql`).
 *
 * Bis hierher lud die Tagesplanung den ganzen Monat aller Einsätze, um je Tag
 * die Baustellen zu zählen. `einsatz_tage` zählt in der Datenbank — dieselbe
 * Zahl wie vorher `marks` (Baustellen, nicht Personen), nur der eigene
 * Betrieb, und ohne Anmeldung nichts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });
const BETRIEB = `et-${randomUUID().slice(0, 8)}`;
const FREMD = `${BETRIEB}-f`;
const PLANER = randomUUID();
const LEUTE = [randomUUID(), randomUUID(), randomUUID()];

async function alsPlaner<T>(f: () => Promise<T>): Promise<T> {
  await db.query('savepoint planer');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: PLANER, role: 'authenticated', app_metadata: { company_id: BETRIEB } }),
    ]);
    await db.query('set local role authenticated');
    return await f();
  } finally {
    await db.query('rollback to savepoint planer');
  }
}

beforeAll(async () => {
  await db.connect();
  await db.query('begin');
  await db.query('set local session_replication_role = replica');
  await db.query(`insert into public.companies (id, name) values ($1, 'E'), ($2, 'F')`, [BETRIEB, FREMD]);
  for (const [i, id] of [PLANER, ...LEUTE].entries()) {
    await db.query(`insert into auth.users (id, instance_id, aud, role, email)
                    values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`, [id, `${id}@et.test`]);
    await db.query(`insert into public.users (id, company_id, name, email, role) values ($1, $2, $3, $4, $5)`,
      [id, BETRIEB, `P${i}`, `${id}@et.test`, i === 0 ? 'Geschäftsführung' : 'Mitarbeiter']);
  }
  const einsatz = (betrieb: string, datum: string, baustelle: string, wer: string) => db.query(
    `insert into public.assignments (id, company_id, date, project_number, user_id) values ($1, $2, $3, $4, $5)`,
    [randomUUID(), betrieb, datum, baustelle, wer]);
  // 16.9.: drei Personen auf zwei Baustellen; 3.9.: eine; 30.9.: zwei auf einer; Oktober zählt nicht.
  await einsatz(BETRIEB, '2026-09-16', 'B-1', LEUTE[0]);
  await einsatz(BETRIEB, '2026-09-16', 'B-1', LEUTE[1]);
  await einsatz(BETRIEB, '2026-09-16', 'B-2', LEUTE[2]);
  await einsatz(BETRIEB, '2026-09-03', 'B-3', LEUTE[0]);
  await einsatz(BETRIEB, '2026-09-30', 'B-1', LEUTE[0]);
  await einsatz(BETRIEB, '2026-09-30', 'B-1', LEUTE[1]);
  await einsatz(BETRIEB, '2026-10-01', 'B-1', LEUTE[0]);
  await einsatz(FREMD, '2026-09-16', 'X-1', LEUTE[0]);
  await db.query('set local session_replication_role = origin');
});

afterAll(async () => {
  await db.query('rollback');
  await db.end();
});

describe('einsatz_tage', () => {
  it('zählt je Tag die Baustellen (nicht die Personen), nur im Zeitraum und im eigenen Betrieb', async () => {
    const zeilen = await alsPlaner(async () =>
      (await db.query(`select to_char(datum, 'YYYY-MM-DD') as datum, baustellen from public.einsatz_tage('2026-09-01', '2026-09-30')`)).rows);
    expect(zeilen).toEqual([
      { datum: '2026-09-03', baustellen: 1 },
      { datum: '2026-09-16', baustellen: 2 },
      { datum: '2026-09-30', baustellen: 1 },
    ]);
  });

  it('dieselbe Zahl wie bisher aus den Einsätzen des Monats (`marks`)', async () => {
    const { erwartet, neu } = await alsPlaner(async () => ({
      erwartet: (await db.query(`select to_char(date, 'YYYY-MM-DD') as datum, count(distinct project_number)::integer as baustellen
                                   from public.assignments where date between '2026-09-01' and '2026-09-30'
                                  group by date order by date`)).rows,
      neu: (await db.query(`select to_char(datum, 'YYYY-MM-DD') as datum, baustellen from public.einsatz_tage('2026-09-01', '2026-09-30')`)).rows,
    }));
    expect(neu).toEqual(erwartet);
  });

  it('höchstens zwei Monate am Stück, und ohne Anmeldung nichts', async () => {
    await alsPlaner(async () => {
      await expect(db.query(`select * from public.einsatz_tage('2026-01-01', '2026-12-31')`)).rejects.toMatchObject({ code: '22023' });
    });
    await db.query('savepoint ohne');
    await db.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
    await db.query('set local role authenticated');
    await expect(db.query(`select * from public.einsatz_tage('2026-09-01', '2026-09-30')`)).rejects.toMatchObject({ code: '42501' });
    await db.query('rollback to savepoint ohne');
    await db.query('savepoint anon');
    await db.query('set local role anon');
    await expect(db.query(`select * from public.einsatz_tage('2026-09-01', '2026-09-30')`)).rejects.toMatchObject({ code: '42501' });
    await db.query('rollback to savepoint anon');
  });
});
