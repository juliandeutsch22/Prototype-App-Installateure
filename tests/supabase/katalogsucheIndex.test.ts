/**
 * DIE KATALOGSUCHE NIMMT IHREN INDEX (Durchsicht 15.11.2026, L3,
 * `20261117010000_katalogsuche_index.sql`).
 *
 * Gemessen bei 120.000 Artikeln: über PostgREST 285 ms für die Suche und
 * 253 ms fürs Zählen, `katalogNachNamen` 2,1 s — die Suche lief als
 * Durchlauf. Zwei Ursachen: kein Index je Spalte, und mit Zeilenschutz darf
 * Postgres `ilike` gar nicht über einen Index auswerten (nicht „leakproof“).
 *
 * Geprüft wird:
 *   1. die Voraussetzung (wie `indizesWachstum.test.ts`): ohne Durchlauf
 *      nimmt die Suche der Funktion die Indizes je Spalte; die Seite ohne
 *      Suche den Index nach Namen, die Lagerliste ihren Teilindex;
 *   2. die Gegenprobe zum Grund: dieselbe Suche als angemeldete Person über
 *      die Tabelle (der Weg von PostgREST) nimmt keinen Trigramm-Index;
 *   3. „bleibt gleich“: `katalog_suchen` liefert dieselben Artikel in
 *      derselben Reihenfolge und dieselbe Zahl wie die bisherige Abfrage
 *      (`or(name.ilike…, article_number.ilike…, category.ilike…)`, sortiert
 *      nach Name und Kennung), auch mit Komma, `%`, `_` und Großschreibung;
 *      `katalog_nach_namen` dieselben wie die bisherigen `name.ilike`;
 *   4. nur der eigene Betrieb, und ohne Anmeldung nichts.
 *
 * Alles in einer Transaktion, die zurückgerollt wird.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });
const BETRIEB = `ks-${randomUUID().slice(0, 8)}`;
const FREMD = `${BETRIEB}-fremd`;
const PERSON = randomUUID();

function indexNamen(knoten: unknown, raus: string[] = []): string[] {
  if (Array.isArray(knoten)) for (const k of knoten) indexNamen(k, raus);
  else if (knoten && typeof knoten === 'object') {
    for (const [k, v] of Object.entries(knoten)) {
      if (k === 'Index Name' && typeof v === 'string') raus.push(v);
      else indexNamen(v, raus);
    }
  }
  return raus;
}

const besondere = [
  ['Pressfitting 22, verzinkt', 'PF-22', 'Fittings'],
  ['Dichtung 50% Rabatt', 'D-50', 'Dichtungen'],
  ['Muffe_DN20', 'M_20', 'Fittings'],
  ['KUGELHAHN 1/2 Zoll', 'KH-12', 'Armaturen'],
  ['Eckventil (Messing)', 'EV-1', 'Armaturen'],
  ['Überwurfmutter 3/4', 'UM-34', 'Zubehör'],
  ['Kupferrohr 15', 'KR15', 'Rohre'],
  ['Kupferrohr 18', 'KR18', 'Rohre'],
  ['Pressfitting 15 Kupfer', 'PF15', 'Kupfer'],
];

async function alsPerson<T>(f: () => Promise<T>): Promise<T> {
  await db.query('savepoint person');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: PERSON, role: 'authenticated', app_metadata: { company_id: BETRIEB } }),
    ]);
    await db.query('set local role authenticated');
    return await f();
  } finally {
    await db.query('rollback to savepoint person');
  }
}

beforeAll(async () => {
  await db.connect();
  await db.query('begin');
  await db.query(`insert into public.companies (id, name) values ($1, 'Katalog'), ($2, 'Fremd')`, [BETRIEB, FREMD]);
  await db.query(`insert into auth.users (id, instance_id, aud, role, email)
                  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
  [PERSON, `${PERSON}@ks.test`]);
  await db.query(`insert into public.users (id, company_id, name, email, role) values ($1, $2, 'Monteur', $3, 'Mitarbeiter')`,
    [PERSON, BETRIEB, `${PERSON}@ks.test`]);
  // Ein eingespielter Katalog (20.000 Artikel) mit Ausgelaufenen, ein paar davon noch im Lager.
  await db.query('set local session_replication_role = replica');
  await db.query(`
    insert into public.materials (company_id, name, article_number, category, stock, lagerartikel, ausgelaufen)
    select $1, 'Artikel ' || lpad(i::text, 4, '0') || case when i % 7 = 0 then ' Kupfer' else '' end,
           'IMP-' || i, case when i % 5 = 0 then 'Kupferteile' else 'Import' end,
           case when i % 11 = 0 then 3 else 0 end, i % 11 = 0 or i % 40 = 0, i % 9 = 0
      from generate_series(1, 20000) i`, [BETRIEB]);
  for (const [name, nummer, kategorie] of besondere) {
    await db.query(`insert into public.materials (company_id, name, article_number, category) values ($1, $2, $3, $4)`,
      [BETRIEB, name, nummer, kategorie]);
  }
  await db.query(`insert into public.materials (company_id, name, article_number) values ($1, 'Kupferrohr 15 fremd', 'KR15')`, [FREMD]);
  await db.query('set local session_replication_role = origin');
  /*
    WIE NACH DEM AUFRÄUMEN IM BETRIEB: frisch eingefügte Zeilen liegen zuerst
    in der Warteliste des GIN-Index, die jede Suche linear mitliest — bis
    `autovacuum` sie einsortiert. Erst danach schätzt der Planer den Index so
    ein wie im Alltag; ohne das prüfte der Fall einen Zustand gleich nach
    einem Import.
  */
  await db.query(`select gin_clean_pending_list(i.indexrelid::regclass)
                    from pg_index i join pg_class c on c.oid = i.indexrelid join pg_am a on a.oid = c.relam
                   where i.indrelid = 'public.materials'::regclass and a.amname = 'gin'`);
  await db.query('analyze public.materials');
}, 60_000);

