/**
 * PARALLELE GROSSHÄNDLERKATALOGE, VERIFIZIERTER VERGLEICH, PREISVERLAUF
 * (M03a; `20261107100000_lieferantenartikel.sql`) — gegen eine echte
 * Datenbank.
 *
 * GEGENPROBE: gegen den Stand davor ist jede Prüfung unten rot — es gibt
 * weder `lieferantenartikel` noch die Funktionen, und der zweite Katalog mit
 * derselben Nummer überschrieb den Stammartikel (erster Fall).
 * GLEICH BLEIBT (eigene Prüfungen): mit nur einem Lieferanten werden Name,
 * Einheit und Einkaufspreis aktualisiert wie bisher; ein Katalog ohne Preis
 * leert keinen bekannten Einkaufspreis; der Vorschlag der Einkaufsliste ist
 * ohne Vergleichsbasis der jüngste Preis wie bisher.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';
import * as dn from '@/lib/db/pg/datanorm';
import * as la from '@/lib/db/pg/lieferantenartikel';
import { sucheKatalog, katalogSeite } from '@/lib/db/pg/materials';
import { clientEinreichen } from '@/lib/db/pg/kern';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const MIGRATION = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261107100000_lieferantenartikel.sql'),
  'utf8',
);

const BETRIEB = 'la-a';
const FREMD = 'la-b';

let db: Client;
let chefin: Konto;
let katalog: Konto;
let verwaltung: Konto;
let leitung: Konto;
let monteur: Konto;
let fremdChef: Konto;
let alpha: string;
let beta: string;

let lfd = 0;
const nr = (vorsatz = 'LA') => `${vorsatz}-${++lfd}`;

const zeile = (extra: Partial<dn.DatanormZeile> = {}): dn.DatanormZeile => ({
  zeile: ++lfd,
  artikelnummer: nr(),
  name: 'Eckventil 1/2 Zoll',
  einheit: 'Stk',
  preis: 10,
  preisArt: 'netto',
  verarbeitung: 'neu',
  ...extra,
});

/** Lauf anlegen, Zeilen schicken, in Blöcken übernehmen — wie die App. */
async function einspielen(lieferant: string, zeilen: dn.DatanormZeile[], wer: Konto = chefin) {
  const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'katalog.001', 'cp850', { artikel: zeilen.length }, wer.client);
  await dn.zeilenSchicken(BETRIEB, lauf, zeilen, undefined, wer.client);
  return { lauf, bericht: await dn.uebernehmen(lauf, wer.client) };
}

async function stamm(artikelnummer: string) {
  const { data } = await admin.from('materials').select('*').eq('company_id', BETRIEB)
    .eq('article_number', artikelnummer).maybeSingle();
  if (!data) return null;
  const { data: ek } = await admin.from('material_einkaufspreise').select('einkaufspreis')
    .eq('material_id', (data as { id: string }).id).maybeSingle();
  return { ...(data as Record<string, unknown>), ek: (ek as { einkaufspreis: number } | null)?.einkaufspreis ?? null } as
    Record<string, unknown> & { id: string; ek: number | null };
}

async function lieferantenartikel(lieferant: string, nummer: string) {
  const { data } = await admin.from('lieferantenartikel').select('*')
    .eq('supplier_id', lieferant).eq('lieferanten_nr', nummer).single();
  return data as Record<string, unknown> & { id: string; material_id: string | null };
}

/** Preise eines Lieferantenartikels um `tage` in die Vergangenheit schieben (ohne Auslöser). */
async function zurueckdatieren(laId: string, tage: number) {
  await db.query('begin');
  await db.query('set local session_replication_role = replica');
  await db.query(`update public.material_prices set gueltig_ab = gueltig_ab - $2::integer,
                         gueltig_bis = gueltig_bis - $2::integer where lieferantenartikel_id = $1`, [laId, tage]);
  await db.query('commit');
}

beforeAll(async () => {
  db = new Client({ connectionString: DB });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'lagf');
  katalog = await konto(BETRIEB, 'Verwaltung', 'lavwk');
  await admin.from('users').update({ katalog_einspielen: true }).eq('id', katalog.uid);
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'lavw');
  leitung = await konto(BETRIEB, 'Projektleiter', 'lapl');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'lama');
  fremdChef = await konto(FREMD, 'Geschäftsführung', 'lafremd');
  clientEinreichen(chefin.client);
  alpha = await dn.lieferantAnlegen(BETRIEB, 'Alpha Großhandel');
  beta = await dn.lieferantAnlegen(BETRIEB, 'Beta Großhandel');
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.end();
});

