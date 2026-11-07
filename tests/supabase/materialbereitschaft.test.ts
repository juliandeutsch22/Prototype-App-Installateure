/**
 * MATERIALBEREITSCHAFT UND BESTELLVORSCHLÄGE (SHK-Ausbau M04b; E13, E14,
 * G03; `20261108100000_materialbereitschaft.sql`) — echte Datenbank.
 *
 * Geprüft wird:
 *  - K02: zwei Baustellen konkurrieren um dieselbe Menge — das Freie vor
 *    der früheren ist der Bestand, vor der späteren der Rest; die eigene
 *    Liste zählt nicht gegen sich; eine neue Liste kommt an ihrem Tag zuletzt;
 *    ein vergangener Tag hat keinen Vorrang (= `lager_frei.frei`).
 *  - Der Stand der Anforderungen je Position: offen, auf der Liste,
 *    bestellt (ohne und mit Termin), bereit, abgeholt; Storno (gelöscht);
 *    Teilabholung; Retoure; eingeladen; Zulauf für das Lager.
 *  - Bestellvorschläge: Mindestmenge, Sollbestand, Verpackungseinheit,
 *    Großhändler, Fehlmenge aus Rüstlisten (G03), nichts doppelt (Liste,
 *    Bestellung, Anforderung); Übernahme mehrerer, gebündelt je
 *    Großhändler, Wiederholung, veraltet, übersprungen, gleichzeitig.
 *  - Sollbestand und Verpackungseinheit: Prüfbedingungen, wer sie pflegt.
 *  - Rechte, fremder Betrieb, Support, Zeitraum; Modul aus (V3).
 *
 * GEGENPROBE: vor der Migration ist jeder Fall rot — es gibt weder die
 * Funktionen noch die Spalten.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';

const BETRIEB = 'mbereit-a';
const FREMD = 'mbereit-b';
const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const tag = (n: number) => new Date(Date.parse(`${heute}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

let chef: Konto;
let verw: Konto;
let pl: Konto;
let max: Konto;
let buch: Konto;
let fremd: Konto;
let plattform: Konto;
let lieferant = '';

/* ------------------------------------------------------------------ Helfer */

async function artikel(stock: number, x: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: `Bereit ${crypto.randomUUID().slice(0, 6)}`, unit: 'Stk', stock, lagerartikel: true, ...x })
    .select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function liste(datum: string, baustelle: string, positionen: Record<string, unknown>[]): Promise<string> {
  const { data, error } = await chef.client.rpc('ruestliste_speichern', {
    p_datum: datum, p_baustelle: baustelle, p_positionen: positionen.map((p, i) => ({ position: i, einheit: 'Stk', name: 'Pos', ...p })),
    p_uids: [max.uid], p_von: 'Chef',
  });
  if (error) throw new Error(error.message);
  return String(data);
}

const anfordern = (menge: number) => ({ menge, user_id: max.uid, user_name: 'Max', note: 'Für den Einsatz' });

type Deckung = {
  heute: string;
  listen: { id: string; datum: string; baustelle: string; frei_vor: Record<string, number>;
    positionen: { id: string; material: string | null; menge: number; gebucht: boolean; anf: Record<string, unknown> | null }[] }[];
  lagerartikel: Record<string, boolean>;
  zulauf: Record<string, { menge: number; bestellt: boolean; termin: string | null }[]>;
  fuer: { liste: string | null; frei_vor: Record<string, number> } | null;
};

async function deckung(von: string, bis = von, x: { baustelle?: string; dazu?: string[] } = {}, k: Konto = chef): Promise<Deckung> {
  const { data, error } = await k.client.rpc('materialdeckung', {
    p_von: von, p_bis: bis, ...(x.baustelle ? { p_baustelle: x.baustelle, p_dazu: x.dazu ?? [] } : {}),
  });
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return data as Deckung;
}

const listeVon = (d: Deckung, baustelle: string) => d.listen.find((l) => l.baustelle === baustelle)!;

