/**
 * K8 (Paket 8, 16.11.2026): eine einzelne Zeile über 1 MB bricht die
 * Ausleitung nicht mehr ab.
 *
 * VORHER (nachgestellt am 16.11.2026, in einer zurückgerollten Transaktion):
 * ein Kunde mit 3 MB Notiz → `auszug_snapshot_umfang` meldete 3 Seiten, die
 * zweite gab es nicht. `daten-ausleitung` holt 1 … seiten und bricht bei
 * einer leeren Seite ab — der Nachtlauf dieses Betriebs scheiterte jede Nacht.
 *
 * GEGENPROBE (Erwartung): mit dem alten `auszug_snapshot_start`
 * (20261025100000) sind „keine leere Seite“ und „die Function sichert
 * vollständig“ rot; „bleibt gleich“ ist in beiden Fassungen grün.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, API, ANON, betriebAnlegen, konto, type Konto } from './helfer';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BETRIEB = 'k8-grosse-zeile';
let db: Client;
let chef: Konto;
let pfade: string[] = [];

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'k8-chef');
  await db.query('delete from customers where company_id = $1', [BETRIEB]);
  await db.query(
    `insert into customers (company_id, name, notes) values
       ($1, 'Riese', repeat('x', 3000000)), ($1, 'Klein', 'y'), ($1, 'Noch ein Riese', repeat('z', 1500000))`,
    [BETRIEB],
  );
}, 180_000);

afterAll(async () => {
  await db.query('delete from customers where company_id = $1', [BETRIEB]);
  if (pfade.length) await admin.storage.from('ausleitung').remove(pfade);
  await db.end();
});

describe('Seiten der Ausleitung', () => {
  it('keine leere Seite — auch hinter einer Zeile über 1 MB', async () => {
    const { rows: [{ lauf }] } = await db.query('select public.auszug_snapshot_start($1) as lauf', [BETRIEB]);
    try {
      const { rows: [{ u }] } = await db.query('select public.auszug_snapshot_umfang($1) as u', [lauf]);
      const { rows: [{ leer }] } = await db.query(
        `select count(*)::int as leer from generate_series(1, $2::int) g
          where public.auszug_snapshot_ndjson($1, g) is null`, [lauf, u.seiten],
      );
      expect(leer).toBe(0);
      // Bleibt gleich: jede Zeile genau einmal, die Summe der Seiten ist der Umfang.
      const { rows: [{ n, bytes }] } = await db.query(
        `select count(*)::int as n, sum(octet_length(t))::bigint as bytes
           from generate_series(1, $2::int) g,
                regexp_split_to_table(rtrim(public.auszug_snapshot_ndjson($1, g), E'\\n'), E'\\n') t`,
        [lauf, u.seiten],
      );
      expect(n).toBe(u.zeilen);
      expect(Number(bytes) + n).toBe(Number(u.bytes));
    } finally {
      await db.query('select public.auszug_snapshot_ende($1)', [lauf]);
    }
  }, 120_000);

  it('die Function sichert den Betrieb vollständig', async () => {
    const r = await fetch(`${API}/functions/v1/daten-ausleitung`, {
      method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${chef.token}` },
    });
    const daten = await r.json();
    expect(r.status, JSON.stringify(daten)).toBe(200);
    pfade = daten.pfade;
    let kunden = 0;
    for (const p of pfade) {
      const { data, error } = await admin.storage.from('ausleitung').download(p);
      if (error) throw new Error(error.message);
      kunden += (await data!.text()).split('\n').filter((z) => z.includes('"sammlung":"customers"')
        || z.includes('"sammlung": "customers"')).length;
    }
    expect(kunden).toBe(3);
  }, 240_000);
});