describe('Zwei Großhändler, dieselbe Nummer (E01)', () => {
  it('der zweite überschreibt den Stammartikel nicht, sein Lieferantenartikel bleibt offen', async () => {
    const nummer = nr('ZW');
    await einspielen(alpha, [zeile({ artikelnummer: nummer, name: 'Rohr Alpha', einheit: 'Stk', preis: 10 })]);
    const { bericht } = await einspielen(beta, [zeile({ artikelnummer: nummer, name: 'Rohr Beta', einheit: 'm', preis: 12 })]);

    expect(bericht).toMatchObject({ angelegt: 0, geaendert: 0, offenZuzuordnen: 1, preise: 1 });
    expect(await stamm(nummer)).toMatchObject({ name: 'Rohr Alpha', unit: 'Stk', ek: 10 });
    expect(await lieferantenartikel(alpha, nummer)).toMatchObject({ zuordnung: 'automatisch', bezeichnung: 'Rohr Alpha' });
    const offen = await lieferantenartikel(beta, nummer);
    expect(offen).toMatchObject({ material_id: null, zuordnung: null, bezeichnung: 'Rohr Beta', einheit: 'm' });
    // Sein Preis ist da — ohne Stammartikel.
    const { data } = await admin.from('material_prices').select('material_id, einkaufspreis')
      .eq('lieferantenartikel_id', offen.id);
    expect(data).toEqual([{ material_id: null, einkaufspreis: 12 }]);
  });

  it('ein Lieferant: Name, Einheit, Warengruppe und Einkaufspreis wie bisher (Erhaltung)', async () => {
    const z = zeile({ name: 'Bogen alt', einheit: 'Stk', preis: 4 });
    await einspielen(alpha, [z]);
    await einspielen(alpha, [{ ...z, zeile: ++lfd, name: 'Bogen neu', einheit: 'm', warengruppe: '0815', preis: 4.4, verarbeitung: 'aenderung' }]);
    expect(await stamm(z.artikelnummer)).toMatchObject({ name: 'Bogen neu', unit: 'm', warengruppe: '0815', ek: 4.4, ausgelaufen: false });
  });

  it('ein Lieferant: ohne Preis in der Datei bleibt der bekannte Einkaufspreis (Erhaltung)', async () => {
    const z = zeile({ preis: 7 });
    await einspielen(alpha, [z]);
    await einspielen(alpha, [{ ...z, zeile: ++lfd, preis: undefined, preisArt: 'unbekannt', verarbeitung: 'aenderung' }]);
    expect((await stamm(z.artikelnummer))!.ek).toBe(7);
  });

  it('EAN und Preiseinheit stehen am Lieferantenartikel', async () => {
    const z = zeile({ ean: '4006381333931', preiseinheit: 100, preis: 0.235 });
    await einspielen(alpha, [z]);
    expect(await lieferantenartikel(alpha, z.artikelnummer)).toMatchObject({ ean: '4006381333931', preiseinheit: 100 });
  });
});