afterAll(async () => {
  await db.query('rollback');
  // `analyze` schreibt die Zeilenzahl an Ort und Stelle — neu messen, wie in `indizesWachstum.test.ts`.
  await db.query('analyze public.materials');
  await db.end();
});

/** Die bisherige Abfrage, so wie PostgREST sie aus `katalogSeite`/`sucheKatalog` baut. */
async function bisher(begriff: string, filter: 'alle' | 'anforderbar' | 'aktiv', kategorie: boolean, anzahl: number) {
  const muster = `%${begriff.trim().replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&')}%`;
  const wo = [
    'company_id = $1',
    filter === 'anforderbar' ? '(ausgelaufen = false or stock > 0)' : filter === 'aktiv' ? 'ausgelaufen = false' : 'true',
    begriff.trim()
      ? `(name ilike $2 or article_number ilike $2${kategorie ? ' or category ilike $2' : ''})`
      : '($2::text is null or true)',
  ].join(' and ');
  const ids = (await db.query(`select id from public.materials where ${wo} order by name, id limit ${anzahl}`, [BETRIEB, muster])).rows
    .map((z) => z.id as string);
  const gesamt = Number((await db.query(`select count(*) from public.materials where ${wo}`, [BETRIEB, muster])).rows[0].count);
  return { ids, gesamt };
}

describe('Katalogsuche: Index', () => {
  it('die Suche der Funktion nimmt die Indizes je Spalte', async () => {
    await db.query('savepoint plan');
    await db.query('set local enable_seqscan = off');
    const { rows } = await db.query(`explain (format json)
      select m.* from public.materials m
       where m.company_id = $1 and (m.name ilike '%verzinkt%' or m.article_number ilike '%verzinkt%' or m.category ilike '%verzinkt%')
       order by m.name, m.id limit 20`, [BETRIEB]);
    await db.query('rollback to savepoint plan');
    const namen = indexNamen(rows[0]['QUERY PLAN']);
    expect(namen).toEqual(expect.arrayContaining(['materials_suche_name', 'materials_suche_artikelnummer', 'materials_suche_kategorie']));
  });

  it('die Seite ohne Suche kommt aus dem Index nach Namen, die Lagerliste aus ihrem Teilindex', async () => {
    await db.query('savepoint plan');
    await db.query('set local enable_seqscan = off');
    const seite = await db.query(`explain (format json)
      select * from public.materials where company_id = $1 order by name, id limit 50`, [BETRIEB]);
    const lager = await db.query(`explain (format json)
      select * from public.materials where company_id = $1 and lagerartikel = true`, [BETRIEB]);
    await db.query('rollback to savepoint plan');
    expect(indexNamen(seite.rows[0]['QUERY PLAN'])).toContain('materials_nach_name');
    expect(indexNamen(lager.rows[0]['QUERY PLAN'])).toContain('materials_lagerartikel');
  });

  it('Gegenprobe zum Grund: über die Tabelle mit Zeilenschutz kein Trigramm-Index — `ilike` ist nicht „leakproof“', async () => {
    const namen = await alsPerson(async () => {
      await db.query('set local enable_seqscan = off');
      const { rows } = await db.query(`explain (format json)
        select * from public.materials
         where company_id = $1 and (name ilike '%verzinkt%' or article_number ilike '%verzinkt%' or category ilike '%verzinkt%')`, [BETRIEB]);
      return indexNamen(rows[0]['QUERY PLAN']);
    });
    expect(namen.filter((n) => n.startsWith('materials_suche'))).toEqual([]);
  });
});

