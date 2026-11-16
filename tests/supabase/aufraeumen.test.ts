/**
 * DAS AUFRÄUMEN VOR DEM LAUF LÄSST DEN MESSBESTAND STEHEN (Durchsicht
 * 15.11.2026).
 *
 * `aufraeumen.ts` leerte vor jedem Lauf alle Tabellen und Konten — auch den
 * Betrieb `ui-testbestand`, dessen gewachsener Bestand Minuten zum Anlegen
 * braucht und gegen den gemessen wird. Jetzt bleiben seine Zeilen und Konten;
 * alles andere geht wie bisher, auch was Schutzregeln sonst festhalten
 * (Betriebsprotokoll, Journal) und die Bezugsgrößen ohne Betrieb.
 *
 * Alles in einer Transaktion, die verworfen wird: die Prüfung räumt die
 * Datenbank der übrigen Prüfungen nicht wirklich ab.
 *
 * Gegenprobe: mit dem Aufräumen davor (alles leeren) fehlen Betrieb, Kunde
 * und Konto des Messbestands — rot.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { leeren, MESSBESTAND, verbinden } from './aufraeumen';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const FREMD = 'aufraeumen-fremd';

/** Wie `setup`: als Eigentümer der Datenbank, wo es geht. */
let db: Client;
beforeAll(async () => {
  db = await verbinden();
});
afterAll(async () => {
  await db.end();
});
beforeEach(async () => {
  await db.query('begin');
});
afterEach(async () => {
  await db.query('rollback');
});

const zahl = async (sql: string, werte: unknown[] = []) =>
  Number((await db.query<{ n: string }>(sql, werte)).rows[0].n);

/** Ein Konto samt Person im Betrieb — direkt geschrieben, wie es der Testbestand tut. */
async function konto(betrieb: string, email: string): Promise<string> {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  await db.query(
    `insert into public.users (id, company_id, name, email, role) values ($1, $2, $3, $4, 'Geschäftsführung')`,
    [id, betrieb, email, email],
  );
  return id;
}

/** Zeilen über alle Tabellen mit Betriebsspalte, die NICHT zum Messbestand gehören. */
async function fremdeZeilen(): Promise<number> {
  const { rows } = await db.query<{ tabelle: string; spalte: string }>(`
    select c.relname as tabelle, a.attname as spalte
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname in ('company_id', 'betrieb_kennung') and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'`);
  let n = 0;
  for (const r of rows) {
    n += await zahl(`select count(*) as n from public."${r.tabelle}" where "${r.spalte}" is distinct from $1`, [MESSBESTAND.betrieb]);
  }
  return n + await zahl('select count(*) as n from public.companies where id <> $1', [MESSBESTAND.betrieb]);
}

async function eingeschalteteAusloeser(): Promise<number> {
  return zahl(`select count(*) as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgenabled = 'O'`);
}