describe('Zuordnen und Vergleich (E02, E03)', () => {
  let nummer = '';
  let stammId = '';
  let betaLa = '';

  beforeAll(async () => {
    nummer = nr('VG');
    await einspielen(alpha, [zeile({ artikelnummer: nummer, name: 'Kugelhahn', preis: 10 })]);
    await einspielen(beta, [zeile({ artikelnummer: nummer, name: 'Kugelhahn B', preis: 9 })]);
    stammId = (await stamm(nummer))!.id;
    betaLa = (await lieferantenartikel(beta, nummer)).id;
  });

  it('vor dem Zuordnen gibt es keinen Vergleich: der offene Lieferantenartikel steht nicht am Artikel', async () => {
    const v = await la.artikelVergleich(stammId, chefin.client);
    expect(v.zeilen.map((z) => z.lieferant)).toEqual(['Alpha Großhandel']);
    expect(v.zeilen.some((z) => z.guenstigster)).toBe(false);
  });

  it('zuordnen bestätigt die Identität — wer und wann stehen dabei, die Preise ziehen mit', async () => {
    await la.zuordnen(betaLa, stammId, katalog.client);
    const z = await lieferantenartikel(beta, nummer);
    expect(z).toMatchObject({ material_id: stammId, zuordnung: 'bestaetigt', bestaetigt_von_uid: katalog.uid });
    expect(z.bestaetigt_am).not.toBeNull();
    const { data } = await admin.from('material_prices').select('material_id').eq('lieferantenartikel_id', betaLa);
    expect(data).toEqual([{ material_id: stammId }]);
  });

  it('danach steht der Vergleich mit „günstigster“, und der Einkaufspreis folgt ihm', async () => {
    const v = await la.artikelVergleich(stammId, chefin.client);
    expect(v.basisGrund).toBeNull();
    expect(v.zeilen.map((z) => [z.lieferant, z.verifiziertDurch, z.vergleichbar, z.guenstigster])).toEqual([
      ['Beta Großhandel', 'bestaetigt', true, true],
      ['Alpha Großhandel', 'automatisch', true, false],
    ]);
    expect((await stamm(nummer))!.ek).toBe(9);
  });

  it('der Vorschlag der Einkaufsliste nimmt den günstigsten — der Grund nur für wen Einkaufspreise sieht', async () => {
    const { data } = await verwaltung.client.rpc('lieferant_vorschlag', { p_material: stammId });
    expect(data).toBe(beta);
    const { data: grund } = await chefin.client.rpc('lieferant_vorschlag_grund', { p_material: stammId });
    expect(grund).toMatchObject({ supplier_id: beta, grund: 'guenstigster', einkaufspreis: 9 });
    const ohne = await verwaltung.client.rpc('lieferant_vorschlag_grund', { p_material: stammId });
    expect(ohne.error?.message).toMatch(/Einkaufspreise sehen/);
  });

  it('der Preisverlauf je Lieferant: Datum, Preis, Änderung', async () => {
    await zurueckdatieren(betaLa, 20);
    await einspielen(beta, [zeile({ artikelnummer: nummer, name: 'Kugelhahn B', preis: 9.9, verarbeitung: 'aenderung' })]);
    const verlauf = await la.preisverlauf(stammId, beta, 50, chefin.client);
    expect(verlauf.map((v) => [v.einkaufspreis, v.aenderungProzent])).toEqual([[9.9, 10], [9, null]]);
    // Der vorige endet am Tag vor dem neuen.
    expect(verlauf[1].gueltigBis).not.toBeNull();
    expect(verlauf[1].gueltigBis! < verlauf[0].gueltigAb).toBe(true);
  });

  it('veralteter Stand: kein „günstigster“, der Vorschlag ist wieder der jüngste', async () => {
    const alphaLa = (await lieferantenartikel(alpha, nummer)).id;
    await zurueckdatieren(alphaLa, 400);
    const v = await la.artikelVergleich(stammId, chefin.client);
    expect(v.zeilen.some((z) => z.guenstigster)).toBe(false);
    expect(v.basisGrund).toMatch(/älter als 180 Tage/);
    const { data } = await verwaltung.client.rpc('lieferant_vorschlag', { p_material: stammId });
    expect(data).toBe(beta);
    await zurueckdatieren(alphaLa, -400);
  });

  it('andere Einheit: „nicht vergleichbar“ mit Grund — keine erfundene Umrechnung', async () => {
    const n2 = nr('EH');
    await einspielen(alpha, [zeile({ artikelnummer: n2, einheit: 'Stk', preis: 5 })]);
    await einspielen(beta, [zeile({ artikelnummer: n2, einheit: 'm', preis: 1 })]);
    const s = (await stamm(n2))!;
    await la.zuordnen((await lieferantenartikel(beta, n2)).id, s.id, chefin.client);
    const v = await la.artikelVergleich(s.id, chefin.client);
    const b = v.zeilen.find((z) => z.lieferant === 'Beta Großhandel')!;
    expect(b).toMatchObject({ vergleichbar: false, grund: 'Einheit m statt Stk', guenstigster: false });
    // Der Einkaufspreis bleibt der des vergleichbaren — kein Meterpreis als Stückpreis.
    expect((await stamm(n2))!.ek).toBe(5);
  });

  it('fehlender Rabattsatz: kein Einkaufspreis, kein „günstigster“', async () => {
    const n3 = nr('RS');
    await einspielen(alpha, [zeile({ artikelnummer: n3, preis: 5 })]);
    await einspielen(beta, [zeile({ artikelnummer: n3, preis: 100, preisArt: 'liste', rabattgruppe: 'OHNE' })]);
    const s = (await stamm(n3))!;
    await la.zuordnen((await lieferantenartikel(beta, n3)).id, s.id, chefin.client);
    const v = await la.artikelVergleich(s.id, chefin.client);
    expect(v.zeilen.find((z) => z.lieferant === 'Beta Großhandel')).toMatchObject({ vergleichbar: false, grund: 'Rabattsatz fehlt — kein Einkaufspreis' });
    expect(v.zeilen.some((z) => z.guenstigster)).toBe(false);
  });

  it('Löschsatz eines Lieferanten: der Stammartikel bleibt aktiv, solange ein anderer liefert', async () => {
    await einspielen(alpha, [zeile({ artikelnummer: nummer, verarbeitung: 'loeschung' })]);
    expect(await lieferantenartikel(alpha, nummer)).toMatchObject({ ausgelaufen: true });
    expect(await stamm(nummer)).toMatchObject({ ausgelaufen: false });
    await einspielen(beta, [zeile({ artikelnummer: nummer, verarbeitung: 'loeschung' })]);
    expect(await stamm(nummer)).toMatchObject({ ausgelaufen: true });
    await einspielen(beta, [zeile({ artikelnummer: nummer, name: 'Kugelhahn B', preis: 9.9, verarbeitung: 'neu' })]);
    // Zurück im Katalog — aber der Name gehört weiter Alpha: einem Artikel mit zwei Lieferanten schreibt keiner hinein.
    expect(await stamm(nummer)).toMatchObject({ ausgelaufen: false, name: 'Kugelhahn' });
  });

  it('lösen: offen und „gelöst“, die Preise gehen mit, der nächste Katalog ordnet nicht wieder zu', async () => {
    await la.loesen(betaLa, chefin.client);
    expect(await lieferantenartikel(beta, nummer)).toMatchObject({ material_id: null, zuordnung: 'geloest', bestaetigt_von_uid: chefin.uid });
    const { data } = await admin.from('material_prices').select('material_id').eq('lieferantenartikel_id', betaLa);
    expect((data ?? []).every((p) => p.material_id === null)).toBe(true);
    const { bericht } = await einspielen(beta, [zeile({ artikelnummer: nummer, name: 'Kugelhahn B', preis: 9.95, verarbeitung: 'aenderung' })]);
    expect(bericht.offenZuzuordnen).toBe(1);
    expect((await lieferantenartikel(beta, nummer)).material_id).toBeNull();
  });

  it('offene Lieferantenartikel: Liste mit Vorschlag „gleiche Nummer“, als neuer Artikel ohne doppelte Nummer', async () => {
    const liste = await la.offeneLieferantenartikel(nummer, 0, 20, katalog.client);
    const zeileOffen = liste.zeilen.find((z) => z.id === betaLa)!;
    expect(zeileOffen).toMatchObject({ zuordnung: 'geloest', lieferant: 'Beta Großhandel' });
    expect(zeileOffen.vorschlaege).toContainEqual(expect.objectContaining({ materialId: stammId, grund: 'nummer' }));
    const neu = await la.alsNeuerArtikel(betaLa, katalog.client);
    const { data } = await admin.from('materials').select('name, article_number').eq('id', neu).single();
    expect(data).toEqual({ name: 'Kugelhahn B', article_number: null });
    const { data: preise } = await admin.from('material_prices').select('material_id').eq('lieferantenartikel_id', betaLa);
    expect((preise ?? []).every((p) => p.material_id === neu)).toBe(true);
  });

  it('zwei Lieferantenartikel desselben Lieferanten an einem Artikel: abgewiesen', async () => {
    const n4 = nr('DP');
    await einspielen(alpha, [zeile({ artikelnummer: n4 })]);
    const zweite = zeile({ artikelnummer: nr('DP') });
    await einspielen(alpha, [zweite]);
    const ziel = (await stamm(n4))!.id;
    await expect(la.zuordnen((await lieferantenartikel(alpha, zweite.artikelnummer)).id, ziel, chefin.client))
      .rejects.toThrow(/schon die Nummer/);
  });
});