async function freiLaut(material: string): Promise<number> {
  const { data, error } = await chef.client.rpc('lager_frei', { p_ids: [material] });
  if (error) throw new Error(error.message);
  return Number((data as { frei: number }[])[0].frei);
}

async function anforderungZu(kopf: string): Promise<string> {
  const { data } = await admin.from('material_orders').select('id').eq('ruestliste_id', kopf).single();
  return (data as { id: string }).id;
}

async function vorschlaege(k: Konto = verw): Promise<Record<string, unknown>[]> {
  const { data, error } = await k.client.rpc('bestellvorschlaege');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return data as Record<string, unknown>[];
}
const vorschlagFuer = async (material: string, k: Konto = verw) => (await vorschlaege(k)).find((v) => v.material === material);

const uebernehmen = (posten: Record<string, unknown>[], k: Konto = verw, vorgang = crypto.randomUUID()) =>
  k.client.rpc('bestellvorschlaege_uebernehmen', { p_befehl: { vorgang, aktion: 'bestellvorschlaege', posten } });

async function posten(material: string): Promise<{ menge: number; supplier_id: string | null; angelegt_von_uid: string }[]> {
  const { data } = await admin.from('einkauf_posten').select('menge, supplier_id, angelegt_von_uid').eq('material_id', material);
  return ((data ?? []) as { menge: number; supplier_id: string | null; angelegt_von_uid: string }[])
    .map((p) => ({ ...p, menge: Number(p.menge) }));
}

/* ------------------------------------------------------------------ Aufbau */

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Bereit GmbH');
  await betriebAnlegen(FREMD, 'Fremd GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'mbchef');
  verw = await konto(BETRIEB, 'Verwaltung', 'mbverw');
  pl = await konto(BETRIEB, 'Projektleiter', 'mbpl');
  max = await konto(BETRIEB, 'Mitarbeiter', 'mbmax');
  buch = await konto(BETRIEB, 'Buchhaltung', 'mbbuch');
  fremd = await konto(FREMD, 'Verwaltung', 'mbfremd');
  plattform = await plattformkonto('mbplatt');
  const { data } = await admin.from('suppliers').insert({ company_id: BETRIEB, name: 'Frauenthal' }).select('id').single();
  lieferant = (data as { id: string }).id;
}, 180_000);

afterAll(async () => {
  await admin.from('companies').update({ modules: null }).eq('id', BETRIEB);
});

/* ------------------------------------------------------- K02: Vorrang */

