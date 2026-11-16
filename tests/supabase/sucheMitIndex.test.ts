/**
 * DIE SUCHEN ÜBER DEN INDEX (Durchsicht 15.11.2026, Befund 1 zu L3,
 * `20261117015300_suche_mit_index.sql`).
 *
 * Mit Zeilenschutz wertet Postgres `ilike` nie über einen Index aus — jede
 * Suche der App über `or(…ilike…)` lief als Durchlauf über alle Zeilen aller
 * Betriebe. Jetzt findet `app.suche_treffer` die Kennungen über den
 * Trigramm-Index, und `suche_<tabelle>` liefert die Zeilen mit den Rechten
 * des Aufrufers — Leseregel und Spaltenrechte der Tabelle, unverändert.
 *
 * Geprüft wird je Suche der App und je Rolle: dieselben Treffer, in derselben
 * Reihenfolge, dieselbe Zahl wie die bisherige Abfrage (`or(…ilike…)` auf der
 * Tabelle, mit derselben Leseregel) — auch mit Komma, `%`, `_` und
 * Großschreibung; nie eine Zeile eines anderen Betriebs; wer die Tabelle nicht
 * liest, bekommt nichts. Dazu die Voraussetzung (jede gesuchte Spalte hat
 * ihren Trigramm-Index; die Suche nimmt ihn) und der Grund (über die Tabelle
 * mit Zeilenschutz kein Index).
 *
 * Alles in einer Transaktion, die zurückgerollt wird.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const db = new Client({ connectionString: VERBINDUNG });
const B = `sx-${randomUUID().slice(0, 8)}`;
const FREMD = `${B}-f`;

const ROLLEN = ['Mitarbeiter', 'Verwaltung', 'Buchhaltung', 'Projektleiter', 'Geschäftsführung', 'Administrator'] as const;
const KONTO: Record<string, string> = Object.fromEntries(ROLLEN.map((r) => [r, randomUUID()]));
/** Die Projektleitung mit Freigabe „Rechnungen lesen“, Leitung einer Baustelle. */
const PL_RECHNUNGEN = randomUUID();
const FREMD_CHEF = randomUUID();

/** Die Suchen der App: Tabelle, Spalten, zusätzliche Bedingung, Reihenfolge, Grenze. */
const SUCHEN: Array<{ was: string; tabelle: string; spalten: string[]; wo?: string; ordnung: string; grenze: number }> = [
  { was: 'Kunden (Liste)', tabelle: 'customers', spalten: ['name', 'address', 'contact_name', 'contact_phone', 'email'], ordnung: 'name', grenze: 500 },
  { was: 'Kunden ohne Kundenart', tabelle: 'customers', spalten: ['name', 'address', 'contact_name', 'contact_phone', 'email'], wo: 'kundenart is null', ordnung: 'name', grenze: 500 },
  { was: 'Kunden, Angaben prüfen', tabelle: 'customers', spalten: ['name', 'address', 'contact_name', 'contact_phone', 'email'], wo: 'angaben_pruefen = true', ordnung: 'name', grenze: 500 },
  { was: 'Baustellen', tabelle: 'projects', spalten: ['project_number', 'customer_name', 'bezeichnung', 'address'], ordnung: 'project_number desc', grenze: 300 },
  { was: 'Wartungen', tabelle: 'wartungen', spalten: ['customer_name', 'anlage', 'address'], ordnung: 'faellig_am', grenze: 500 },
  { was: 'Scheine', tabelle: 'work_sheets', spalten: ['customer_name', 'notizen'], ordnung: 'datum desc', grenze: 150 },
  { was: 'Anforderungen', tabelle: 'material_orders', spalten: ['material_name', 'user_name', 'project_number', 'note'], ordnung: 'created_at desc', grenze: 100 },
  { was: 'Auftragseingänge (offen)', tabelle: 'auftragseingaenge', spalten: ['nummer', 'kunde_name', 'ort', 'anliegen', 'auftraggeber_nummer'], wo: `stand = 'offen'`, ordnung: 'dringlichkeit_rang, eingegangen_am', grenze: 50 },
  { was: 'Rechnungen', tabelle: 'invoices', spalten: ['invoice_number', 'storno_nummer', 'customer_name', 'project_number'], ordnung: 'invoice_date desc', grenze: 50 },
  { was: 'Rechnungen nach Nummer', tabelle: 'invoices', spalten: ['invoice_number', 'storno_nummer'], ordnung: 'invoice_date desc', grenze: 5 },
  { was: 'Angebote', tabelle: 'quotes', spalten: ['quote_number', 'customer_name', 'address', 'project_number'], wo: `status <> 'Verworfen'`, ordnung: 'created_at desc', grenze: 50 },
  { was: 'Angebote nach Nummer', tabelle: 'quotes', spalten: ['quote_number'], wo: `status <> 'Verworfen'`, ordnung: 'created_at desc', grenze: 5 },
];
const BEGRIFFE = ['zirkon', 'ZIRKON', 'Gasse 1', 'Huber, Franz', '50%', 'a_b', '2026-0'];