describe('Die Katalogsuche findet über die Nummer des Großhändlers und die EAN', () => {
  let stammId = '';

  beforeAll(async () => {
    const eigene = nr('SU');
    await einspielen(alpha, [zeile({ artikelnummer: eigene, name: 'Siphon Alpha' })]);
    await einspielen(beta, [zeile({ artikelnummer: 'BETA-NR-55', name: 'Siphon Beta', ean: '4006381333931' })]);
    stammId = (await stamm(eigene))!.id;
    await la.zuordnen((await lieferantenartikel(beta, 'BETA-NR-55')).id, stammId, chefin.client);
  });

  it('über die Nummer eines zugeordneten Großhändlers — mit Nummer und Großhändler am Treffer', async () => {
    const treffer = await sucheKatalog(BETRIEB, 'NR-55', 20);
    expect(treffer.find((t) => t.id === stammId)?.gefundenUeber).toEqual({ nummer: 'BETA-NR-55', art: 'lieferant', lieferant: 'Beta Großhandel' });
    const seite = await katalogSeite(BETRIEB, 'BETA-NR-55', 20);
    expect(seite.zeilen.map((z) => z.id)).toContain(stammId);
  });

  it('über die EAN, genau', async () => {
    const treffer = await sucheKatalog(BETRIEB, '4006381333931', 20);
    expect(treffer.find((t) => t.id === stammId)?.gefundenUeber).toMatchObject({ art: 'ean' });
  });

  it('auch der Monteur findet ihn — ohne die Tabelle lesen zu dürfen; ein fremder Betrieb nicht', async () => {
    const { data } = await monteur.client.rpc('katalog_nummern_suche', { p_begriff: 'NR-55' });
    expect((data as Array<{ material_id: string }>).map((z) => z.material_id)).toContain(stammId);
    const fremd = await fremdChef.client.rpc('katalog_nummern_suche', { p_begriff: 'NR-55' });
    expect(fremd.data).toEqual([]);
  });

  it('unter drei Zeichen nichts; die eigene Nummer des Stammartikels findet die bisherige Suche', async () => {
    const { data } = await chefin.client.rpc('katalog_nummern_suche', { p_begriff: 'NR' });
    expect(data).toEqual([]);
    const { data: eigen } = await chefin.client.rpc('katalog_nummern_suche', { p_begriff: 'SU-' });
    expect((eigen as Array<{ material_id: string }>).map((z) => z.material_id)).not.toContain(stammId);
  });
});

