/**
 * Inventur als Zählliste (Durchsicht 15.11.2026, F14) — gegen die Datenbank.
 *
 * VORHER (nachgestellt): Inventur ging nur Artikel für Artikel
 * (`lager_inventur`), und sie setzte den Bestand absolut — was zwischen
 * Zählen und Eintragen entnommen wurde, war danach still wieder da. Ohne
 * `20261117032000_inventur_zaehlliste.sql` gibt es die Funktionen nicht —
 * jede Prüfung hier außer „bleibt gleich“ ist dann rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import {
  inventurAnlegen,
  inventurBuchen,
  inventurLaden,
  inventurListen,
  inventurVerwerfen,
  inventurVorschau,
  inventurZaehlen,
  inventurArtikelHinzufuegen,
} from '@/lib/db/pg/inventur';
import { lagerEingang, lagerInventur } from '@/lib/db/pg/materials';
import { clientEinreichen } from '@/lib/db/pg/kern';

const A = 'inv-f14';
const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
let verwaltung: Konto;
let leitung: Konto;
let buchhaltung: Konto;
let monteur: Konto;
let db: Client;
let fahrzeugOrt: string;

const kurz = () => crypto.randomUUID().slice(0, 6);

beforeAll(async () => {
  await betriebAnlegen(A);
  await admin.from('companies').update({ modules: { 'material.lagerorte_fahrzeuglager': true } }).eq('id', A);
  verwaltung = await konto(A, 'Verwaltung', 'invverw');
  leitung = await konto(A, 'Projektleiter', 'invpl');
  buchhaltung = await konto(A, 'Buchhaltung', 'invbuch');
  monteur = await konto(A, 'Mitarbeiter', 'invmont');
  db = new Client({ connectionString: DB });
  await db.connect();
  const { data: f } = await admin.from('fahrzeuge').insert({ company_id: A, kennzeichen: `W-${kurz()}` }).select('id, kennzeichen').single();
  const { data: o, error } = await admin.from('lagerorte')
    .insert({ company_id: A, art: 'fahrzeug', bezeichnung: f!.kennzeichen, fahrzeug_id: f!.id }).select('id').single();
  if (error) throw new Error(error.message);
  fahrzeugOrt = o!.id;
  clientEinreichen(verwaltung.client);
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.end();
});

/** Ein Lagerartikel mit Bestand im Hauptlager — eingespielt wie eine Sicherung, ohne Bewegung. */
async function artikel(stock: number, x: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin.from('materials')
    .insert({ company_id: A, name: `Artikel ${kurz()}`, unit: 'Stk', lagerartikel: true, stock, warengruppe: `G-${kurz()}`, ...x })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Eine Entnahme, wie sie die Abholung bucht: mit Bewegung, als angemeldetes Konto. */
async function entnehmen(material: string, menge: number): Promise<void> {
  await db.query('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: verwaltung.uid, role: 'authenticated', app_metadata: { company_id: A } })]);
    await db.query('set local role authenticated');
    await db.query(`select set_config('app.lager_art', 'entnahme', true), set_config('app.lager_buchung', 'ja', true)`);
    await db.query('update public.materials set stock = stock - $1 where id = $2', [menge, material]);
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

async function bestand(material: string): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', material).single();
  return Number(data!.stock);
}

async function zeileVon(liste: string, material: string): Promise<string> {
  const l = await inventurLaden(liste);
  return l.zeilen.find((z) => z.materialId === material)!.id;
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Zählliste anlegen (F14)', () => {
  it('umfasst, was die Auswahl trifft — ein Artikel steht je Ort nur auf einer offenen Liste', async () => {
    const gruppe = `Rohre ${kurz()}`;
    const a = await artikel(10, { warengruppe: gruppe });
    const b = await artikel(0, { warengruppe: gruppe });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: gruppe });
    expect(r).toEqual(expect.objectContaining({ artikel: 1, uebersprungen: 0 }));
    expect((await inventurLaden(r.id)).zeilen.map((z) => z.materialId)).toEqual([a]);
    // Alle Lagerartikel der Gruppe: der ohne Bestand kommt dazu, der andere steht schon auf der offenen Liste.
    const r2 = await inventurAnlegen({ ort: '', umfang: 'lagerartikel', warengruppe: gruppe });
    expect(r2).toEqual(expect.objectContaining({ artikel: 1, uebersprungen: 1 }));
    expect((await inventurLaden(r2.id)).zeilen.map((z) => z.materialId)).toEqual([b]);
    await expect(inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: gruppe })).rejects.toThrow(/stehen schon auf einer offenen Zählliste/);
  });

  it('ein Stichtag vor dem Bewegungsprotokoll lässt sich nicht nachrechnen', async () => {
    await artikel(1, { warengruppe: 'alt' });
    await expect(inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: 'alt', stichtag: '2026-01-01T00:00:00Z' }))
      .rejects.toThrow(/vor dem Beginn des Bewegungsprotokolls/);
  });

  it('zählen und buchen die Verwaltung und die Leitung; die Buchhaltung liest; der Monteur nichts', async () => {
    const g = `R ${kurz()}`;
    await artikel(3, { warengruppe: g });
    clientEinreichen(monteur.client);
    await expect(inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g })).rejects.toThrow(/Verwaltung oder die Leitung/);
    clientEinreichen(leitung.client);
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    clientEinreichen(buchhaltung.client);
    expect((await inventurListen()).some((l) => l.id === r.id)).toBe(true);
    const zeile = (await inventurLaden(r.id)).zeilen[0].id;
    await expect(inventurZaehlen(zeile, 3)).rejects.toThrow(/Verwaltung oder die Leitung/);
    clientEinreichen(verwaltung.client);
  });
});