async function als<T>(uid: string, betrieb: string, f: () => Promise<T>): Promise<T> {
  await db.query('savepoint als');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: 'authenticated', app_metadata: { company_id: betrieb } }),
    ]);
    await db.query('set local role authenticated');
    return await f();
  } finally {
    await db.query('rollback to savepoint als');
  }
}

const muster = (begriff: string) => `%${begriff.trim().replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&')}%`;

/** Die bisherige Abfrage: `or(…ilike…)` auf der Tabelle, so wie PostgREST sie baut. */
async function bisher(s: (typeof SUCHEN)[number], begriff: string) {
  const bedingung = s.spalten.map((sp) => `${sp} ilike $2`).join(' or ');
  const wo = `company_id = $1 and (${bedingung})${s.wo ? ` and ${s.wo}` : ''}`;
  const ids = (await db.query(`select id from public.${s.tabelle} where ${wo} order by ${s.ordnung}, id limit ${s.grenze}`,
    [B, muster(begriff)])).rows.map((z) => z.id as string);
  const zahl = Number((await db.query(`select count(*) from public.${s.tabelle} where ${wo}`, [B, muster(begriff)])).rows[0].count);
  return { ids, zahl };
}

/** Die neue: `suche_<tabelle>` mit denselben Bedingungen, derselben Reihenfolge, derselben Grenze. */
async function neu(s: (typeof SUCHEN)[number], begriff: string) {
  const quelle = `public.suche_${s.tabelle}($2::text[], $3::text)`;
  const wo = `company_id = $1${s.wo ? ` and ${s.wo}` : ''}`;
  const zeilen = (await db.query(`select id, company_id from ${quelle} where ${wo} order by ${s.ordnung}, id limit ${s.grenze}`,
    [B, s.spalten, begriff])).rows;
  const zahl = Number((await db.query(`select count(*) from ${quelle} where ${wo}`, [B, s.spalten, begriff])).rows[0].count);
  return { ids: zeilen.map((z) => z.id as string), zahl, fremd: zeilen.filter((z) => z.company_id !== B).length };
}