describe('Vorschlag der Einkaufsliste folgt dem Schalter „Preisvergleich“', () => {
  it('ausgeschaltet: wieder der jüngste — der Server liest den Schalter über `app.modul_aktiv` (V3)', async () => {
    const n = nr('MS');
    await einspielen(alpha, [zeile({ artikelnummer: n, preis: 8 })]);
    await einspielen(beta, [zeile({ artikelnummer: n, preis: 9 })]);
    const s = (await stamm(n))!.id;
    await la.zuordnen((await lieferantenartikel(beta, n)).id, s, chefin.client);
    // Alphas Preis einen Tag älter: der jüngste ist Beta, der günstigste Alpha.
    await zurueckdatieren((await lieferantenartikel(alpha, n)).id, 1);
    const vorher = await verwaltung.client.rpc('lieferant_vorschlag', { p_material: s });
    expect(vorher.data).toBe(alpha);
    await admin.from('companies').update({ modules: { 'material.lieferantenvergleich': false } }).eq('id', BETRIEB);
    try {
      const { data } = await verwaltung.client.rpc('lieferant_vorschlag', { p_material: s });
      expect(data).toBe(beta);
    } finally {
      await admin.from('companies').update({ modules: null }).eq('id', BETRIEB);
    }
  });
});

describe('Kataloge mehrerer Großhändler ausgeschaltet (V3)', () => {
  it('zuordnen, als neu anlegen und lösen weist der Server ab — die Übernahme ordnet weiter zu', async () => {
    const n = nr('MV');
    await einspielen(alpha, [zeile({ artikelnummer: n, preis: 8 })]);
    await einspielen(beta, [zeile({ artikelnummer: n, preis: 9 })]);
    const s = (await stamm(n))!.id;
    const offen = (await lieferantenartikel(beta, n)).id;
    const zugeordnet = (await lieferantenartikel(alpha, n)).id;
    await admin.from('companies').update({ modules: { 'material.katalogversionen': false } }).eq('id', BETRIEB);
    try {
      const aus = /ausgeschaltet/;
      await expect(la.zuordnen(offen, s, chefin.client)).rejects.toThrow(aus);
      await expect(la.alsNeuerArtikel(offen, chefin.client)).rejects.toThrow(aus);
      await expect(la.loesen(zugeordnet, chefin.client)).rejects.toThrow(aus);
      expect(await lieferantenartikel(beta, n)).toMatchObject({ material_id: null });
      expect((await lieferantenartikel(alpha, n)).material_id).toBe(s);
      // Datenrichtigkeit hängt nicht am Schalter: eine neue Nummer wird weiter ihrem Lieferantenartikel zugeordnet.
      const m = nr('MV');
      await einspielen(alpha, [zeile({ artikelnummer: m, preis: 5 })]);
      expect((await lieferantenartikel(alpha, m)).material_id).toBe((await stamm(m))!.id);
    } finally {
      await admin.from('companies').update({ modules: null }).eq('id', BETRIEB);
    }
    await la.zuordnen(offen, s, chefin.client);
    expect((await lieferantenartikel(beta, n)).material_id).toBe(s);
  });
});

