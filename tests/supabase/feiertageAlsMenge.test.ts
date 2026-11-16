/**
 * DIE ARBEITSTAGE EINES ZEITRAUMS MIT DEN FEIERTAGEN ALS MENGE (Durchsicht
 * 15.11.2026, L14, `20261117011000_feiertage_als_menge.sql`).
 *
 * `app.urlaubstage` und `app.urlaubstage_person` fragten je Tag
 * `app.ist_feiertag`, das jedes Mal Ostern neu rechnet: elf Jahre 1,2 s,
 * über sie zählen alle Abwesenheiten in der Datenbank. Jetzt nehmen sie
 * `app.feiertage` (Ostern einmal je Jahr).
 *
 * „Bleibt gleich“: über vierzig Jahre, verschiedene Arbeitstage, Ostern am
 * frühesten und spätesten Tag, Jahreswechsel und leere Zeiträume dieselben
 * Tage wie die Rechnung je Tag mit `app.ist_feiertag` /
 * `app.ist_arbeitstag` (die es unverändert gibt). Für `urlaubstage_person`
 * mit einem Arbeitszeitverlauf, der die Arbeitstage wechselt.
 *
 * Gegenprobe: ohne die Migration fragen beide Funktionen je Tag, und der
 * Zeitraum über dreißig Jahre braucht Sekunden.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });

beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  await db.end();
});

/** Die bisherige Rechnung je Tag — Wochentag nach den Arbeitstagen, Feiertag über `app.ist_feiertag`. */
async function jeTag(arbeitstage: number[], von: string | null, bis: string | null): Promise<string[]> {
  const { rows } = await db.query(
    `select coalesce(array_agg(to_char(s.t, 'YYYY-MM-DD') order by s.t), '{}') as tage
       from generate_series($2::date, $3::date, interval '1 day') s(t)
      where $2::date is not null and $3::date is not null and $3::date >= $2::date
        and app.ist_arbeitstag($1::smallint[], s.t::date)`,
    [arbeitstage, von, bis],
  );
  return rows[0].tage;
}

async function neu(arbeitstage: number[], von: string | null, bis: string | null): Promise<string[]> {
  const { rows } = await db.query(
    `select coalesce((select array_agg(to_char(t, 'YYYY-MM-DD') order by t) from unnest(app.urlaubstage($1::smallint[], $2::date, $3::date)) t), '{}') as tage`,
    [arbeitstage, von, bis],
  );
  return rows[0].tage;
}

/** Eine Person als Zeile von `public.users` — nur die Felder, die die Rechnung liest. */
const person = (felder: Record<string, unknown>) => JSON.stringify({ arbeitszeit_verlauf: [], work_days: [1, 2, 3, 4, 5], ...felder });

async function personJeTag(p: string, von: string, bis: string): Promise<string[]> {
  const { rows } = await db.query(
    `select coalesce(array_agg(to_char(s.t, 'YYYY-MM-DD') order by s.t), '{}') as tage
       from generate_series($2::date, $3::date, interval '1 day') s(t)
       cross join lateral app.arbeitszeit_am(jsonb_populate_record(null::public.users, $1::jsonb), s.t::date) a
      where app.ist_arbeitstag(a.arbeitstage, s.t::date)`,
    [p, von, bis],
  );
  return rows[0].tage;
}

async function personNeu(p: string, von: string, bis: string): Promise<string[]> {
  const { rows } = await db.query(
    `select coalesce((select array_agg(to_char(t, 'YYYY-MM-DD') order by t)
                        from unnest(app.urlaubstage_person(jsonb_populate_record(null::public.users, $1::jsonb), $2::date, $3::date)) t), '{}') as tage`,
    [p, von, bis],
  );
  return rows[0].tage;
}

