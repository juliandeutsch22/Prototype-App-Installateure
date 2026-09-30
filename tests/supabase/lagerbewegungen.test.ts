/**
 * Testbericht 30.09.2026, M28 und M29 — der Bestand ändert sich nur über
 * Bewegungen, und jede steht im Protokoll: Wareneingang mit Lieferant und
 * Lieferschein, Inventur mit Grund, Abholung mit Bezug zur Anforderung.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'm28-lager';
let lager: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  lager = await konto(BETRIEB, 'Verwaltung', 'm28lager');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'm28mont');
}, 120_000);

async function artikel(stock = 10, unit = 'Stk'): Promise<string> {
  const { data, error } = await lager.client.from('materials')
    .insert({ company_id: BETRIEB, name: `Artikel ${crypto.randomUUID().slice(0, 6)}`, stock, unit })
    .select('id').single();
  if (error) throw new Error(error.message);
  return data!.id as string;
}

const bestand = async (id: string) =>
  Number((await admin.from('materials').select('stock').eq('id', id).single()).data!.stock);

const bewegungen = async (id: string) =>
  ((await admin.from('lagerbewegungen').select('*').eq('material_id', id).order('created_at')).data ?? []) as
    Array<Record<string, unknown>>;

const letzte = async (id: string) => {
  const alle = await bewegungen(id);
  return alle[alle.length - 1];
};

describe('Kein Bestand an der Bewegung vorbei', () => {
  it('auch die Verwaltung überschreibt ihn nicht mehr direkt', async () => {
    const id = await artikel(10);
    const { error } = await lager.client.from('materials').update({ stock: 99 }).eq('id', id);
    expect(error?.message).toMatch(/nur über Wareneingang, Abholung, Retoure oder Inventur/);
    expect(await bestand(id)).toBe(10);
  });

  it('der Anfangsbestand eines neuen Artikels steht im Protokoll', async () => {
    const id = await artikel(7);
    const [b] = await bewegungen(id);
    expect(b).toMatchObject({ art: 'anfangsbestand', menge: 7, bestand_nachher: 7, erfasst_von: lager.uid });
  });

  it('Gegenprobe: der Dienstschlüssel (Rücklauf, Prüfungen) schreibt ohne Protokoll', async () => {
    const id = await artikel(5);
    const { error } = await admin.from('materials').update({ stock: 50 }).eq('id', id);
    expect(error).toBeNull();
    expect((await bewegungen(id)).map((b) => b.art)).toEqual(['anfangsbestand']);
  });
});

describe('Wareneingang (M29)', () => {
  it('mit Lieferant, Lieferschein und Bezug', async () => {
    const id = await artikel(10);
    const { data, error } = await lager.client.rpc('lager_eingang', {
      p_material: id, p_menge: 12, p_lieferant: 'Frauenthal', p_lieferschein: 'LS-4711', p_bezug: 'Bestellung 114',
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(22);
    const b = (await letzte(id));
    expect(b).toMatchObject({
      art: 'eingang', menge: 12, bestand_nachher: 22, lieferant: 'Frauenthal', lieferschein: 'LS-4711', bezug: 'Bestellung 114',
    });
  });

  it('ohne Lieferant nicht, und Meter mit Komma, Stück ganz', async () => {
    const id = await artikel(10);
    const ohne = await lager.client.rpc('lager_eingang', {
      p_material: id, p_menge: 1, p_lieferant: ' ', p_lieferschein: null, p_bezug: null,
    });
    expect(ohne.error?.message).toMatch(/Lieferanten/);
    const krumm = await lager.client.rpc('lager_eingang', {
      p_material: id, p_menge: 2.5, p_lieferant: 'Frauenthal', p_lieferschein: null, p_bezug: null,
    });
    expect(krumm.error?.message).toMatch(/ganze Stück/);
    const rohr = await artikel(0, 'm');
    const meter = await lager.client.rpc('lager_eingang', {
      p_material: rohr, p_menge: 2.5, p_lieferant: 'Frauenthal', p_lieferschein: null, p_bezug: null,
    });
    expect(meter.error).toBeNull();
    expect(await bestand(rohr)).toBe(2.5);
  });

  it('Gegenprobe: der Monteur bucht keinen Wareneingang', async () => {
    const id = await artikel(10);
    const { error } = await monteur.client.rpc('lager_eingang', {
      p_material: id, p_menge: 5, p_lieferant: 'Frauenthal', p_lieferschein: null, p_bezug: null,
    });
    expect(error?.code).toBe('42501');
    expect(await bestand(id)).toBe(10);
  });
});

describe('Inventur (M28)', () => {
  it('setzt den gezählten Bestand, mit Grund im Protokoll', async () => {
    const id = await artikel(10);
    const { error } = await lager.client.rpc('lager_inventur', { p_material: id, p_bestand: 8, p_grund: 'Bruch' });
    expect(error).toBeNull();
    expect(await bestand(id)).toBe(8);
    expect((await letzte(id))).toMatchObject({ art: 'inventur', menge: -2, bestand_nachher: 8, grund: 'Bruch' });
  });

  it('ohne Grund keine Korrektur', async () => {
    const id = await artikel(10);
    const { error } = await lager.client.rpc('lager_inventur', { p_material: id, p_bestand: 3, p_grund: '' });
    expect(error?.message).toMatch(/Ohne Grund/);
    expect(await bestand(id)).toBe(10);
  });

  it('ein bestätigter Bestand steht mit null im Protokoll', async () => {
    const id = await artikel(10);
    await lager.client.rpc('lager_inventur', { p_material: id, p_bestand: 10, p_grund: 'Inventur 30.09.' });
    expect((await letzte(id))).toMatchObject({ art: 'inventur', menge: 0, bestand_nachher: 10 });
  });
});

describe('Abholung und Protokoll', () => {
  it('die Entnahme trägt den Bezug zur Anforderung', async () => {
    const id = await artikel(10);
    const auftrag = crypto.randomUUID();
    await admin.from('material_orders').insert({
      id: auftrag, company_id: BETRIEB, material_id: id, material_name: 'x', quantity: 3,
      status: 'Abholbereit', beschaffung: 'lager', transaction_type: 'order', user_id: monteur.uid,
      user_name: 'Monteur', project_number: 'B-9',
    });
    const { error } = await monteur.client.rpc('anforderung_abschliessen', { p_order: auftrag });
    expect(error).toBeNull();
    expect(await bestand(id)).toBe(7);
    expect((await letzte(id))).toMatchObject({
      art: 'entnahme', menge: -3, bestand_nachher: 7, material_order_id: auftrag, erfasst_von: monteur.uid,
    });
  });

  it('der Monteur liest das Protokoll nicht', async () => {
    const id = await artikel(4);
    const { data } = await monteur.client.from('lagerbewegungen').select('id').eq('material_id', id);
    expect(data ?? []).toEqual([]);
  });

  it('niemand schreibt das Protokoll direkt', async () => {
    const id = await artikel(4);
    const { error } = await lager.client.from('lagerbewegungen').insert({
      company_id: BETRIEB, material_id: id, art: 'eingang', menge: 100, bestand_nachher: 104,
    });
    expect(error).not.toBeNull();
  });
});