describe('Preissprünge im Bericht (E04)', () => {
  it('über der Schwelle des Betriebs: gezählt, seitenweise mit alt, neu und Prozent', async () => {
    // Feste Nummern: gleich große Sprünge stehen nach der Nummer, und die soll nicht von `lfd` abhängen.
    const zeilen = ['PS-1', 'PS-2', 'PS-3'].map((n) => zeile({ artikelnummer: n, preis: 10 }));
    await einspielen(alpha, zeilen);
    for (const z of zeilen) await zurueckdatieren((await lieferantenartikel(alpha, z.artikelnummer)).id, 30);
    const { lauf, bericht } = await einspielen(alpha, [
      { ...zeilen[0], zeile: ++lfd, preis: 12, verarbeitung: 'aenderung' },
      { ...zeilen[1], zeile: ++lfd, preis: 10.5, verarbeitung: 'aenderung' },
      { ...zeilen[2], zeile: ++lfd, preis: 8, verarbeitung: 'aenderung' },
    ]);
    expect(bericht).toMatchObject({ preisspruenge: 2, schwelle: 10 });
    const seite1 = await dn.preisspruenge(lauf, 0, 1, chefin.client);
    expect(seite1).toMatchObject({ gesamt: 2, schwelle: 10 });
    expect(seite1.zeilen).toEqual([expect.objectContaining({ alt: 10, neu: 12, prozent: 20, art: 'einkauf' })]);
    const seite2 = await dn.preisspruenge(lauf, 1, 1, chefin.client);
    expect(seite2.zeilen).toEqual([expect.objectContaining({ alt: 10, neu: 8, prozent: -20 })]);
  });

  it('die Schwelle stellt die Spitze ein; die Verwaltung nicht', async () => {
    const { error } = await verwaltung.client.from('companies').update({ preissprung_schwelle_prozent: 50 }).eq('id', BETRIEB);
    const { data } = await admin.from('companies').select('preissprung_schwelle_prozent').eq('id', BETRIEB).single();
    expect(error !== null || (data as { preissprung_schwelle_prozent: number }).preissprung_schwelle_prozent === 10).toBe(true);
    await chefin.client.from('companies').update({ preissprung_schwelle_prozent: 25, katalog_veraltet_tage: 90 }).eq('id', BETRIEB);
    const { data: neu } = await admin.from('companies').select('preissprung_schwelle_prozent, katalog_veraltet_tage').eq('id', BETRIEB).single();
    expect(neu).toEqual({ preissprung_schwelle_prozent: 25, katalog_veraltet_tage: 90 });
    const falsch = await chefin.client.from('companies').update({ katalog_veraltet_tage: 0 }).eq('id', BETRIEB);
    expect(falsch.error?.message).toMatch(/companies_katalog_veraltet_tage/);
    await chefin.client.from('companies').update({ preissprung_schwelle_prozent: 10, katalog_veraltet_tage: 180 }).eq('id', BETRIEB);
  });
});

describe('Rechte und Mandanten', () => {
  let s = '';
  beforeAll(async () => {
    const n = nr('RE');
    await einspielen(alpha, [zeile({ artikelnummer: n })]);
    s = (await stamm(n))!.id;
  });

  it('die Projektleitung sieht keine Preise und keinen Vergleich — die Nummern der Großhändler schon', async () => {
    const { data: preise } = await leitung.client.from('material_prices').select('id');
    expect(preise ?? []).toEqual([]);
    await expect(la.artikelVergleich(s, leitung.client)).rejects.toThrow(/Einkaufspreise sehen/);
    await expect(la.preisverlauf(s, alpha, 50, leitung.client)).rejects.toThrow(/Einkaufspreise sehen/);
    const { data: nummern } = await leitung.client.from('lieferantenartikel').select('lieferanten_nr').eq('material_id', s);
    expect((nummern ?? []).length).toBe(1);
  });

  it('der Monteur sieht keine Lieferantenartikel', async () => {
    const { data } = await monteur.client.from('lieferantenartikel').select('id');
    expect(data ?? []).toEqual([]);
  });

  it('die Verwaltung ohne Freigabe ordnet nicht zu und ändert nichts', async () => {
    const id = (await admin.from('lieferantenartikel').select('id').eq('material_id', s).single()).data!.id as string;
    await expect(la.loesen(id, verwaltung.client)).rejects.toThrow(/Kataloge einspielt/);
    const { data } = await verwaltung.client.from('lieferantenartikel').update({ bezeichnung: 'x' }).eq('id', id).select('id');
    expect(data ?? []).toEqual([]);
    // Löschen gibt es über die Schnittstelle für niemanden.
    const weg = await chefin.client.from('lieferantenartikel').delete().eq('id', id);
    expect(weg.error).not.toBeNull();
  });

  it('wer und wann setzt die Datenbank, nicht wer schreibt', async () => {
    const id = (await admin.from('lieferantenartikel').select('id').eq('material_id', s).single()).data!.id as string;
    await chefin.client.from('lieferantenartikel')
      .update({ zuordnung: 'bestaetigt', bestaetigt_von_name: 'Erfunden', bestaetigt_von_uid: monteur.uid }).eq('id', id);
    const { data } = await admin.from('lieferantenartikel').select('bestaetigt_von_uid, bestaetigt_von_name').eq('id', id).single();
    expect(data).toMatchObject({ bestaetigt_von_uid: chefin.uid });
    expect((data as { bestaetigt_von_name: string }).bestaetigt_von_name).not.toBe('Erfunden');
  });

  it('ein fremder Betrieb sieht nichts und ordnet nichts zu', async () => {
    const { data } = await fremdChef.client.from('lieferantenartikel').select('id');
    expect(data ?? []).toEqual([]);
    await expect(la.artikelVergleich(s, fremdChef.client)).rejects.toThrow(/gibt es im Betrieb nicht/);
    const id = (await admin.from('lieferantenartikel').select('id').eq('material_id', s).single()).data!.id as string;
    await expect(la.zuordnen(id, s, fremdChef.client)).rejects.toThrow(/gibt es nicht/);
  });

  it('der Support mit Einblick liest den Vergleich, ordnet ohne „mitarbeiten“ aber nicht zu', async () => {
    const plattform = await plattformkonto('lasupport');
    const { data: f } = await chefin.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chefin.uid, grund: 'Preisvergleich prüfen',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    await einblickBeginnen(plattform, BETRIEB, (f as { id: string }).id);
    const v = await la.artikelVergleich(s, plattform.client);
    expect(v.zeilen.length).toBe(1);
    const id = (await admin.from('lieferantenartikel').select('id').eq('material_id', s).single()).data!.id as string;
    await expect(la.loesen(id, plattform.client)).rejects.toThrow();
    await admin.from('support_zugriffe').delete().eq('company_id', BETRIEB);
    await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
  });

  it('die Datenauskunft nennt bei der Person, wie viele Zuordnungen sie entschieden hat', async () => {
    const { data, error } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: katalog.uid });
    expect(error).toBeNull();
    expect((data as { als_bearbeiter: Record<string, number> }).als_bearbeiter.lieferantenartikel_zugeordnet).toBeGreaterThan(0);
  });
});

