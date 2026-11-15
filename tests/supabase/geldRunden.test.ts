/**
 * Eine Rundung für Geld — gegen die echte Datenbank (Durchsicht 15.11.2026, G7).
 *
 * Zwei Fragen:
 *
 *   1. Rundet die App wie Postgres? Dieselben Grenzfälle wie
 *      `tests/unit/geldRunden.test.ts` gehen durch `round(numeric, 2)` — als
 *      exakter Dezimalwert, so wie die Datenbank sie sieht —, dazu
 *      zufällige Produkte „Menge × Preis“ und die Formeln, mit denen die
 *      Datenbank selbst Geld rundet (Skonto, Rücklass, Verkaufspreis).
 *   2. Hält die Rechnung den zugesagten Skonto fest (`skonto_zugesagt`), so
 *      dass der Nachdruck ihn nicht neu rechnet — und lässt die Prüfung
 *      beim Ausgleich genau diesen Betrag zu?
 *
 * Gegenprobe: mit der alten App-Rundung sind in (1) die Halbcent-Fälle rot
 * (4,25 × 72,30 → App 307,27, Datenbank 307,28); ohne die Migration
 * `20261115400000_geld_runden.sql` fehlt in (2) die Spalte.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { createZahlungMitSkonto } from '@/lib/db/pg/zahlungen';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { cent } from '@/lib/betrag';
import { zugesagterSkonto } from '@/features/invoices/skonto';
import { ruecklassBetrag } from '@/features/invoices/ruecklass';
import { verkaufspreisVorschlag } from '@/lib/aufschlag';
import { druckAngaben } from '@/features/invoices/nachdruck';
import type { Company, Invoice } from '@/types';
import { GELD_GRENZFAELLE } from '../fixtures/geldGrenzfaelle';

const BETRIEB = 'geld-runden-g7';
const JAHR = new Date().getFullYear();

let db: Client;
let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g7buch');
  clientEinreichen(buch.client);
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await db?.end();
});
afterEach(() => clientEinreichen(buch.client));

async function sql(text: string, werte: unknown[] = []): Promise<string> {
  const { rows } = await db.query<{ r: string }>(`select (${text})::text as r`, werte);
  return rows[0].r;
}

describe('Die App rundet wie round(numeric, 2)', () => {
  it.each(GELD_GRENZFAELLE.werte)('%s → %s', async (wert, erwartet) => {
    const genau = await sql('round($1::numeric, 2)', [wert]);
    expect(Number(genau)).toBe(Number(erwartet));
    expect(cent(Number(wert))).toBe(Number(genau));
    /*
      DER WEG DER APP: aus der Gleitkommazahl auf 15 gültige Stellen, dann
      kaufmännisch — genau so wandelt Postgres `float8` in `numeric`. Sind
      beide Wege gleich, ist die Rundung der App die der Datenbank.
    */
    expect(Number(await sql('round($1::float8::numeric, 2)', [wert]))).toBe(Number(genau));
  });

  it.each(GELD_GRENZFAELLE.produkte)('%s × %s → %s', async (a, b, erwartet) => {
    const genau = await sql('round($1::numeric * $2::numeric, 2)', [a, b]);
    expect(Number(genau)).toBe(Number(erwartet));
    expect(cent(Number(a) * Number(b))).toBe(Number(genau));
  });

  it('5.000 zufällige Produkte Menge × Preis — dieselbe Rundung in App und Datenbank', async () => {
    const mengen: string[] = [];
    const preise: string[] = [];
    for (let i = 0; i < 5000; i++) {
      // Mengen in Viertelstunden bis drei Nachkommastellen, Preise bis 99.999,99 € — auch negativ (Abzug).
      const menge = (Math.floor(Math.random() * 400_000) / 1000) * (Math.random() < 0.1 ? -1 : 1);
      mengen.push(menge.toFixed(3));
      preise.push((Math.floor(Math.random() * 9_999_999) / 100).toFixed(2));
    }
    const { rows } = await db.query<{ r: string }>(
      'select round(m::numeric * p::numeric, 2)::text as r from unnest($1::text[], $2::text[]) as x(m, p)',
      [mengen, preise],
    );
    const abweichend = rows
      .map((z, i) => ({ menge: mengen[i], preis: preise[i], datenbank: Number(z.r), app: cent(Number(mengen[i]) * Number(preise[i])) }))
      .filter((z) => z.app !== z.datenbank);
    expect(abweichend).toEqual([]);
  });

  it('die Formeln, mit denen die Datenbank selbst Geld rundet, ergeben dasselbe wie die App', async () => {
    // `app.skonto_passt`: Skonto vom Zahlbetrag.
    expect(Number(await sql('round((106.75 - 0) * 2 / 100, 2)'))).toBe(
      zugesagterSkonto({ totalBrutto: 106.75, skontoProzent: 2, ruecklassBetrag: null }));
    // `rechnung_anlegen`: Rücklass von der ganzen Leistung.
    expect(Number(await sql('round(8.20 * 7.5 / 100, 2)'))).toBe(
      ruecklassBetrag({ grundlageBrutto: 8.2, prozent: 7.5, forderungBrutto: 8.2 }));
    // `verkaufspreise_vorschlagen`: Einkaufspreis plus Aufschlag.
    expect(Number(await sql('round(10.02 * (1 + 25::numeric / 100), 2)'))).toBe(
      verkaufspreisVorschlag(10.02, { standard: 25 }));
  });
});