describe('app.urlaubstage: dieselben Tage wie je Tag gefragt', () => {
  const arbeitstage = [[], [1, 2, 3, 4, 5], [1, 2, 3, 4], [1, 3, 5], [1, 2, 3, 4, 5, 6], [0, 6], [4]];
  for (const tage of arbeitstage) {
    it(`Arbeitstage [${tage.join(',')}] über 2000 bis 2040`, async () => {
      const erwartet = await jeTag(tage, '2000-01-01', '2040-12-31');
      expect(await neu(tage, '2000-01-01', '2040-12-31')).toEqual(erwartet);
      expect(erwartet.length).toBeGreaterThan(tage.length === 1 ? 1500 : 3000);
    }, 120_000);
  }

  const raender: Array<[string, string, string]> = [
    ['Ostern früh (2008: Ostersonntag 23.3.)', '2008-03-17', '2008-03-28'],
    ['Ostern spät, Fronleichnam am 24.6. (2038: Ostern 25.4.)', '2038-04-20', '2038-06-30'],
    ['über den Jahreswechsel', '2026-12-20', '2027-01-10'],
    ['ein einzelner Feiertag', '2026-12-08', '2026-12-08'],
    ['ein einzelner Arbeitstag', '2026-11-16', '2026-11-16'],
  ];
  for (const [was, von, bis] of raender) {
    it(was, async () => {
      expect(await neu([1, 2, 3, 4, 5], von, bis)).toEqual(await jeTag([1, 2, 3, 4, 5], von, bis));
    });
  }

  it('leere und verkehrte Zeiträume bleiben leer', async () => {
    expect(await neu([1, 2, 3, 4, 5], '2026-11-20', '2026-11-10')).toEqual([]);
    expect(await neu([1, 2, 3, 4, 5], null, '2026-11-10')).toEqual([]);
    expect(await neu([1, 2, 3, 4, 5], '2026-11-10', null)).toEqual([]);
  });
});

describe('app.urlaubstage_person: dieselben Tage wie je Tag gefragt', () => {
  const verlauf = [
    { ab: '2019-03-01', wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
    { ab: '2022-07-04', wochenstunden: 32, arbeitstage: [1, 2, 3, 4], tagessoll: null },
    { ab: '2025-01-01', wochenstunden: 20, arbeitstage: [1, 3, 5], tagessoll: null },
  ];
  const faelle: Array<[string, string]> = [
    ['ohne Verlauf, Montag bis Freitag', person({})],
    ['ohne Verlauf, keine Arbeitstage hinterlegt (zählt Montag bis Freitag)', person({ work_days: [] })],
    ['mit Verlauf: fünf, vier, drei Tage', person({ arbeitszeit_verlauf: verlauf, work_days: [1, 3, 5] })],
  ];
  for (const [was, p] of faelle) {
    it(was, async () => {
      for (const [von, bis] of [['2016-01-01', '2030-12-31'], ['2022-06-27', '2022-07-15'], ['2025-12-22', '2026-01-09']]) {
        expect(await personNeu(p, von, bis)).toEqual(await personJeTag(p, von, bis));
      }
    });
  }
});

describe('Gegenprobe: die Feiertage kommen als Menge', () => {
  it('keine der beiden Funktionen fragt mehr je Tag', async () => {
    const { rows } = await db.query(
      `select pg_get_functiondef('app.urlaubstage(smallint[], date, date)'::regprocedure) as a,
              pg_get_functiondef('app.urlaubstage_person(public.users, date, date)'::regprocedure) as b`,
    );
    for (const quelle of [rows[0].a, rows[0].b] as string[]) {
      expect(quelle).not.toMatch(/app\.ist_feiertag|app\.ist_arbeitstag/);
      expect(quelle).toContain('app.feiertage(p_von, p_bis)');
    }
  });

  it('dreißig Jahre Arbeitstage in Millisekunden, nicht in Sekunden (vorher rund 3 s)', async () => {
    const start = Date.now();
    await neu([1, 2, 3, 4, 5], '2000-01-01', '2029-12-31');
    await personNeu(person({}), '2000-01-01', '2029-12-31');
    expect(Date.now() - start).toBeLessThan(1500);
  });

  it('angemeldete Konten rufen `public.urlaubstage` weiter (die Menge ist für sie freigegeben)', async () => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      const { rows } = await db.query(`select cardinality(public.urlaubstage('{1,2,3,4,5}', '2026-01-01', '2026-12-31')) as n`);
      expect(rows[0].n).toBe(251);
    } finally {
      await db.query('rollback');
    }
  });
});