describe('Rücklauf und Sicherung', () => {
  it('die Sicherung führt die Tabelle; der Dienstschlüssel bringt die Zeilen, wie sie waren', async () => {
    const { data: tabellen } = await admin.rpc('auszug_tabellen');
    expect(tabellen as string[]).toContain('lieferantenartikel');
    const n = nr('RL');
    const { data: m } = await admin.from('materials').insert({ company_id: BETRIEB, name: 'Rücklauf', article_number: n, stock: 0 })
      .select('id').single();
    const id = crypto.randomUUID();
    const { error } = await admin.from('lieferantenartikel').insert({
      id, company_id: BETRIEB, supplier_id: beta, lieferanten_nr: n, bezeichnung: 'Aus der Sicherung',
      material_id: (m as { id: string }).id, zuordnung: 'bestaetigt', bestaetigt_von_name: 'Vera Damals',
      bestaetigt_am: '2026-10-01T08:00:00Z',
    });
    expect(error).toBeNull();
    const { error: preisFehler } = await admin.from('material_prices').insert({
      company_id: BETRIEB, material_id: (m as { id: string }).id, supplier_id: beta, lieferantenartikel_id: id,
      einkaufspreis: 3, gueltig_ab: '2026-10-01',
    });
    expect(preisFehler).toBeNull();
    const { data } = await admin.from('lieferantenartikel').select('zuordnung, bestaetigt_von_name, bestaetigt_am').eq('id', id).single();
    expect(data).toEqual({ zuordnung: 'bestaetigt', bestaetigt_von_name: 'Vera Damals', bestaetigt_am: '2026-10-01T08:00:00+00:00' });
  });
});

describe('Bestand: aus den Preisen werden Lieferantenartikel (die Migration noch einmal, zurückgerollt)', () => {
  it('ein Lieferant: verifiziert; zwei: zu prüfen; doppelte Nummer und ohne Nummer: keiner; EK unverändert', async () => {
    const B = 'la-bestand';
    await betriebAnlegen(B);
    await db.query('begin');
    try {
      await db.query('set local session_replication_role = replica');
      const { rows: [s1] } = await db.query(`insert into public.suppliers (company_id, name) values ($1, 'Eins') returning id`, [B]);
      const { rows: [s2] } = await db.query(`insert into public.suppliers (company_id, name) values ($1, 'Zwei') returning id`, [B]);
      const artikel = async (name: string, nummer: string | null) => (await db.query(
        `insert into public.materials (company_id, name, article_number, unit, stock) values ($1, $2, $3, 'Stk', 0) returning id`,
        [B, name, nummer])).rows[0].id as string;
      const einer = await artikel('Einer', 'B-1');
      const zwei = await artikel('Zwei', 'B-2');
      const ohne = await artikel('Ohne Nummer', null);
      const zwillingA = await artikel('Zwilling A', 'B-Z');
      const zwillingB = await artikel('Zwilling B', 'B-Z');
      await artikel('Von Hand', 'B-H');
      const preis = (m: string, s: string, tag: string, ek: number) => db.query(
        `insert into public.material_prices (company_id, material_id, supplier_id, einkaufspreis, gueltig_ab) values ($1, $2, $3, $4, $5)`,
        [B, m, s, ek, tag]);
      await preis(einer, s1.id, '2026-01-01', 1);
      await preis(einer, s1.id, '2026-05-01', 1.1);
      await preis(zwei, s1.id, '2026-02-01', 2);
      await preis(zwei, s2.id, '2026-03-01', 2.2);
      await preis(ohne, s1.id, '2026-02-01', 3);
      await preis(zwillingA, s1.id, '2026-02-01', 4);
      await preis(zwillingB, s1.id, '2026-02-01', 5);
      await db.query(`insert into public.material_einkaufspreise (company_id, material_id, einkaufspreis) values ($1, $2, 9.99)`, [B, zwei]);
      const vorher = (await db.query(`select id, updated_at from public.material_prices where company_id = $1 order by id`, [B])).rows;
      await db.query('set local session_replication_role = origin');

      await db.query(MIGRATION);

      const { rows: laZeilen } = await db.query(
        `select m.name, a.lieferanten_nr, a.zuordnung, a.zu_pruefen from public.lieferantenartikel a
           join public.materials m on m.id = a.material_id where a.company_id = $1 order by m.name, a.supplier_id`, [B]);
      expect(laZeilen.map((r) => [r.name, r.lieferanten_nr, r.zuordnung, r.zu_pruefen])).toEqual([
        ['Einer', 'B-1', 'bestand', false],
        ['Zwei', 'B-2', 'bestand', true],
        ['Zwei', 'B-2', 'bestand', true],
      ]);
      const { rows: [ohneLa] } = await db.query(
        `select count(*)::int as n from public.material_prices where company_id = $1 and lieferantenartikel_id is null`, [B]);
      expect(ohneLa.n).toBe(3);
      const { rows: bis } = await db.query(
        `select gueltig_ab::text, gueltig_bis::text from public.material_prices where material_id = $1 order by gueltig_ab`, [einer]);
      expect(bis).toEqual([{ gueltig_ab: '2026-01-01', gueltig_bis: '2026-04-30' }, { gueltig_ab: '2026-05-01', gueltig_bis: null }]);
      const { rows: [ek] } = await db.query(`select einkaufspreis::float as ek from public.material_einkaufspreise where material_id = $1`, [zwei]);
      expect(ek.ek).toBe(9.99);
      const nachher = (await db.query(`select id, updated_at from public.material_prices where company_id = $1 order by id`, [B])).rows;
      expect(nachher).toEqual(vorher);
    } finally {
      await db.query('rollback');
    }
  });
});