describe('Aufräumen vor dem Lauf', () => {
  it('meint denselben Betrieb wie das Skript des Testbestands', () => {
    // Aus dem Text gelesen: das Skript bindet beim Einbinden seine Prüfung der Adressen ein.
    const skript = readFileSync(join(__dirname, '../../scripts/ui-umbau/testbestand.mjs'), 'utf8');
    const BETRIEB = /export const BETRIEB = '([^']+)'/.exec(skript)?.[1];
    expect(MESSBESTAND.betrieb).toBe(BETRIEB);
    expect(MESSBESTAND.kontoEndung).toBe(`@${BETRIEB}.test`);
  });

  it('verbindet lokal als Eigentümer der Datenbank — sonst bliebe der Messbestand nicht', async () => {
    expect((await db.query('select rolsuper from pg_roles where rolname = current_user')).rows[0].rolsuper).toBe(true);
  });

  // Nach einem ganzen Lauf steht viel in der Datenbank; gelöscht wird hier wirklich (und danach verworfen).
  it('lässt den Messbestand stehen und räumt alles andere — auch, was Schutzregeln festhalten', { timeout: 120_000 }, async () => {
    await db.query(`insert into public.companies (id, name) values ($1, 'Messbestand') on conflict (id) do nothing`, [MESSBESTAND.betrieb]);
    await db.query(`insert into public.companies (id, name) values ($1, 'Fremd')`, [FREMD]);
    const bleibt = await konto(MESSBESTAND.betrieb, `aufraeumen-gf${MESSBESTAND.kontoEndung}`);
    const geht = await konto(FREMD, 'gf@aufraeumen-fremd.test');
    const { rows: [kunde] } = await db.query<{ id: string }>(
      `insert into public.customers (company_id, name) values ($1, 'Kunde, der bleibt') returning id`, [MESSBESTAND.betrieb]);
    await db.query(`insert into public.customers (company_id, name) values ($1, 'Kunde, der geht')`, [FREMD]);
    // Das Betriebsprotokoll lässt sich nicht ändern oder löschen (Auslöser) — das Aufräumen muss es trotzdem können.
    for (const b of [MESSBESTAND.betrieb, FREMD]) {
      await db.query(`insert into public.betrieb_protokoll (betrieb_kennung, aktion) values ($1, 'aktiviert')`, [b]);
    }
    for (const u of [bleibt, geht]) await db.query('insert into public.zwei_faktor_fehlversuche (user_id) values ($1)', [u]);
    await db.query(`insert into public.basiszinssaetze (ab, satz) values ('1999-01-01', 1.5) on conflict do nothing`);
    const ausloeserVorher = await eingeschalteteAusloeser();

    await leeren(db, MESSBESTAND);

    expect(await zahl('select count(*) as n from public.companies where id = $1', [MESSBESTAND.betrieb])).toBe(1);
    expect(await zahl('select count(*) as n from public.customers where id = $1', [kunde.id])).toBe(1);
    expect(await zahl('select count(*) as n from public.users where id = $1', [bleibt])).toBe(1);
    expect(await zahl('select count(*) as n from auth.users where id = $1', [bleibt])).toBe(1);
    expect(await zahl('select count(*) as n from public.zwei_faktor_fehlversuche where user_id = $1', [bleibt])).toBe(1);
    expect(await zahl('select count(*) as n from public.betrieb_protokoll where betrieb_kennung = $1', [MESSBESTAND.betrieb])).toBeGreaterThan(0);

    expect(await fremdeZeilen()).toBe(0);
    expect(await zahl(`select count(*) as n from auth.users where email is null or email not like '%' || $1`, [MESSBESTAND.kontoEndung])).toBe(0);
    expect(await zahl('select count(*) as n from public.zwei_faktor_fehlversuche where user_id = $1', [geht])).toBe(0);
    expect(await zahl('select count(*) as n from public.basiszinssaetze')).toBe(0);
    // Löschen schrieb kein Journal — die eigenen Auslöser ruhten.
    expect(await zahl('select count(*) as n from public.aenderungsjournal where company_id is distinct from $1', [MESSBESTAND.betrieb])).toBe(0);

    // Danach wirken die Schutzregeln wieder.
    expect(await eingeschalteteAusloeser()).toBe(ausloeserVorher);
    await db.query('savepoint schutz');
    await expect(db.query('delete from public.betrieb_protokoll where betrieb_kennung = $1', [MESSBESTAND.betrieb])).rejects.toThrow();
    await db.query('rollback to savepoint schutz');
  });

  it('bleibt gleich: ohne den Messbestand ist danach alles leer, Tabellen wie Konten', { timeout: 120_000 }, async () => {
    const betrieb = 'aufraeumen-gibt-es-nicht';
    await db.query(`insert into public.companies (id, name) values ($1, 'Fremd')`, [FREMD]);
    await konto(FREMD, 'gf@aufraeumen-fremd.test');
    await db.query(`insert into public.basiszinssaetze (ab, satz) values ('1999-01-01', 1.5) on conflict do nothing`);

    await leeren(db, { betrieb, kontoEndung: `@${betrieb}.test` });

    const { rows } = await db.query<{ tabelle: string }>(
      `select tablename as tabelle from pg_tables where schemaname = 'public'`);
    let n = 0;
    for (const r of rows) n += await zahl(`select count(*) as n from public."${r.tabelle}"`);
    expect(n).toBe(0);
    expect(await zahl('select count(*) as n from auth.users')).toBe(0);
  });

  /*
    OHNE DIE RECHTE DES EIGENTÜMERS (etwa eine fremde Umgebung ohne
    `supabase_admin`) leert es wie bisher, samt Messbestand — und sagt es.
  */
  it('ohne Eigentümerrechte: alles leer wie bisher, mit Hinweis', { timeout: 120_000 }, async () => {
    const normal = new Client({ connectionString: DB });
    await normal.connect();
    const hinweise: string[] = [];
    const warn = console.warn;
    console.warn = (t: string) => { hinweise.push(t); };
    try {
      await normal.query('begin');
      await normal.query(`insert into public.companies (id, name) values ($1, 'Messbestand') on conflict (id) do nothing`, [MESSBESTAND.betrieb]);
      await leeren(normal, MESSBESTAND);
      expect(Number((await normal.query('select count(*) as n from public.companies')).rows[0].n)).toBe(0);
      expect(hinweise.join(' ')).toMatch(/SUPABASE_DB_ADMIN_URL/);
    } finally {
      console.warn = warn;
      await normal.query('rollback');
      await normal.end();
    }
  });
});
