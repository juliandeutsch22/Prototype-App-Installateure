/**
 * Lager und Einkauf — gegen die echte Datenbank.
 *
 * WAS HIER AUF DEM SPIEL STEHT, ist der Bestand. Ware vom Grosshändler geht
 * beim Eintreffen ins Lager und beim Abschluss wieder hinaus; beides zusammen
 * muss null ergeben. Bucht einer der Schritte doppelt oder gar nicht, stimmt
 * das Regal nicht mehr — und das fällt erst bei der nächsten Inventur auf.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as einkauf from '@/lib/db/pg/einkauf';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'einkauf-a';
const FREMD = 'einkauf-b';

let lager: Konto;
let monteur: Konto;
let grosshaendler: string;
let fremderHaendler: string;
let artikel: string;

async function bestand(): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', artikel).single();
  return Number(data?.stock);
}

async function anforderung(menge: number): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: BETRIEB, material_id: artikel, material_name: 'Eckventil 1/2',
    quantity: menge, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
    project_number: 'B-2026-0001',
  });
  if (error) throw new Error(error.message);
  return id;
}

async function zeile(id: string) {
  const { data } = await admin.from('material_orders')
    .select('status, beschaffung, supplier_id, bestellt_am, geliefert_am, processed')
    .eq('id', id).single();
  return data!;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  lager = await konto(BETRIEB, 'Verwaltung', 'lager');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
  clientEinreichen(lager.client);

  grosshaendler = await einkauf.grosshaendlerSpeichern(BETRIEB, null, {
    name: 'Holter', customerNumber: '4711', bestellEmail: 'vertreter@holter.test', contactLine: '',
  });
  const f = await admin.from('suppliers').insert({ company_id: FREMD, name: 'Fremd' }).select('id').single();
  fremderHaendler = f.data!.id;
  const m = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Eckventil 1/2', stock: 10, unit: 'Stk', article_number: 'EV-12' })
    .select('id').single();
  artikel = m.data!.id;
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Der Grosshändler', () => {
  it('wird mit Bestelladresse gespeichert — leere Felder als NULL', async () => {
    const liste = await einkauf.listGrosshaendler(BETRIEB);
    const h = liste.find((x) => x.id === grosshaendler)!;
    expect(h).toMatchObject({ name: 'Holter', customerNumber: '4711', bestellEmail: 'vertreter@holter.test' });
    expect(h.contactLine ?? null).toBeNull();
  });
});

describe('Aus dem Lager', () => {
  it('wird gleich abholbereit — der Bestand bleibt bis zum Abschluss', async () => {
    const vorher = await bestand();
    const id = await anforderung(2);
    await einkauf.ausLager(id);
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit', beschaffung: 'lager' });
    expect(await bestand()).toBe(vorher);

    await anforderungen.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(vorher - 2);
  });
});

/**
 * LAUNCH-CHECK 25.09.2026, K2: 999 Stück bei 74 im Regal liessen sich „aus
 * Lager" zusagen — das Lager zeigte „−926 frei", und der Monteur bekam die
 * Meldung, er könne Ware abholen, die es nicht gibt.
 */