describe('Blockweise Übernahme unter der Zeitgrenze (8 s je Aufruf)', () => {
  /*
    2.000 Zeilen in Blöcken zu 100, wie die App: erst neu (legt an), dann
    dieselben Nummern mit neuen Preisen (Preissprünge, Ende der Vorgänger),
    dann ein zweiter Großhändler mit denselben Nummern (alle offen). Gemessen
    wird jeder Block; keiner darf an die Zeitgrenze kommen.
  */
  async function gemessen(lieferant: string, zeilen: dn.DatanormZeile[]) {
    const lauf = await dn.laufAnlegen(BETRIEB, lieferant, 'gross.001', 'cp850', { artikel: zeilen.length });
    await dn.zeilenSchicken(BETRIEB, lauf, zeilen);
    const dauern: number[] = [];
    let bericht: Record<string, unknown> = {};
    for (;;) {
      const t = Date.now();
      const { data, error } = await chefin.client.rpc('datanorm_uebernehmen', { p_lauf: lauf, p_menge: dn.UEBERNAHME_BLOCK });
      dauern.push(Date.now() - t);
      expect(error).toBeNull();
      bericht = data as Record<string, unknown>;
      if (bericht.fertig) break;
    }
    return { dauern, bericht };
  }

  it('2.000 Zeilen: neu, geändert, zweiter Großhändler — jeder Block unter der Grenze', async () => {
    const zeilen = Array.from({ length: 2000 }, (_, i) => zeile({ artikelnummer: `GR-${i}`, preis: 10 + (i % 7) }));
    const neu = await gemessen(alpha, zeilen);
    expect(neu.bericht).toMatchObject({ angelegt: 2000, preise: 2000 });
    await db.query('begin');
    await db.query('set local session_replication_role = replica');
    await db.query(`update public.material_prices set gueltig_ab = gueltig_ab - 30
                     where lieferantenartikel_id in (select id from public.lieferantenartikel where company_id = $1 and lieferanten_nr like 'GR-%')`, [BETRIEB]);
    await db.query('commit');
    const geaendert = await gemessen(alpha, zeilen.map((z) => ({ ...z, preis: z.preis! * 1.2, verarbeitung: 'aenderung' as const })));
    expect(geaendert.bericht).toMatchObject({ geaendert: 2000, preisspruenge: 2000 });
    const zweiter = await gemessen(beta, zeilen);
    expect(zweiter.bericht).toMatchObject({ offenZuzuordnen: 2000 });
    const alle = [...neu.dauern, ...geaendert.dauern, ...zweiter.dauern];
    // Die Messwerte stehen im Lauf — sie gehören in den Bericht des Pakets.
    console.info('Blockdauern (ms) neu/geändert/zweiter:', Math.max(...neu.dauern), Math.max(...geaendert.dauern), Math.max(...zweiter.dauern));
    expect(Math.max(...alle)).toBeLessThan(8000);
  }, 600_000);
});
