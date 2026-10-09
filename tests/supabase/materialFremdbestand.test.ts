import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const EIGEN = 'material-leserecht-eigen';
const FREMD = 'material-leserecht-fremd';
let monteur: Konto;
let gesperrt: Konto;
let eigenerArtikel: string;
let db: Client;

beforeAll(async () => {
  await betriebAnlegen(EIGEN);
  await betriebAnlegen(FREMD);
  monteur = await konto(EIGEN, 'Mitarbeiter', 'material-scope');
  gesperrt = await konto(EIGEN, 'Mitarbeiter', 'material-gesperrt', false);
  db = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");
  const { rows } = await db.query(`insert into public.materials(company_id, name, stock)
    values ($1, 'Eigener Artikel', 7) returning id`, [EIGEN]);
  eigenerArtikel = rows[0].id;
  await db.query(`insert into public.materials(company_id, name, stock)
    select $1, 'Fremdartikel ' || i, 0 from generate_series(1,40000) i`, [FREMD]);
}, 120_000);

afterAll(async () => {
  if (!db) return;
  try {
    await db.query('delete from public.materials where company_id = any($1::text[])', [[EIGEN, FREMD]]);
  } finally {
    await db.end();
  }
});

it('prüft tatsächlich einen Katalog mit 40.000 fremden Artikeln', async () => {
  const r = await admin.from('materials').select('id', { count: 'exact', head: true }).eq('company_id', FREMD);
  expect(r.error).toBeNull();
  expect(r.count).toBe(40000);
});

it('liest ohne Client-Betriebsfilter ausschließlich den eigenen Artikel, innerhalb des SQL-Zeitlimits', async () => {
  const r = await monteur.client.from('materials').select('id,name,stock,company_id');
  expect(r.error).toBeNull();
  expect(r.data).toEqual([{ id: eigenerArtikel, name: 'Eigener Artikel', stock: 7, company_id: EIGEN }]);
});

it('ein deaktiviertes Konto sieht auch den eigenen Artikel nicht', async () => {
  const r = await gesperrt.client.from('materials').select('id');
  expect(r.error).toBeNull();
  expect(r.data).toEqual([]);
});
