/**
 * Die Reparatur nach dem vertauschten Preiskennzeichen (offene Punkte A3).
 *
 * Bis 29.09.2026 las der Leser „1" als Nettopreis; nach der Norm ist es der
 * Listenpreis. Übernommen wurde er damit als Einkaufspreis. Die Migration
 * `20260929170000_datanorm_preiskennzeichen.sql` rechnet das nach.
 *
 * Hier wird ihr Zustand nachgestellt — ein Lauf mit „netto"-Zeilen, wie ihn
 * der alte Leser erzeugt hat — und die Migration in einer Transaktion noch
 * einmal ausgeführt, geprüft und zurückgerollt. Andere Prüfungen sehen davon
 * nichts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as dn from '@/lib/db/pg/datanorm';
import { clientEinreichen } from '@/lib/db/pg/kern';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const BETRIEB = 'dn-kennz';
const MIGRATION = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260929170000_datanorm_preiskennzeichen.sql'),
  'utf8',
);

let db: Client;
let chefin: Konto;
let lieferant: string;

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'kennzgf');
  clientEinreichen(chefin.client);
  lieferant = await dn.lieferantAnlegen(BETRIEB, 'HTI Grosshandel');
  await dn.rabattsatzSetzen(BETRIEB, lieferant, '10', 40);

  // Ein Katalog, wie ihn der alte Leser übernommen hat.
  const zeilen: dn.DatanormZeile[] = [
    { zeile: 1, artikelnummer: 'K-MIT-SATZ', name: 'Eckventil', preis: 100, preisArt: 'netto', rabattgruppe: '10', verarbeitung: 'neu' },
    { zeile: 2, artikelnummer: 'K-OHNE-SATZ', name: 'Kugelhahn', preis: 50, preisArt: 'netto', rabattgruppe: '99', verarbeitung: 'neu' },
    { zeile: 3, artikelnummer: 'K-VON-HAND', name: 'Bogen', preis: 20, preisArt: 'netto', rabattgruppe: '10', verarbeitung: 'neu' },
    { zeile: 4, artikelnummer: 'K-NULL', name: 'Muffe', preis: 10, preisArt: 'liste', rabattgruppe: '10', verarbeitung: 'neu' },
  ];
  const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'alt.001', 'cp850', { artikel: zeilen.length });
  await dn.zeilenSchicken(BETRIEB, lauf, zeilen);
  await dn.uebernehmen(lauf);

  // Seither von Hand korrigiert — das bleibt.
  const { data } = await admin.from('materials').select('id').eq('company_id', BETRIEB).eq('article_number', 'K-VON-HAND').single();
  await admin.from('material_einkaufspreise').update({ einkaufspreis: 11.11 }).eq('material_id', (data as { id: string }).id);
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.end();
});

async function einkauf(artikel: string): Promise<number | null> {
  const r = await db.query(
    `select e.einkaufspreis from public.material_einkaufspreise e
       join public.materials m on m.id = e.material_id
      where m.company_id = $1 and m.article_number = $2`,
    [BETRIEB, artikel],
  );
  return r.rows[0]?.einkaufspreis == null ? null : Number(r.rows[0].einkaufspreis);
}

describe('Die Migration rechnet die Einkaufspreise nach', () => {
  it('ein noch offener Probelauf wird mit der richtigen Art übernommen', async () => {
    const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'offen.001', 'cp850', { artikel: 1 });
    await dn.zeilenSchicken(BETRIEB, lauf, [
      { zeile: 1, artikelnummer: 'K-OFFEN', name: 'Rohr', preis: 10, preisArt: 'netto', verarbeitung: 'neu' },
    ]);
    await db.query('begin');
    try {
      await db.query(MIGRATION);
      const r = await db.query('select preis_art from public.datanorm_zeilen where lauf_id = $1', [lauf]);
      expect(r.rows[0].preis_art).toBe('liste');
    } finally {
      await db.query('rollback');
      await dn.laufVerwerfen(lauf);
    }
  });

  it('vorher: der alte Leser hatte den Listenpreis als Einkauf übernommen', async () => {
    expect(await einkauf('K-MIT-SATZ')).toBe(100);
    expect(await einkauf('K-OHNE-SATZ')).toBe(50);
  });

  it('nachher: mit Rabattsatz gerechnet, ohne geleert, von Hand und aus „0" unberührt', async () => {
    await db.query('begin');
    try {
      await db.query(MIGRATION);
      expect(await einkauf('K-MIT-SATZ')).toBe(60); // 100 − 40 %
      expect(await einkauf('K-OHNE-SATZ')).toBeNull();
      expect(await einkauf('K-VON-HAND')).toBe(11.11);
      expect(await einkauf('K-NULL')).toBe(6); // aus „0", vorher schon mit Rabatt gerechnet
      // Die Preisgeschichte nennt den Listenpreis jetzt als solchen.
      const geschichte = await db.query(
        `select m.article_number, p.listenpreis, p.einkaufspreis from public.material_prices p
           join public.materials m on m.id = p.material_id
          where m.company_id = $1 order by m.article_number`,
        [BETRIEB],
      );
      expect(geschichte.rows.map((r) => [r.article_number, Number(r.listenpreis), r.einkaufspreis == null ? null : Number(r.einkaufspreis)]))
        .toEqual([['K-MIT-SATZ', 100, 60], ['K-NULL', 10, 6], ['K-OHNE-SATZ', 50, null], ['K-VON-HAND', 20, 12]]);
    } finally {
      await db.query('rollback');
    }
  });
});