beforeAll(async () => {
  await db.connect();
  await db.query('begin');
  await db.query('set local session_replication_role = replica');
  await db.query(`insert into public.companies (id, name) values ($1, 'S'), ($2, 'F')`, [B, FREMD]);
  const konten: Array<[string, string, string, boolean]> = [
    ...ROLLEN.map((r): [string, string, string, boolean] => [KONTO[r], B, r, false]),
    [PL_RECHNUNGEN, B, 'Projektleiter', true],
    [FREMD_CHEF, FREMD, 'Geschäftsführung', false],
  ];
  for (const [id, betrieb, rolle, rechnungen] of konten) {
    await db.query(`insert into auth.users (id, instance_id, aud, role, email)
                    values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`, [id, `${id}@sx.test`]);
    await db.query(`insert into public.users (id, company_id, name, email, role, rechnungen_lesen) values ($1, $2, $3, $4, $5, $6)`,
      [id, betrieb, rolle, `${id}@sx.test`, rolle, rechnungen]);
  }
  const monteur = KONTO.Mitarbeiter;
  /*
    JE TABELLE TREFFER IN JEDER GESUCHTEN SPALTE, dazu solche ohne Treffer,
    Zeilen des fremden Betriebs mit denselben Wörtern und die Sonderfälle der
    Begriffe (Komma, %, _, Großschreibung).
  */
  for (const betrieb of [B, FREMD]) {
    await db.query(`
      insert into public.customers (company_id, name, address, contact_name, contact_phone, email, kundenart, angaben_pruefen)
      select $1, case i % 6 when 0 then 'Zirkon Bau ' || i when 1 then 'Huber, Franz ' || i when 2 then 'Rabatt 50% ' || i else 'Kunde ' || i end,
             case when i % 7 = 0 then 'Gasse 1' || i else 'Weg ' || i end, case when i % 9 = 0 then 'zirkon-Kontakt' end,
             case when i % 11 = 0 then '+43 a_b ' || i end, case when i % 13 = 0 then 'ZIRKON@x.at' end,
             case when i % 2 = 0 then 'privat' end, i % 5 = 0
        from generate_series(1, 400) i`, [betrieb]);
    await db.query(`
      insert into public.projects (company_id, project_number, customer_name, status, bezeichnung, address)
      select $1, 'PR-2026-' || lpad(i::text, 4, '0'), case when i % 5 = 0 then 'Zirkon ' || i else 'Kunde ' || i end, 'Aktiv',
             case when i % 7 = 0 then 'Bad 50% fertig' end, case when i % 3 = 0 then 'Gasse 1' || i end
        from generate_series(1, 300) i`, [betrieb]);
    await db.query(`
      insert into public.wartungen (company_id, customer_id, customer_name, anlage, intervall_monate, faellig_am, address)
      select $1, gen_random_uuid(), case when i % 4 = 0 then 'Huber, Franz' else 'Kunde ' || i end,
             case when i % 5 = 0 then 'Zirkon-Therme' else 'Therme ' || i end, 12, date '2027-01-01' + i, 'Gasse 1' || i
        from generate_series(1, 200) i`, [betrieb]);
    await db.query(`
      insert into public.work_sheets (id, company_id, project_number, customer_name, datum, status, abrechnung, erstellt_von_uid, erstellt_von_name, notizen)
      select gen_random_uuid(), $1, 'PR-2026-0001', case when i % 4 = 0 then 'Zirkon ' || i else 'Kunde ' || i end, date '2026-01-01' + i,
             'Unterschrieben', 'Regie', $2, 'Monteur', case when i % 6 = 0 then 'a_b 50% zirkon' end
        from generate_series(1, 200) i`, [betrieb, monteur]);
    await db.query(`
      insert into public.material_orders (id, company_id, material_name, quantity, status, transaction_type, user_id, user_name, project_number, note, created_at)
      select gen_random_uuid(), $1, case when i % 4 = 0 then 'Zirkon-Rohr' else 'Rohr ' || i end, 1, 'Offen', 'order',
             case when i % 2 = 0 then $2::uuid else $3::uuid end, case when i % 2 = 0 then 'Monteur' else 'Huber, Franz' end,
             'PR-2026-' || lpad((i % 50)::text, 4, '0'), case when i % 5 = 0 then '50% a_b' end, now() - make_interval(mins => i)
        from generate_series(1, 300) i`, [betrieb, monteur, KONTO.Verwaltung]);
    await db.query(`
      insert into public.auftragseingaenge (company_id, nummer, stand, abgelehnt_grund, abgelehnt_am, quelle, anliegen, kunde_name, ort,
                                            auftraggeber_nummer, eingegangen_am)
      select $1, 'EG-2026-' || lpad(i::text, 4, '0'), case when i % 3 = 0 then 'abgelehnt' else 'offen' end,
             case when i % 3 = 0 then 'Kein Auftrag' end, case when i % 3 = 0 then now() end, 'telefon',
             case when i % 4 = 0 then 'Zirkon tropft' else 'Heizung ' || i end, case when i % 5 = 0 then 'Huber, Franz' end, 'Graz',
             case when i % 7 = 0 then 'a_b-' || i end, now() - make_interval(mins => i)
        from generate_series(1, 200) i`, [betrieb]);
    await db.query(`
      insert into public.invoices (id, company_id, invoice_number, project_number, project_id, customer_name, invoice_date, due_date,
                                   total_netto, total_vat, total_brutto, payment_status, storno_nummer, created_at)
      select gen_random_uuid(), $1, 'RE-2026-' || lpad(i::text, 4, '0'), 'PR-2026-' || lpad((i % 300 + 1)::text, 4, '0'),
             (select p.id from public.projects p where p.company_id = $1 and p.project_number = 'PR-2026-' || lpad((i % 300 + 1)::text, 4, '0')),
             case when i % 4 = 0 then 'Zirkon ' || i when i % 4 = 1 then 'Huber, Franz' else 'Kunde ' || i end,
             date '2026-01-01' + i, date '2026-01-15' + i, 100, 20, 120, 'Offen', case when i % 9 = 0 then 'ST-2026-' || i end,
             now() - make_interval(mins => i)
        from generate_series(1, 300) i`, [betrieb]);
    await db.query(`
      insert into public.quotes (company_id, quote_number, customer_name, quote_date, valid_until, status, vat_rate, address, project_number)
      select $1, 'AN-2026-' || lpad(i::text, 4, '0'), case when i % 4 = 0 then 'Zirkon ' || i else 'Kunde ' || i end, date '2026-01-01' + i,
             date '2026-03-01' + i, case when i % 10 = 0 then 'Verworfen' else 'Entwurf' end, 20, case when i % 3 = 0 then 'Gasse 1' || i end,
             case when i % 5 = 0 then 'PR-2026-0001' end
        from generate_series(1, 200) i`, [betrieb]);
  }
  // Die Projektleitung mit Freigabe leitet ein paar Baustellen — ihre Rechnungen liest sie.
  await db.query(`update public.projects set project_managers = array[$2::uuid] where company_id = $1 and project_number like 'PR-2026-00%'`,
    [B, PL_RECHNUNGEN]);
  await db.query('set local session_replication_role = origin');
  for (const t of ['customers', 'projects', 'wartungen', 'work_sheets', 'material_orders', 'auftragseingaenge', 'invoices', 'quotes']) {
    await db.query(`analyze public.${t}`);
  }
}, 120_000);