describe('Zählen und buchen (F14)', () => {
  it('am Handy: verglichen wird mit dem Bestand beim Zählen — was danach hinein- und hinausging, bleibt', async () => {
    const g = `H ${kurz()}`;
    const a = await artikel(10, { warengruppe: g });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    // Gezählt: 8 (zwei fehlen). Danach gehen 3 hinaus und 5 kommen herein.
    await inventurZaehlen(await zeileVon(r.id, a), 8);
    await warte(20);
    await entnehmen(a, 3);
    await lagerEingang({ materialId: a, menge: 5, lieferant: 'Großhandel' });
    expect(await bestand(a)).toBe(12);

    const v = await inventurVorschau(r.id);
    const z = v.zeilen.find((x) => x.material === a)!;
    expect(z).toEqual(expect.objectContaining({ soll: 10, gezaehlt: 8, abweichung: -2, jetzt: 12, danach: 10, ueberholt: false, konflikt: null }));

    const b = await inventurBuchen(r.id, 'Inventur Test', {}, v.stand);
    expect(b).toEqual({ art: 'gebucht', gebucht: 1, abweichend: 1, ueberholt: 0, nichtGezaehlt: 0 });
    // Bleibt erhalten: die Entnahme und der Wareneingang nach der Zählung.
    expect(await bestand(a)).toBe(10);
    const { data: bw } = await admin.from('lagerbewegungen').select('art, menge, grund, bezug').eq('material_id', a).eq('art', 'inventur');
    expect(bw).toEqual([expect.objectContaining({ menge: -2, grund: 'Inventur Test' })]);
    expect(bw![0].bezug).toMatch(/^Inventur Hauptlager vom \d{2}\.\d{2}\.\d{4}$/);
    const l = await inventurLaden(r.id);
    expect(l.zustand).toBe('gebucht');
    expect(l.zeilen[0]).toEqual(expect.objectContaining({ ergebnis: 'gebucht', soll: 10, abweichung: -2, bestandVorher: 12, bestandNachher: 10 }));
  });

  it('bleibt gleich: die Einzelinventur setzt den Bestand wie bisher absolut', async () => {
    const a = await artikel(7);
    await lagerInventur(a, 4, 'Bruch');
    expect(await bestand(a)).toBe(4);
  });

  it('gestimmt steht mit null im Protokoll; nicht gezählt bleibt unverändert; ein eigener Grund je Zeile', async () => {
    const g = `S ${kurz()}`;
    const a = await artikel(5, { warengruppe: g });
    const b = await artikel(2, { warengruppe: g });
    const c = await artikel(9, { warengruppe: g });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    await inventurZaehlen(await zeileVon(r.id, a), 5);
    await inventurZaehlen(await zeileVon(r.id, b), 3);
    const v = await inventurVorschau(r.id);
    const zb = v.zeilen.find((x) => x.material === b)!.zeile;
    await inventurBuchen(r.id, 'Jahresinventur', { [zb]: 'Fund im Regal' }, v.stand);
    expect([await bestand(a), await bestand(b), await bestand(c)]).toEqual([5, 3, 9]);
    const { data: bw } = await admin.from('lagerbewegungen').select('material_id, menge, grund').in('material_id', [a, b, c]).eq('art', 'inventur');
    expect(bw!.find((x) => x.material_id === a)).toEqual(expect.objectContaining({ menge: 0, grund: 'Jahresinventur' }));
    expect(bw!.find((x) => x.material_id === b)).toEqual(expect.objectContaining({ menge: 1, grund: 'Fund im Regal' }));
    expect(bw!.some((x) => x.material_id === c)).toBe(false);
    expect((await inventurLaden(r.id)).zeilen.find((z) => z.materialId === c)!.ergebnis).toBe('nicht_gezaehlt');
  });

  it('nach der Zählung einzeln inventiert: die Zeile ist überholt, die spätere Zählung gilt', async () => {
    const g = `U ${kurz()}`;
    const a = await artikel(6, { warengruppe: g });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    await inventurZaehlen(await zeileVon(r.id, a), 4);
    await warte(20);
    await lagerInventur(a, 5, 'Nachgezählt');
    const v = await inventurVorschau(r.id);
    expect(v.zeilen[0].ueberholt).toBe(true);
    const b = await inventurBuchen(r.id, 'Inventur', {}, v.stand);
    expect(b).toEqual(expect.objectContaining({ ueberholt: 1, abweichend: 0 }));
    expect(await bestand(a)).toBe(5);
  });

  it('mehr entnommen als gezählt: nichts gebucht, der Artikel genannt', async () => {
    const g = `K ${kurz()}`;
    const a = await artikel(10, { warengruppe: g });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    await inventurZaehlen(await zeileVon(r.id, a), 2);
    await warte(20);
    await entnehmen(a, 9);
    const v = await inventurVorschau(r.id);
    expect(v.zeilen[0].konflikt).toMatch(/bitte neu zählen/);
    await expect(inventurBuchen(r.id, 'Inventur', {}, v.stand)).rejects.toThrow(/Nichts gebucht/);
    expect(await bestand(a)).toBe(1);
    expect((await inventurLaden(r.id)).zustand).toBe('offen');
  });

  it('hat sich eine Zählung seit der Vorschau geändert, wird nichts gebucht', async () => {
    const g = `V ${kurz()}`;
    const a = await artikel(4, { warengruppe: g });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    const zeile = await zeileVon(r.id, a);
    await inventurZaehlen(zeile, 4);
    const v = await inventurVorschau(r.id);
    await inventurZaehlen(zeile, 3);
    const b = await inventurBuchen(r.id, 'Inventur', {}, v.stand);
    expect(b.art).toBe('veraltet');
    expect(await bestand(a)).toBe(4);
    if (b.art === 'veraltet') expect(b.vorschau.zeilen[0].gezaehlt).toBe(3);
  });

  it('ohne eine einzige Zählung wird nicht gebucht — die Liste bleibt offen', async () => {
    const g = `N ${kurz()}`;
    await artikel(3, { warengruppe: g });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    const v = await inventurVorschau(r.id);
    await expect(inventurBuchen(r.id, 'Inventur', {}, v.stand)).rejects.toThrow(/noch nichts gezählt/);
    expect((await inventurLaden(r.id)).zustand).toBe('offen');
  });

  it('zum Stichtag in der Zukunft: zählen ja, buchen erst danach', async () => {
    const g = `Z ${kurz()}`;
    const a = await artikel(4, { warengruppe: g });
    const morgen = new Date(Date.now() + 86_400_000).toISOString();
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g, stichtag: morgen });
    await inventurZaehlen(await zeileVon(r.id, a), 4);
    const v = await inventurVorschau(r.id);
    await expect(inventurBuchen(r.id, 'Inventur', {}, v.stand)).rejects.toThrow(/erst danach/);
  });

  it('im Fahrzeug: zum Stichtag gezählt, danach Ware umgelagert — gebucht wird nur die Abweichung am Ort', async () => {
    const a = await artikel(0);
    await admin.from('lagerbestaende').insert({ lagerort_id: fahrzeugOrt, material_id: a, company_id: A, menge: 6 });
    const stichtag = new Date(Date.now() - 1000).toISOString();
    await warte(1100);
    const r = await inventurAnlegen({ ort: fahrzeugOrt, umfang: 'bestand', suche: '', stichtag });
    const zeile = await zeileVon(r.id, a);
    await inventurZaehlen(zeile, 5);
    // Nach dem Stichtag: 3 Stück ins Fahrzeug.
    await lagerEingang({ materialId: a, menge: 3, lieferant: 'Großhandel', ortId: fahrzeugOrt });
    const v = await inventurVorschau(r.id);
    expect(v.zeilen.find((x) => x.material === a)).toEqual(expect.objectContaining({ soll: 6, gezaehlt: 5, abweichung: -1, jetzt: 9, danach: 8 }));
    await inventurBuchen(r.id, 'Inventur Fahrzeug', {}, v.stand);
    const { data: b } = await admin.from('lagerbestaende').select('menge').eq('lagerort_id', fahrzeugOrt).eq('material_id', a).single();
    expect(Number(b!.menge)).toBe(8);
    const { data: bw } = await admin.from('lagerbewegungen').select('menge, lagerort_id').eq('material_id', a).eq('art', 'inventur');
    expect(bw).toEqual([{ menge: -1, lagerort_id: fahrzeugOrt }]);
  });

  it('im Hauptlager lässt sich nur ein Lagerartikel ergänzen', async () => {
    const g = `E ${kurz()}`;
    await artikel(1, { warengruppe: g });
    const kein = await artikel(0, { lagerartikel: false });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    await expect(inventurArtikelHinzufuegen(r.id, kein)).rejects.toThrow(/kein Lagerartikel/);
    const neu = await artikel(0);
    await inventurArtikelHinzufuegen(r.id, neu);
    expect((await inventurLaden(r.id)).zeilen.some((z) => z.materialId === neu)).toBe(true);
  });

  it('eine offene Liste lässt sich verwerfen, eine gebuchte nicht — sie ist das Protokoll', async () => {
    const g = `W ${kurz()}`;
    const a = await artikel(2, { warengruppe: g });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    await inventurVerwerfen(r.id);
    await expect(inventurLaden(r.id)).rejects.toThrow(/gibt es in diesem Betrieb nicht/);
    const r2 = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    await inventurZaehlen(await zeileVon(r2.id, a), 2);
    const v = await inventurVorschau(r2.id);
    await inventurBuchen(r2.id, 'Inventur', {}, v.stand);
    await expect(inventurVerwerfen(r2.id)).rejects.toThrow(/Protokoll der Inventur und bleibt/);
  });
});