describe('Eine Menge deckt nicht zwei Bedarfe (K02)', () => {
  let rohr = '';
  beforeAll(async () => {
    rohr = await artikel(10);
    await liste(tag(2), 'MB-FRUEH', [{ id: 'a1', material_id: rohr, menge: 8 }]);
    await liste(tag(4), 'MB-SPAET', [{ id: 'b1', material_id: rohr, menge: 8 }]);
  });

  it('zwei Baustellen konkurrieren um dieselbe Menge: vor der früheren ist alles frei, vor der späteren der Rest', async () => {
    const d = await deckung(tag(2), tag(4));
    expect(listeVon(d, 'MB-FRUEH').frei_vor[rohr]).toBe(10);
    expect(listeVon(d, 'MB-SPAET').frei_vor[rohr]).toBe(2);
    // Summiert dieselbe Fehlmenge wie `lager_frei`: 10 − 8 − 8.
    expect(await freiLaut(rohr)).toBe(-6);
  });

  it('die eigene Liste zählt nicht gegen sich — im Formular wie in der Woche', async () => {
    const d = await deckung(tag(4), tag(4), { baustelle: 'MB-SPAET', dazu: [rohr] });
    expect(d.fuer).toEqual({ liste: listeVon(d, 'MB-SPAET').id, frei_vor: { [rohr]: 2 } });
  });

  it('eine neue Liste kommt an ihrem Tag zuletzt, vor späteren Tagen', async () => {
    expect((await deckung(tag(3), tag(3), { baustelle: 'MB-NEU', dazu: [rohr] })).fuer).toEqual({ liste: null, frei_vor: { [rohr]: 2 } });
    expect((await deckung(tag(2), tag(2), { baustelle: 'MB-NEU', dazu: [rohr] })).fuer!.frei_vor[rohr]).toBe(2);
    expect((await deckung(tag(5), tag(5), { baustelle: 'MB-NEU', dazu: [rohr] })).fuer!.frei_vor[rohr]).toBe(-6);
  });

  it('am selben Tag hat die früher angelegte Liste Vorrang', async () => {
    const fitting = await artikel(5);
    await liste(tag(6), 'MB-ERSTE', [{ id: 'e1', material_id: fitting, menge: 4 }]);
    await liste(tag(6), 'MB-ZWEITE', [{ id: 'z1', material_id: fitting, menge: 4 }]);
    const d = await deckung(tag(6));
    expect([listeVon(d, 'MB-ERSTE').frei_vor[fitting], listeVon(d, 'MB-ZWEITE').frei_vor[fitting]]).toEqual([5, 1]);
  });

  it('ein vergangener Tag hat keinen Vorrang — sein Freies ist das von `lager_frei`', async () => {
    await admin.from('einsatz_material').insert({ company_id: BETRIEB, date: tag(-3), project_number: 'MB-GESTERN' });
    const { data: k } = await admin.from('einsatz_material').select('id').eq('project_number', 'MB-GESTERN').single();
    await admin.from('einsatz_material_positionen').insert({
      id: 'g1', company_id: BETRIEB, einsatz_material_id: (k as { id: string }).id, position: 0, material_id: rohr, name: 'Rohr', menge: 3,
    });
    const d = await deckung(tag(-3));
    expect(listeVon(d, 'MB-GESTERN').frei_vor[rohr]).toBe(await freiLaut(rohr));
  });
});

/* ---------------------------------------- Stand der Anforderungen */