describe('Aus dem Lager — nur, was da ist', () => {
  let rohr: string;

  async function rohrAnforderung(menge: number, rest: Record<string, unknown> = {}): Promise<string> {
    const id = crypto.randomUUID();
    const { error } = await admin.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: rohr, material_name: 'Rohr 15',
      quantity: menge, status: 'Offen', transaction_type: 'order', user_id: monteur.uid, ...rest,
    });
    if (error) throw new Error(error.message);
    return id;
  }

  beforeAll(async () => {
    const m = await admin.from('materials')
      .insert({ company_id: BETRIEB, name: 'Rohr 15', stock: 74, unit: 'm' })
      .select('id').single();
    rohr = m.data!.id;
  });

  it('lehnt mehr ab, als im Regal liegt — und nennt die Zahlen', async () => {
    const id = await rohrAnforderung(999);
    await expect(einkauf.ausLager(id)).rejects.toThrow(/nur 74 m frei \(74 im Regal, 0 schon zugesagt\) — angefordert sind 999/);
    expect(await zeile(id)).toMatchObject({ status: 'Offen', beschaffung: null });
    // Der Weg daneben bleibt offen.
    await einkauf.aufEinkaufsliste(id, grosshaendler);
    expect(await zeile(id)).toMatchObject({ beschaffung: 'einkauf' });
  });

  it('zählt, was schon zugesagt ist — auch Geliefertes für eine andere Anforderung', async () => {
    const a = await rohrAnforderung(50);
    await einkauf.ausLager(a);
    const b = await rohrAnforderung(24);
    await einkauf.ausLager(b); // 50 + 24 = 74, geht genau auf
    const c = await rohrAnforderung(1);
    await expect(einkauf.ausLager(c)).rejects.toThrow(/nur 0 m frei \(74 im Regal, 74 schon zugesagt\)/);

    // Holt jemand a ab, sind 24 m im Regal und 24 zugesagt.
    await anforderungen.updateOrderStatus(a, 'Erledigt');
    await expect(einkauf.ausLager(c)).rejects.toThrow(/nur 0 m frei \(24 im Regal, 24 schon zugesagt\)/);

    // Geliefert für eine Anforderung: im Regal, aber nicht frei.
    const d = await rohrAnforderung(5);
    await einkauf.aufEinkaufsliste(d, grosshaendler);
    await einkauf.geliefert([d]);
    await expect(einkauf.ausLager(c)).rejects.toThrow(/nur 0 m frei \(29 im Regal, 29 schon zugesagt\)/);
  });

  it('eine offene, noch nicht geprüfte Anforderung sagt nichts zu', async () => {
    // Nur ein Wunsch — sie hält den Lageristen nicht davon ab, einer
    // anderen das Regal zuzusagen.
    await admin.from('materials').update({ stock: 100 }).eq('id', rohr);
    await rohrAnforderung(80);
    const e = await rohrAnforderung(60);
    await expect(einkauf.ausLager(e)).resolves.toBeUndefined();
  });
});