describe('Katalogsuche: bleibt gleich', () => {
  const faelle: Array<[string, 'alle' | 'anforderbar' | 'aktiv', boolean, number]> = [
    ['kupfer', 'alle', true, 50],
    ['Kupfer', 'anforderbar', true, 20],
    ['KUPFER', 'aktiv', false, 20],
    ['', 'alle', true, 50],
    ['', 'anforderbar', true, 120],
    ['22, verzinkt', 'alle', true, 20],
    ['50%', 'alle', true, 20],
    ['_DN', 'alle', true, 20],
    ['m_2', 'alle', true, 20],
    ['  kugelhahn  ', 'alle', true, 8],
    ['armaturen', 'alle', true, 20],
    ['armaturen', 'aktiv', false, 20],
    ['IMP-1', 'anforderbar', true, 1000],
    ['gibt es nicht', 'alle', true, 20],
  ];
  for (const [begriff, filter, kategorie, anzahl] of faelle) {
    it(`„${begriff}“ (${filter}${kategorie ? '' : ', ohne Kategorie'}, ${anzahl}): dieselben Artikel, dieselbe Zahl`, async () => {
      const erwartet = await bisher(begriff, filter, kategorie, anzahl);
      const neu = await alsPerson(async () => (await db.query(
        'select public.katalog_suchen($1, $2, $3, $4, $5, true) as r', [begriff, anzahl, [], filter, kategorie],
      )).rows[0].r as { zeilen: Array<{ id: string; company_id: string }>; gesamt: number });
      expect({ ids: neu.zeilen.map((z) => z.id), gesamt: Number(neu.gesamt) }).toEqual(erwartet);
      expect(neu.zeilen.every((z) => z.company_id === BETRIEB)).toBe(true);
    });
  }

  it('die Kennungen aus der Nummernsuche kommen dazu, ohne Zählung keine Zahl', async () => {
    const ziel = (await db.query(`select id from public.materials where company_id = $1 and name = 'Eckventil (Messing)'`, [BETRIEB])).rows[0].id;
    const r = await alsPerson(async () => (await db.query(
      'select public.katalog_suchen($1, 20, $2) as r', ['kupferrohr', [ziel]],
    )).rows[0].r as { zeilen: Array<{ name: string }>; gesamt: number | null });
    expect(r.zeilen.map((z) => z.name)).toEqual(['Eckventil (Messing)', 'Kupferrohr 15', 'Kupferrohr 18']);
    expect(r.gesamt).toBeNull();
  });

  it('`katalog_nach_namen` findet dieselben wie die bisherigen `name.ilike`', async () => {
    const muster = ['Pressfitting%22,%verzinkt', 'dichtung%50\\%%rabatt', 'Muffe\\_DN20', 'kugelhahn%1/2%zoll', 'Artikel%0007%Kupfer', 'fehlt'];
    const erwartet = (await db.query(
      `select id from public.materials where company_id = $1 and (${muster.map((_, i) => `name ilike $${i + 2}`).join(' or ')}) order by id`,
      [BETRIEB, ...muster],
    )).rows.map((z) => z.id);
    const neu = await alsPerson(async () => (await db.query('select public.katalog_nach_namen($1) as r', [muster])).rows[0].r as Array<{ id: string }>);
    expect(neu.map((z) => z.id)).toEqual(erwartet);
    expect(erwartet).toHaveLength(5);
  });
});

describe('Katalogsuche: nur der eigene Betrieb', () => {
  it('Artikel eines anderen Betriebs kommen nicht mit, auch nicht über ihre Kennung', async () => {
    const fremd = (await db.query('select id from public.materials where company_id = $1', [FREMD])).rows[0].id;
    const r = await alsPerson(async () => (await db.query(
      'select public.katalog_suchen($1, 50, $2, $3, true, true) as r', ['fremd', [fremd], 'alle'],
    )).rows[0].r as { zeilen: unknown[]; gesamt: number });
    expect(r).toEqual({ zeilen: [], gesamt: 0 });
    const namen = await alsPerson(async () => (await db.query('select public.katalog_nach_namen($1) as r', [['Kupferrohr 15%']])).rows[0].r as Array<{ company_id: string }>);
    expect(namen.map((z) => z.company_id)).toEqual([BETRIEB]);
  });

  it('ohne Anmeldung keine Suche', async () => {
    await db.query('savepoint anon');
    await db.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
    await db.query('set local role authenticated');
    await expect(db.query(`select public.katalog_suchen('kupfer', 20)`)).rejects.toMatchObject({ code: '42501' });
    await db.query('rollback to savepoint anon');
    await db.query('savepoint anon2');
    await db.query('set local role anon');
    await expect(db.query(`select public.katalog_suchen('kupfer', 20)`)).rejects.toMatchObject({ code: '42501' });
    await db.query('rollback to savepoint anon2');
  });
});