describe('Bestellt, zugesagt und vorhanden bleiben getrennt', () => {
  let ventil = '';
  let kopf = '';
  const stand = async () => listeVon(await deckung(tag(1)), 'MB-ANF').positionen[0].anf;

  beforeAll(async () => {
    ventil = await artikel(1);
    kopf = await liste(tag(1), 'MB-ANF', [{ id: 'v1', material_id: ventil, menge: 3, anfordern: anfordern(2) }]);
  });

  it('angelegt: offen — die Position reserviert nur den Rest (1), frei vor ihr ist 1', async () => {
    expect(await stand()).toMatchObject({ angefordert: 2, offen: 2, bestellt: 0, bereit: 0, abgeholt: 0, termin_offen: false });
    expect(listeVon(await deckung(tag(1)), 'MB-ANF').frei_vor[ventil]).toBe(1);
  });

  it('auf der Einkaufsliste, bestellt ohne Termin (unbekannt), mit Termin, geliefert', async () => {
    const id = await anforderungZu(kopf);
    await verw.client.from('material_orders').update({ beschaffung: 'einkauf', supplier_id: lieferant, status: 'In Bearbeitung' }).eq('id', id);
    expect(await stand()).toMatchObject({ auf_liste: 2, offen: 0 });
    await verw.client.from('material_orders').update({ bestellt_am: new Date().toISOString() }).eq('id', id);
    expect(await stand()).toMatchObject({ bestellt: 2, termin: null, termin_offen: true });
    await verw.client.from('material_orders').update({ liefertermin: tag(3) }).eq('id', id);
    expect(await stand()).toMatchObject({ bestellt: 2, termin: tag(3), termin_offen: false });
    expect((await verw.client.rpc('einkauf_geliefert', { p_ids: [id] })).error).toBeNull();
    expect(await stand()).toMatchObject({ bereit: 2, bestellt: 0 });
  });

  it('Teilabholung: abgeholt ist abgeholt, die Position deckt den Rest weiter aus dem Regal', async () => {
    const id = await anforderungZu(kopf);
    expect((await verw.client.rpc('anforderung_abschliessen', { p_order: id })).error).toBeNull();
    const d = await deckung(tag(1));
    expect(listeVon(d, 'MB-ANF').positionen[0].anf).toMatchObject({ abgeholt: 2, bereit: 0 });
    expect(listeVon(d, 'MB-ANF').frei_vor[ventil]).toBe(1);
  });

  it('Storno: ohne die Anforderung trägt die Position keinen Stand mehr und reserviert wieder ganz', async () => {
    const zweit = await artikel(0);
    const k = await liste(tag(1), 'MB-STORNO', [{ id: 's1', material_id: zweit, menge: 2, anfordern: anfordern(2) }]);
    expect(await freiLaut(zweit)).toBe(0);
    await admin.from('material_orders').delete().eq('id', await anforderungZu(k));
    expect(listeVon(await deckung(tag(1)), 'MB-STORNO').positionen[0].anf).toBeNull();
    expect(await freiLaut(zweit)).toBe(-2);
  });

  it('Retoure ins Lager: das Freie vor der Liste steigt', async () => {
    const hahn = await artikel(0);
    await liste(tag(1), 'MB-RETOURE', [{ id: 'r1', material_id: hahn, menge: 2 }]);
    expect(listeVon(await deckung(tag(1)), 'MB-RETOURE').frei_vor[hahn]).toBe(0);
    const { error } = await verw.client.rpc('retoure_anlegen', { p_beleg: {
      id: crypto.randomUUID(), company_id: BETRIEB, material_id: hahn, material_name: 'Hahn', quantity: 2,
      condition: 'neu', user_id: max.uid, user_name: 'Max', project_number: 'MB-RETOURE',
    } });
    expect(error).toBeNull();
    expect(listeVon(await deckung(tag(1)), 'MB-RETOURE').frei_vor[hahn]).toBe(2);
  });

  it('eingeladen: gebucht, und die Liste reserviert nichts mehr', async () => {
    const band = await artikel(5);
    await liste(heute, 'MB-GELADEN', [{ id: 'l1', material_id: band, menge: 3 }]);
    expect(await freiLaut(band)).toBe(2);
    const r = await max.client.rpc('laden_umschalten', { p_datum: heute, p_baustelle: 'MB-GELADEN', p_position: 'l1', p_an: true, p_von: 'Max' });
    expect(r.error).toBeNull();
    expect(listeVon(await deckung(heute), 'MB-GELADEN').positionen[0].gebucht).toBe(true);
    expect(await freiLaut(band)).toBe(2);
  });

  it('der Zulauf für das Lager: offene eigene Posten, bestellte mit frühem Termin zuerst', async () => {
    const muffe = await artikel(0);
    await liste(tag(2), 'MB-ZULAUF', [{ id: 'm1', material_id: muffe, menge: 5 }]);
    await admin.from('einkauf_posten').insert([
      { company_id: BETRIEB, material_id: muffe, material_name: 'Muffe', menge: 2 },
      { company_id: BETRIEB, material_id: muffe, material_name: 'Muffe', menge: 3, bestellt_am: new Date().toISOString(), liefertermin: tag(1) },
      { company_id: BETRIEB, material_id: muffe, material_name: 'Muffe', menge: 9, geliefert_am: new Date().toISOString() },
    ]);
    const d = await deckung(tag(2));
    expect(d.zulauf[muffe]).toEqual([
      { menge: 3, bestellt: true, termin: tag(1) },
      { menge: 2, bestellt: false, termin: null },
    ]);
    expect(d.lagerartikel[muffe]).toBe(true);
  });
});

/* ------------------------------------------------- Bestellvorschläge */