/*
  NACHARBEIT (Befund 3): auch die Einsatzplanung liest die Feiertage aus
  `app.feiertage` — `einsatz_folgetage` einmal je Zeitraum statt je Tag,
  `einsatz_umplanen` für den einen Tag aus derselben Quelle
  (`20261117015100_einsatz_feiertage_als_menge.sql`).
*/
describe('Einsatzplanung: Feiertage als Menge', () => {
  it('die Menge enthält genau die Tage, an denen app.ist_feiertag gilt (2010–2035)', async () => {
    const { rows } = await db.query(`
      select count(*) filter (where x.je_tag <> x.in_menge) as abweichend, count(*) filter (where x.je_tag) as feiertage
        from (select app.ist_feiertag(d::date) as je_tag,
                     d::date in (select f.tag from app.feiertage('2010-01-01', '2035-12-31') f) as in_menge
                from generate_series(date '2010-01-01', date '2035-12-31', interval '1 day') d) x`);
    expect(Number(rows[0].abweichend)).toBe(0);
    // 13 je Jahr, weniger die Jahre, in denen zwei zusammenfallen (2008: Christi Himmelfahrt am 1. Mai).
    expect(Number(rows[0].feiertage)).toBeGreaterThan(26 * 13 - 5);
  }, 120_000);

  it('einsatz_folgetage meldet „feiertag“ genau an den Feiertagen, die kein Wochenende sind (Ostern 2027)', async () => {
    const betrieb = `fm-${randomUUID().slice(0, 8)}`;
    const chef = randomUUID();
    const monteur = randomUUID();
    await db.query('begin');
    try {
      await db.query('set local session_replication_role = replica');
      await db.query(`insert into public.companies (id, name) values ($1, 'F')`, [betrieb]);
      for (const [id, rolle] of [[chef, 'Geschäftsführung'], [monteur, 'Mitarbeiter']]) {
        await db.query(`insert into auth.users (id, instance_id, aud, role, email)
                        values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`, [id, `${id}@fm.test`]);
        await db.query(`insert into public.users (id, company_id, name, email, role) values ($1, $2, $3, $4, $5)`,
          [id, betrieb, rolle, `${id}@fm.test`, rolle]);
      }
      await db.query('set local session_replication_role = origin');
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: chef, role: 'authenticated', app_metadata: { company_id: betrieb } }),
      ]);
      await db.query('set local role authenticated');
      const { rows } = await db.query(`
        select to_char(datum, 'YYYY-MM-DD') as tag from public.einsatz_folgetage('2027-03-20', '2027-05-20', 'B-1', $1, true, false)
         where ergebnis = 'feiertag' order by 1`,
      [JSON.stringify([{ user_id: monteur, user_name: 'Monteur' }])]);
      await db.query('reset role');
      const erwartet = (await db.query(`
        select to_char(d, 'YYYY-MM-DD') as tag from generate_series(date '2027-03-20', date '2027-05-20', interval '1 day') d
         where extract(isodow from d) < 6 and app.ist_feiertag(d::date) order by 1`)).rows;
      expect(rows).toEqual(erwartet);
      // Ostermontag und Christi Himmelfahrt; der 1. Mai fällt 2027 auf einen Samstag.
      expect(rows.map((r) => r.tag)).toEqual(['2027-03-29', '2027-05-06', '2027-05-17']);
    } finally {
      await db.query('rollback');
    }
  });

  it('keine der beiden Einsatzfunktionen fragt mehr app.ist_feiertag', async () => {
    const { rows } = await db.query(
      `select pg_get_functiondef('public.einsatz_folgetage(date, date, text, jsonb, boolean, boolean)'::regprocedure) as a,
              pg_get_functiondef('public.einsatz_umplanen(uuid, date, uuid, boolean)'::regprocedure) as b`,
    );
    expect(rows[0].a).not.toContain('app.ist_feiertag');
    expect(rows[0].a).toContain('app.feiertage(p_von, p_bis)');
    expect(rows[0].b).not.toContain('app.ist_feiertag');
    expect(rows[0].b).toContain('app.feiertage(p_datum, p_datum)');
  });
});