/** 106,75 € brutto; mit Skonto 2 % bis zum 07.05. — 2 % sind 2,135 €, also 2,14 €. */
async function ausstellen(extra: Partial<Invoice> = { skontoProzent: 2, skontoBis: `${JAHR}-05-07` }) {
  const { id } = await rechnungen.rechnungAusstellen(BETRIEB, {
    projectNumber: 'G7-1',
    customerName: 'Baumeister Gruber',
    address: 'Bergweg 3, 2700 Wiener Neustadt',
    invoiceDate: `${JAHR}-04-30`, leistungVon: `${JAHR}-04-30`, leistungBis: `${JAHR}-04-30`,
    dueDate: `${JAHR}-05-14`,
    subtotalNetto: 88.96,
    totalNetto: 88.96,
    totalVat: 17.79,
    totalBrutto: 106.75,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 88.96, netto: 88.96 }],
    ...extra,
  }, { praefix: 'RE', datumAusdruecklich: true });
  return id;
}

async function zugesagt(id: string): Promise<number | null> {
  const { data, error } = await admin.from('invoices').select('skonto_zugesagt').eq('id', id).single();
  if (error) throw new Error(error.message);
  const z = (data as { skonto_zugesagt: number | string | null }).skonto_zugesagt;
  return z == null ? null : Number(z);
}

describe('Der zugesagte Skonto steht am Beleg', () => {
  it('wird beim Anlegen festgehalten — so, wie die App ihn druckt', async () => {
    const id = await ausstellen();
    expect(await zugesagt(id)).toBe(2.14);
    expect(zugesagterSkonto({ totalBrutto: 106.75, skontoProzent: 2, ruecklassBetrag: null })).toBe(2.14);
  });

  it('und genau diesen Betrag lässt der Ausgleich zu: 104,61 € bezahlt, 2,14 € Skonto', async () => {
    const id = await ausstellen();
    await createZahlungMitSkonto(BETRIEB, {
      invoiceId: id, datum: `${JAHR}-05-05`, betrag: 104.61, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    }, 2.14);
    const { data } = await admin.from('invoices').select('payment_status, skonto_betrag').eq('id', id).single();
    expect(data).toMatchObject({ payment_status: 'Bezahlt' });
    expect(Number((data as { skonto_betrag: number }).skonto_betrag)).toBe(2.14);
  });

  it('ohne Skonto bleibt er leer', async () => {
    const id = await ausstellen({});
    expect(await zugesagt(id)).toBeNull();
  });

  it('lässt sich danach nicht ändern — er gehört zum Beleg', async () => {
    const id = await ausstellen();
    const r = await buch.client.from('invoices').update({ skonto_zugesagt: 2.13 }).eq('id', id);
    expect(r.error?.code).toBe('42501');
    expect(await zugesagt(id)).toBe(2.14);
  });

  it('die App liest ihn, und der Nachdruck nimmt ihn, statt neu zu rechnen', async () => {
    const id = await ausstellen();
    const [inv] = await rechnungen.listInvoicesByIds(BETRIEB, [id]);
    expect(inv.skontoZugesagt).toBe(2.14);
    const angaben = druckAngaben({ id: BETRIEB, name: BETRIEB } as Company, inv);
    expect(angaben.skonto).toEqual({ skontoProzent: 2, skontoBis: `${JAHR}-05-07`, betrag: 2.14 });
  });
});