describe('Bestellvorschläge (E14, G03)', () => {
  it('unter der Mindestmenge: bis zum Sollbestand, aufgerundet auf die Verpackungseinheit, mit Großhändler', async () => {
    const a = await artikel(3, { mindestmenge: 5, sollbestand: 20, verpackungseinheit: 6 });
    await admin.from('material_prices').insert({
      company_id: BETRIEB, material_id: a, supplier_id: lieferant, listenpreis: 10, rabatt_prozent: 0, einkaufspreis: 10, gueltig_ab: tag(-1),
    });
    // Bis 20 fehlen 17 — in Sechsern 18.
    expect(await vorschlagFuer(a)).toMatchObject({
      grund: 'mindestmenge', frei: 3, zulauf: 0, menge: 18, lieferant, lieferant_name: 'Frauenthal',
    });
    expect(Object.keys((await vorschlagFuer(a))!)).not.toContain('einkaufspreis');
  });

  it('ohne Sollbestand bis zur Mindestmenge; an der Mindestmenge kein Vorschlag', async () => {
    expect(await vorschlagFuer(await artikel(2, { mindestmenge: 5 }))).toMatchObject({ grund: 'mindestmenge', menge: 3 });
    expect(await vorschlagFuer(await artikel(5, { mindestmenge: 5 }))).toBeUndefined();
  });

  it('G03: eine Fehlmenge aus Rüstlisten schlägt vor, auch ohne Mindestmenge', async () => {
    const a = await artikel(1);
    await liste(tag(2), 'MB-G03', [{ id: 'g1', material_id: a, menge: 4 }]);
    expect(await vorschlagFuer(a)).toMatchObject({ grund: 'fehlmenge', frei: -3, menge: 3 });
  });

  it('nichts doppelt: was angefordert, auf der Liste oder bestellt ist, wird nicht noch einmal vorgeschlagen', async () => {
    // Angefordert: die Position reserviert nur ihren Rest — der Teil der Anforderung fehlt nicht.
    const a = await artikel(0);
    await liste(tag(2), 'MB-ANGEFORDERT', [{ id: 'x1', material_id: a, menge: 3, anfordern: anfordern(3) }]);
    expect(await vorschlagFuer(a)).toBeUndefined();
    // Auf der Liste oder bestellt: Zulauf.
    const b = await artikel(1, { mindestmenge: 4 });
    expect(await vorschlagFuer(b)).toMatchObject({ menge: 3 });
    await admin.from('einkauf_posten').insert({ company_id: BETRIEB, material_id: b, material_name: 'B', menge: 2 });
    expect(await vorschlagFuer(b)).toMatchObject({ zulauf: 2, menge: 1 });
    await admin.from('einkauf_posten').insert({ company_id: BETRIEB, material_id: b, material_name: 'B', menge: 1, bestellt_am: new Date().toISOString() });
    expect(await vorschlagFuer(b)).toBeUndefined();
  });

  it('Übernahme: mehrere auf einmal als Posten der Einkaufsliste, je Großhändler — nichts bestellt', async () => {
    const a = await artikel(0, { mindestmenge: 2 });
    const b = await artikel(0, { mindestmenge: 1 });
    const va = (await vorschlagFuer(a))!;
    const vb = (await vorschlagFuer(b))!;
    const { data, error } = await uebernehmen([
      { artikel: a, menge: va.menge, lieferant, erwartet: { menge: va.menge } },
      { artikel: b, menge: 5, lieferant: null, erwartet: { menge: vb.menge } },
    ]);
    expect(error).toBeNull();
    expect(data).toMatchObject({ ergebnis: 'ausgefuehrt', uebersprungen: [], veraltet: [] });
    expect(await posten(a)).toEqual([{ menge: 2, supplier_id: lieferant, angelegt_von_uid: verw.uid }]);
    // Die Menge von Hand geändert: so wird sie übernommen.
    expect(await posten(b)).toEqual([{ menge: 5, supplier_id: null, angelegt_von_uid: verw.uid }]);
    const { data: z } = await admin.from('einkauf_posten').select('bestellt_am').in('material_id', [a, b]);
    expect((z as { bestellt_am: string | null }[]).every((x) => x.bestellt_am === null)).toBe(true);
    // Danach ist nichts mehr vorzuschlagen.
    expect(await vorschlagFuer(a)).toBeUndefined();
  });

  it('Wiederholung mit derselben Vorgangskennung legt nichts doppelt an; andere Nutzlast ist ein Konflikt', async () => {
    const a = await artikel(0, { mindestmenge: 3 });
    const vorgang = crypto.randomUUID();
    const p = [{ artikel: a, menge: 3, lieferant: null, erwartet: { menge: 3 } }];
    const erst = await uebernehmen(p, verw, vorgang);
    const nochmal = await uebernehmen(p, verw, vorgang);
    expect(nochmal.data).toEqual(erst.data);
    expect(await posten(a)).toHaveLength(1);
    const anders = await uebernehmen([{ ...p[0], menge: 4 }], verw, vorgang);
    expect(anders.error?.code).toBe('23505');
  });

  it('veraltet und übersprungen: was sich geändert hat, wird nicht angelegt', async () => {
    const a = await artikel(0, { mindestmenge: 3 });
    const b = await artikel(0, { mindestmenge: 3 });
    await admin.from('einkauf_posten').insert({ company_id: BETRIEB, material_id: b, material_name: 'B', menge: 3 });
    const { data } = await uebernehmen([
      { artikel: a, menge: 3, lieferant: null, erwartet: { menge: 2 } },
      { artikel: b, menge: 3, lieferant: null, erwartet: { menge: 3 } },
    ]);
    expect((data as { veraltet: { artikel: string }[] }).veraltet.map((x) => x.artikel)).toEqual([a]);
    expect((data as { uebersprungen: { artikel: string }[] }).uebersprungen.map((x) => x.artikel)).toEqual([b]);
    expect(await posten(a)).toEqual([]);
    expect(await posten(b)).toHaveLength(1);
  });

  it('zwei gleichzeitige Übernahmen desselben Vorschlags: genau ein Posten', async () => {
    const a = await artikel(0, { mindestmenge: 4 });
    const p = [{ artikel: a, menge: 4, lieferant: null, erwartet: { menge: 4 } }];
    const [x, y] = await Promise.all([uebernehmen(p, verw), uebernehmen(p, chef)]);
    expect([x.error, y.error]).toEqual([null, null]);
    expect(await posten(a)).toHaveLength(1);
  });

  it('prüft Form und Menge: in Stück ganz, jeder Artikel einmal, fremde Artikel gibt es nicht', async () => {
    const a = await artikel(0, { mindestmenge: 3 });
    expect((await uebernehmen([{ artikel: a, menge: 2.5, lieferant: null }])).error?.code).toBe('23514');
    expect((await uebernehmen([{ artikel: a, menge: 1 }, { artikel: a, menge: 1 }])).error?.code).toBe('22023');
    expect((await uebernehmen([])).error?.code).toBe('22023');
    const { data: f } = await admin.from('materials').insert({ company_id: FREMD, name: 'Fremd', unit: 'Stk', stock: 0 }).select('id').single();
    expect((await uebernehmen([{ artikel: (f as { id: string }).id, menge: 1 }])).error?.code).toBe('P0002');
  });
});