describe('Über die Einkaufsliste', () => {
  it('bestellt, geliefert, abgeschlossen: der Bestand endet, wo er begann', async () => {
    const vorher = await bestand();
    const id = await anforderung(3);

    await einkauf.aufEinkaufsliste(id, grosshaendler);
    expect(await zeile(id)).toMatchObject({
      status: 'In Bearbeitung', beschaffung: 'einkauf', supplier_id: grosshaendler, bestellt_am: null,
    });

    await einkauf.alsBestelltMarkieren([id]);
    expect((await zeile(id)).bestellt_am).not.toBeNull();

    expect(await einkauf.geliefert([id])).toBe(1);
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit' });
    expect(await bestand()).toBe(vorher + 3);

    // Zweimal gedrückt bucht nicht zweimal ein.
    expect(await einkauf.geliefert([id])).toBe(0);
    expect(await bestand()).toBe(vorher + 3);

    await anforderungen.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(vorher);
  });

  it('abgeschlossen OHNE „geliefert" zieht nicht ab, was nie im Regal lag', async () => {
    const vorher = await bestand();
    const id = await anforderung(4);
    await einkauf.aufEinkaufsliste(id, grosshaendler);
    await anforderungen.updateOrderStatus(id, 'Erledigt');

    expect(await bestand()).toBe(vorher);
    const z = await zeile(id);
    expect(z.geliefert_am).not.toBeNull();
    expect(z.processed).toBe(true);
  });

  it('lässt sich zurücknehmen, solange nicht bestellt — danach nicht mehr', async () => {
    const a = await anforderung(1);
    await einkauf.aufEinkaufsliste(a, grosshaendler);
    await einkauf.vonEinkaufslisteNehmen(a);
    expect(await zeile(a)).toMatchObject({ status: 'Offen', beschaffung: null, supplier_id: null });

    const b = await anforderung(1);
    await einkauf.aufEinkaufsliste(b, grosshaendler);
    await einkauf.alsBestelltMarkieren([b]);
    await einkauf.vonEinkaufslisteNehmen(b);
    expect(await zeile(b)).toMatchObject({ beschaffung: 'einkauf', status: 'In Bearbeitung' });
  });

  it('„bestellt" überschreibt kein früheres Bestelldatum', async () => {
    const id = await anforderung(1);
    await einkauf.aufEinkaufsliste(id, grosshaendler);
    await einkauf.alsBestelltMarkieren([id]);
    const erst = (await zeile(id)).bestellt_am;
    await new Promise((r) => setTimeout(r, 20));
    await einkauf.alsBestelltMarkieren([id]);
    expect((await zeile(id)).bestellt_am).toBe(erst);
  });

  it('lässt den Monteur seine eigene Ware nicht als geliefert buchen', async () => {
    // Seine eigene Anforderung darf er ändern (für „Abgeholt") — den
    // Wareneingang und damit den Bestand darf er deshalb noch lange nicht.
    const vorher = await bestand();
    const id = await anforderung(5);
    await einkauf.aufEinkaufsliste(id, grosshaendler);
    const { error } = await monteur.client.rpc('einkauf_geliefert', { p_ids: [id] });
    expect(error?.message).toMatch(/Verwaltung oder die Leitung/);
    expect(await bestand()).toBe(vorher);
    expect((await zeile(id)).geliefert_am).toBeNull();
  });

  it('nimmt keinen Grosshändler eines anderen Betriebs an', async () => {
    const id = await anforderung(1);
    await expect(einkauf.aufEinkaufsliste(id, fremderHaendler)).rejects.toThrow(/Grosshändler/);
  });
});