afterAll(async () => {
  await db.query('rollback');
  await db.end();
});

describe('Suchen über den Index: dieselben Treffer wie bisher, je Rolle', () => {
  for (const s of SUCHEN) {
    it(`${s.was}: gleiche Treffer, Reihenfolge und Zahl für jede Rolle und jeden Begriff — nie ein fremder Betrieb`, async () => {
      let irgendwoGefunden = 0;
      for (const [rolle, uid] of [...ROLLEN.map((r) => [r, KONTO[r]]), ['Projektleiter mit Rechnungen', PL_RECHNUNGEN]]) {
        for (const begriff of BEGRIFFE) {
          const erwartet = await als(uid, B, () => bisher(s, begriff));
          const ist = await als(uid, B, () => neu(s, begriff));
          expect({ rolle, begriff, ids: ist.ids, zahl: ist.zahl }).toEqual({ rolle, begriff, ...erwartet });
          expect(ist.fremd).toBe(0);
          irgendwoGefunden += ist.zahl;
        }
      }
      // Die Prüfung hat etwas geprüft: irgendeine Rolle findet etwas.
      expect(irgendwoGefunden).toBeGreaterThan(0);
    }, 120_000);
  }

  it('wer eine Tabelle nicht liest, findet dort auch über die Suche nichts (Monteur: Kunden, Rechnungen, Angebote, Eingänge)', async () => {
    for (const [tabelle, spalten] of [['customers', ['name']], ['invoices', ['customer_name']], ['quotes', ['customer_name']],
      ['auftragseingaenge', ['anliegen']]] as const) {
      const zahl = await als(KONTO.Mitarbeiter, B, async () => Number((await db.query(
        `select count(*) from public.suche_${tabelle}($1, 'zirkon')`, [spalten])).rows[0].count));
      expect({ tabelle, zahl }).toEqual({ tabelle, zahl: 0 });
    }
    // Gegenprobe: dieselbe Suche als Geschäftsführung findet dort etwas.
    const chef = await als(KONTO['Geschäftsführung'], B, async () => Number((await db.query(
      `select count(*) from public.suche_invoices(array['customer_name'], 'zirkon')`)).rows[0].count));
    expect(chef).toBeGreaterThan(0);
  });

  it('die Anforderungen anderer bleiben dem Monteur verborgen — auch über die Suche', async () => {
    const zeilen = await als(KONTO.Mitarbeiter, B, async () => (await db.query(
      `select user_id from public.suche_material_orders(array['material_name'], 'zirkon')`)).rows);
    expect(zeilen.length).toBeGreaterThan(0);
    expect(zeilen.every((z) => z.user_id === KONTO.Mitarbeiter)).toBe(true);
  });

  it('ein fremder Betrieb findet die eigenen Zeilen nicht', async () => {
    const zeilen = await als(FREMD_CHEF, FREMD, async () => (await db.query(
      `select company_id from public.suche_customers(array['name'], 'zirkon')`)).rows);
    expect(zeilen.length).toBeGreaterThan(0);
    expect(zeilen.every((z) => z.company_id === FREMD)).toBe(true);
  });

  it('Kunden nach Namen (Muster): dieselben wie die bisherigen `name.ilike`', async () => {
    const liste = ['zirkon%bau%6', 'huber,%franz%1', 'rabatt%50\\%%2', 'gibt es nicht'];
    const erwartet = await als(KONTO.Verwaltung, B, async () => (await db.query(
      `select id from public.customers where company_id = $1 and (${liste.map((_, i) => `name ilike $${i + 2}`).join(' or ')}) order by id`,
      [B, ...liste])).rows.map((z) => z.id));
    const ist = await als(KONTO.Verwaltung, B, async () => (await db.query(
      `select id from public.suche_customers(array['name'], null, $1) order by id`, [liste])).rows.map((z) => z.id));
    expect(ist).toEqual(erwartet);
    expect(erwartet.length).toBeGreaterThan(20);
  });

  it('nur die Spalten der Liste, ohne Begriff keine Suche, ohne Anmeldung nichts', async () => {
    await als(KONTO['Geschäftsführung'], B, async () => {
      await db.query('savepoint s1');
      await expect(db.query(`select * from public.suche_customers(array['notes'], 'x')`)).rejects.toMatchObject({ code: '22023' });
      await db.query('rollback to savepoint s1');
      await expect(db.query(`select * from public.suche_customers(array['name'], '  ')`)).rejects.toMatchObject({ code: '22023' });
    });
    await db.query('savepoint anon');
    await db.query('set local role anon');
    await expect(db.query(`select * from public.suche_customers(array['name'], 'x')`)).rejects.toMatchObject({ code: '42501' });
    await db.query('rollback to savepoint anon');
    await db.query('savepoint ohne');
    await db.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
    await db.query('set local role authenticated');
    expect((await db.query(`select count(*) from public.suche_customers(array['name'], 'zirkon')`)).rows[0].count).toBe('0');
    await db.query('rollback to savepoint ohne');
  });
});