/* ---------------------------------------- Sollbestand, Verpackungseinheit */

describe('Sollbestand und Verpackungseinheit am Artikel', () => {
  it('der Sollbestand liegt nie unter der Mindestmenge; die Verpackungseinheit über null', async () => {
    const a = await artikel(0, { mindestmenge: 5 });
    expect((await verw.client.from('materials').update({ sollbestand: 4 }).eq('id', a)).error?.message).toMatch(/materials_sollbestand/);
    expect((await verw.client.from('materials').update({ verpackungseinheit: 0 }).eq('id', a)).error?.message).toMatch(/materials_verpackungseinheit/);
    expect((await verw.client.from('materials').update({ sollbestand: 10, verpackungseinheit: 5 }).eq('id', a)).error).toBeNull();
  });

  it('pflegt, wer den Katalog pflegt — der Monteur nicht', async () => {
    const a = await artikel(0);
    expect((await max.client.from('materials').update({ sollbestand: 10 }).eq('id', a)).error?.code).toBe('42501');
    expect((await max.client.from('materials').update({ verpackungseinheit: 10 }).eq('id', a)).error?.code).toBe('42501');
    expect((await pl.client.from('materials').update({ sollbestand: 10 }).eq('id', a)).error).toBeNull();
  });
});

/* ----------------------------------------------------------------- Rechte */

