import { it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
const B = 'arbeitskopie';
let db: Client, schreiber: Client, chef: Konto;
let kunde: string;
beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  schreiber = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect(); await schreiber.connect();
  await betriebAnlegen(B, 'Stand-0'); chef = await konto(B, 'Geschäftsführung', 'kopie');
  kunde = (await db.query("insert into customers(company_id,name) values($1,'Stand-0') returning id", [B])).rows[0].id;
});
afterAll(async () => { await db?.end(); await schreiber?.end(); });
it('liest bei parallelen Transaktionen keinen gemischten Stand', async () => {
  const schreiben = (async () => {
    for (let i = 1; i <= 15; i++) {
      await schreiber.query('begin');
      await schreiber.query('update companies set name=$2 where id=$1', [B, `Stand-${i}`]);
      await schreiber.query('select pg_sleep(0.01)');
      await schreiber.query('update customers set name=$2 where id=$1', [kunde, `Stand-${i}`]);
      await schreiber.query('commit');
    }
  })();
  try {
    for (let i = 0; i < 15; i++) {
      const { data: lauf, error } = await admin.rpc('auszug_snapshot_start', { p_betrieb: B });
      expect(error).toBeNull();
      const { rows } = await db.query(`select inhalt->>'sammlung' as sammlung, inhalt->'daten'->>'name' as name
        from app.auszug_arbeitsstand where lauf=$1 and inhalt->>'sammlung' in ('companies','customers')`, [lauf]);
      expect(rows).toHaveLength(2); expect(rows[0].name).toBe(rows[1].name);
      await admin.rpc('auszug_snapshot_ende', { p_lauf: lauf });
    }
  } finally { await schreiben; }
});
it('nennt Arbeitskopien in der Personenauskunft und löscht sie bei der Personenlöschung', async () => {
  const { data: lauf, error } = await admin.rpc('auszug_snapshot_start', { p_betrieb: B });
  expect(error).toBeNull();
  expect(Number((await admin.rpc('auszug_snapshot_anzahl', { p_lauf: lauf })).data)).toBeGreaterThan(0);
  const auskunft = await chef.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kunde });
  expect(auskunft.error).toBeNull();
  expect(auskunft.data.daten.sicherung_arbeitskopien).toHaveLength(1);
  const probe = await chef.client.rpc('person_loeschen', { p_art: 'kunde', p_id: kunde, p_nur_pruefen: true });
  expect(probe.error).toBeNull();
  expect(Number((await admin.rpc('auszug_snapshot_anzahl', { p_lauf: lauf })).data)).toBeGreaterThan(0);
  const weg = await chef.client.rpc('person_loeschen', { p_art: 'kunde', p_id: kunde, p_nur_pruefen: false });
  expect(weg.error).toBeNull();
  expect(Number((await admin.rpc('auszug_snapshot_anzahl', { p_lauf: lauf })).data)).toBe(0);
});