describe('Suchen über den Index: Voraussetzung und Grund', () => {
  it('jede Spalte, über die gesucht wird, hat ihren Trigramm-Index', async () => {
    const fehlt: string[] = [];
    for (const s of SUCHEN) {
      for (const sp of s.spalten) {
        const { rows } = await db.query(`
          select 1 from pg_index i
            join pg_class c on c.oid = i.indexrelid
            join pg_am a on a.oid = c.relam
            join pg_attribute att on att.attrelid = i.indrelid and att.attnum = i.indkey[0]
           where i.indrelid = $1::regclass and a.amname = 'gin' and i.indnatts = 1 and att.attname = $2
             and pg_get_indexdef(i.indexrelid) like '%gin_trgm_ops%'`, [`public.${s.tabelle}`, sp]);
        if (rows.length === 0) fehlt.push(`${s.tabelle}.${sp}`);
      }
    }
    expect(fehlt).toEqual([]);
  });

  it('die Suche nach Kennungen nimmt den Index — Gegenprobe: über die Tabelle mit Zeilenschutz nie', async () => {
    await db.query('savepoint plan');
    try {
      await db.query('set local session_replication_role = replica');
      await db.query(`insert into public.customers (company_id, name) select $1, 'Kunde ' || md5(i::text) from generate_series(1, 20000) i`, [B]);
      await db.query('set local session_replication_role = origin');
      await db.query(`select gin_clean_pending_list(i.indexrelid::regclass) from pg_index i join pg_class c on c.oid = i.indexrelid
                       join pg_am a on a.oid = c.relam where i.indrelid = 'public.customers'::regclass and a.amname = 'gin'`);
      await db.query('analyze public.customers');
      const plan = async () => JSON.stringify((await db.query(`explain (format json)
        select t.id from public.customers t where t.company_id = any(array[$1]) and (t.name ilike '%zirkon%' or t.address ilike '%zirkon%')`,
      [B])).rows[0]['QUERY PLAN']);
      expect(await plan()).toContain('customers_suche_name');
      const ueberTabelle = await als(KONTO.Verwaltung, B, async () => {
        await db.query('set local enable_seqscan = off');
        return JSON.stringify((await db.query(`explain (format json)
          select id from public.customers where company_id = $1 and (name ilike '%zirkon%' or address ilike '%zirkon%')`, [B])).rows[0]['QUERY PLAN']);
      });
      expect(ueberTabelle).not.toContain('customers_suche_name');
    } finally {
      await db.query('rollback to savepoint plan');
    }
  }, 120_000);
});