describe('Rechte, Betrieb, Zeitraum', () => {
  it('Verwaltung und Leitung sehen die Deckung; Monteur und Buchhaltung nicht', async () => {
    for (const k of [verw, pl, chef]) expect((await deckung(tag(1), tag(1), {}, k)).listen.length, k.rolle).toBeGreaterThan(0);
    for (const k of [max, buch]) {
      const { error } = await k.client.rpc('materialdeckung', { p_von: tag(1), p_bis: tag(1) });
      expect(error?.code, k.rolle).toBe('42501');
      const v = await k.client.rpc('bestellvorschlaege');
      expect(v.error?.code, k.rolle).toBe('42501');
      const u = await uebernehmen([{ artikel: crypto.randomUUID(), menge: 1 }], k);
      expect(u.error?.code, k.rolle).toBe('42501');
    }
  });

  it('ein fremder Betrieb sieht nichts von diesem', async () => {
    expect((await deckung(tag(1), tag(4), {}, fremd)).listen).toEqual([]);
    expect(await vorschlaege(fremd)).toEqual([]);
  });

  it('der Support sieht weder Deckung noch Vorschläge', async () => {
    expect((await plattform.client.rpc('materialdeckung', { p_von: tag(1), p_bis: tag(1) })).error?.code).toBe('42501');
    expect((await plattform.client.rpc('bestellvorschlaege')).error?.code).toBe('42501');
  });

  it('der Zeitraum umfasst höchstens 31 Tage; das Formular einen Tag', async () => {
    expect((await chef.client.rpc('materialdeckung', { p_von: tag(0), p_bis: tag(31) })).error?.code).toBe('22023');
    expect((await chef.client.rpc('materialdeckung', { p_von: tag(1), p_bis: tag(0) })).error?.code).toBe('22023');
    expect((await chef.client.rpc('materialdeckung', { p_von: tag(0), p_bis: tag(30) })).error).toBeNull();
    expect((await chef.client.rpc('materialdeckung', { p_von: tag(0), p_bis: tag(1), p_baustelle: 'X', p_dazu: [] })).error?.code).toBe('22023');
  });
});

/* -------------------------------------------------------------- Modul (V3) */

describe('Modul aus (V3)', () => {
  it('Bestellvorschläge aus: Lesen und Übernehmen abgewiesen; die Deckung bleibt (sie trägt die Fehlmenge im Formular)', async () => {
    const a = await artikel(0, { mindestmenge: 2 });
    const vorgang = crypto.randomUUID();
    const p = [{ artikel: a, menge: 2, lieferant: null, erwartet: { menge: 2 } }];
    const vorher = await uebernehmen(p, verw, vorgang);
    expect(vorher.error).toBeNull();
    await admin.from('companies').update({ modules: { 'material.bestellvorschlaege': false } }).eq('id', BETRIEB);
    try {
      expect((await verw.client.rpc('bestellvorschlaege')).error?.code).toBe('55000');
      expect((await uebernehmen([{ artikel: await artikel(0, { mindestmenge: 1 }), menge: 1 }])).error?.code).toBe('55000');
      // Ein ausgeführter Vorgang liefert sein Ergebnis auch jetzt.
      expect((await uebernehmen(p, verw, vorgang)).data).toEqual(vorher.data);
      expect((await chef.client.rpc('materialdeckung', { p_von: tag(1), p_bis: tag(1) })).error).toBeNull();
    } finally {
      await admin.from('companies').update({ modules: null }).eq('id', BETRIEB);
    }
    // Ohne „Material“ ist auch die Unterfähigkeit aus.
    await admin.from('companies').update({ modules: { material: false } }).eq('id', BETRIEB);
    try {
      expect((await verw.client.rpc('bestellvorschlaege')).error?.code).toBe('55000');
    } finally {
      await admin.from('companies').update({ modules: null }).eq('id', BETRIEB);
    }
    expect((await verw.client.rpc('bestellvorschlaege')).error).toBeNull();
  });
});