/*
  EIGENES MATERIAL DES BÜROS — etwa um das Lager aufzufüllen. Keine
  Anforderung: „Geliefert" bucht ins Lager, und damit ist der Posten erledigt.
*/
describe('Eigenes Material auf der Einkaufsliste', () => {
  const ICH = { angelegtVonUid: '', angelegtVonName: 'Vera Verwaltung' };

  async function posten(id: string) {
    const { data } = await admin.from('einkauf_posten')
      .select('bestellt_am, geliefert_am, material_id').eq('id', id).single();
    return data!;
  }

  it('legt die Verwaltung an, bestellt und bucht beim Eintreffen ins Lager — einmal', async () => {
    const vorher = await bestand();
    const id = await einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialId: artikel, materialName: 'Eckventil 1/2',
      menge: 12, einheit: 'Stk', supplierId: grosshaendler, notiz: 'Regal 3',
    });
    expect((await einkauf.listLagerPosten(BETRIEB)).map((p) => p.id)).toContain(id);

    await einkauf.lagerPostenBestellt([id]);
    expect((await posten(id)).bestellt_am).not.toBeNull();

    expect(await einkauf.geliefert([id])).toBe(1);
    expect(await bestand()).toBe(vorher + 12);
    // Zweimal gedrückt bucht nicht zweimal.
    expect(await einkauf.geliefert([id])).toBe(0);
    expect(await bestand()).toBe(vorher + 12);
    expect((await einkauf.listLagerPosten(BETRIEB)).map((p) => p.id)).not.toContain(id);
  });

  it('findet freien Text im Katalog über den Namen — und bucht ohne Katalog nichts', async () => {
    const vorher = await bestand();
    const beimNamen = await einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialId: null, materialName: ' eckventil 1/2 ', menge: 3,
    });
    const frei = await einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialId: null, materialName: 'Sonderteil XY', menge: 2,
    });
    expect(await einkauf.geliefert([beimNamen, frei])).toBe(2);
    expect(await bestand()).toBe(vorher + 3);
    expect((await posten(beimNamen)).material_id).toBe(artikel);
    expect((await posten(frei)).geliefert_am).not.toBeNull();
  });

  it('bucht Anforderung und eigenen Posten in EINEM Aufruf', async () => {
    const vorher = await bestand();
    const a = await anforderung(1);
    await einkauf.aufEinkaufsliste(a, grosshaendler);
    const p = await einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialId: artikel, materialName: 'Eckventil 1/2', menge: 4,
    });
    expect(await einkauf.geliefert([a, p])).toBe(2);
    expect(await bestand()).toBe(vorher + 5);
    expect((await zeile(a)).status).toBe('Abholbereit');
  });

  it('lässt löschen, solange nicht bestellt — danach nicht mehr, und geliefert schon gar nicht', async () => {
    const offen = await einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialId: artikel, materialName: 'Eckventil 1/2', menge: 1,
    });
    await einkauf.lagerPostenLoeschen([offen]);
    expect((await admin.from('einkauf_posten').select('id').eq('id', offen)).data).toHaveLength(0);

    const bestellt = await einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialId: artikel, materialName: 'Eckventil 1/2', menge: 1,
    });
    await einkauf.lagerPostenBestellt([bestellt]);
    await einkauf.lagerPostenLoeschen([bestellt]);
    expect((await admin.from('einkauf_posten').select('id').eq('id', bestellt)).data).toHaveLength(1);

    await einkauf.geliefert([bestellt]);
    await lager.client.from('einkauf_posten').delete().eq('id', bestellt);
    await lager.client.from('einkauf_posten').update({ menge: 99 }).eq('id', bestellt);
    const { data } = await admin.from('einkauf_posten').select('menge').eq('id', bestellt).single();
    expect(Number(data?.menge)).toBe(1);
  });

  it('sehen und schreiben nur Verwaltung und Leitung — nicht Monteur, nicht Buchhaltung', async () => {
    const buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
    const pl = await konto(BETRIEB, 'Projektleiter', 'pl');
    const id = await einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialId: artikel, materialName: 'Eckventil 1/2', menge: 1,
    });
    for (const k of [monteur, buch]) {
      expect((await k.client.from('einkauf_posten').select('id').eq('id', id)).data).toEqual([]);
      const { error } = await k.client.from('einkauf_posten').insert({
        company_id: BETRIEB, material_name: 'Muffe', menge: 1,
      });
      expect(error).not.toBeNull();
    }
    expect((await pl.client.from('einkauf_posten').select('id').eq('id', id)).data).toHaveLength(1);
    const { error } = await pl.client.from('einkauf_posten').insert({
      company_id: BETRIEB, material_name: 'Muffe', menge: 1,
    });
    expect(error).toBeNull();
  });

  it('nimmt keinen fremden Grosshändler, keine Menge von null und keinen leeren Namen', async () => {
    await expect(einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialName: 'Muffe', menge: 1, supplierId: fremderHaendler,
    })).rejects.toThrow(/Grosshändler/);
    await expect(einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialName: 'Muffe', menge: 0,
    })).rejects.toThrow(/menge/);
    await expect(einkauf.lagerPostenAnlegen(BETRIEB, {
      ...ICH, angelegtVonUid: lager.uid, materialName: '   ', menge: 1,
    })).rejects.toThrow(/name/);
  });

  it('sucht Artikel im Katalog nach Name und Nummer — ohne ausgelaufene', async () => {
    await admin.from('materials').insert({
      company_id: BETRIEB, name: 'Eckventil 3/8 alt', ausgelaufen: true, article_number: 'EV-38',
    });
    expect((await einkauf.artikelSuchen(BETRIEB, 'ev-12')).map((m) => m.id)).toEqual([artikel]);
    expect((await einkauf.artikelSuchen(BETRIEB, 'Eckventil')).map((m) => m.name)).toEqual(['Eckventil 1/2']);
    expect(await einkauf.artikelSuchen(BETRIEB, ' ')).toEqual([]);
  });
});