describe('Personenbezug (F14)', () => {
  it('die Datenauskunft zählt die Zählungen einer Person', async () => {
    clientEinreichen(verwaltung.client);
    const g = `P ${kurz()}`;
    const a = await artikel(1, { warengruppe: g });
    const r = await inventurAnlegen({ ort: '', umfang: 'bestand', warengruppe: g });
    await inventurZaehlen(await zeileVon(r.id, a), 1);
    const chefin = await konto(A, 'Geschäftsführung', 'invchef');
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: verwaltung.uid });
    expect(error).toBeNull();
    expect(data.als_bearbeiter.inventur_gezaehlt).toBeGreaterThanOrEqual(1);
  });

  it('angemeldete Konten dürfen die Tabellen nur lesen — auch kein Leeren (truncate fragt den Zeilenschutz nicht)', async () => {
    const { rows } = await db.query<{ t: string; r: string }>(
      `select table_name as t, string_agg(privilege_type, ',' order by privilege_type) as r
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'authenticated' and table_name in ('inventuren', 'inventur_zeilen')
        group by 1 order by 1`);
    expect(rows).toEqual([{ t: 'inventur_zeilen', r: 'SELECT' }, { t: 'inventuren', r: 'SELECT' }]);
  });

  it('Schreiben nur über die Funktionen: die Tabellen haben keine Schreibregel', async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_policies where schemaname = 'public' and tablename in ('inventuren', 'inventur_zeilen') and cmd <> 'SELECT'`);
    expect(rows[0].n).toBe('0');
    const { error } = await verwaltung.client.from('inventur_zeilen').update({ gezaehlt: 99 }).neq('id', crypto.randomUUID());
    // Kein Fehler, aber auch keine Wirkung: der Zeilenschutz lässt nichts durch.
    expect(error === null || /permission|policy/.test(error.message)).toBe(true);
  });
});
