/**
 * M12 (B17 der Durchsicht 15.11.2026): EIN WEG FÜR EINE LIEFERUNG.
 *
 * Der Wareneingang im Lager erledigt die gewählten offenen Bestellungen mit
 * (`lager_eingang`, `p_bestellungen`) — genau wie „Geliefert“ auf der
 * Einkaufsliste. Gegenprobe: ohne 20261116061000 kennt `lager_eingang` die
 * Bestellungen nicht; die Menge ginge frei in den Bestand, die Bestellung
 * bliebe offen, und „Geliefert“ danach buchte sie ein zweites Mal ein (rot).
 * Gleichbleiben: ohne Auswahl bucht der Wareneingang wie bisher nur den
 * Bestand (eigener Test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { geliefert } from '@/lib/db/pg/einkauf';
import { lagerEingang } from '@/lib/db/pg/materials';

const A = 'm12-eingang';
let lager: Konto;
let max: Konto;
let haendler: string;

async function artikel(): Promise<string> {
  const m = await admin.from('materials').insert({
    company_id: A, name: `Kugelhahn ${randomUUID().slice(0, 8)}`, unit: 'Stk', stock: 0, lagerartikel: true,
  }).select('id').single();
  if (m.error) throw new Error(m.error.message);
  return m.data!.id;
}

async function anforderung(material: string, menge: number): Promise<string> {
  const id = randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: A, material_id: material, material_name: 'Kugelhahn', quantity: menge, status: 'In Bearbeitung',
    transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: '2026-312',
    beschaffung: 'einkauf', supplier_id: haendler, bestellt_am: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return id;
}

async function posten(material: string, menge: number): Promise<string> {
  const p = await admin.from('einkauf_posten').insert({
    company_id: A, supplier_id: haendler, material_id: material, material_name: 'Kugelhahn', menge,
    bestellt_am: new Date().toISOString(),
  }).select('id').single();
  if (p.error) throw new Error(p.error.message);
  return p.data!.id;
}

const bestand = async (material: string) =>
  Number((await admin.from('materials').select('stock').eq('id', material).single()).data?.stock);

const eingang = (material: string, menge: number, bestellungen?: string[]) => lagerEingang({
  materialId: material, menge, lieferant: 'Frauenthal', lieferschein: 'LS-312', vorgang: randomUUID(),
  ...(bestellungen ? { bestellungen } : {}),
});

beforeAll(async () => {
  await betriebAnlegen(A);
  lager = await konto(A, 'Verwaltung', 'm12lager');
  max = await konto(A, 'Mitarbeiter', 'm12max');
  const s = await admin.from('suppliers').insert({ company_id: A, name: 'Frauenthal' }).select('id').single();
  if (s.error) throw new Error(s.error.message);
  haendler = s.data!.id;
  clientEinreichen(lager.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M12: der Wareneingang erledigt die Bestellungen mit', () => {
  it('die Anforderung wird abholbereit, „Geliefert“ danach bucht nichts mehr — der Bestand stimmt', async () => {
    const m = await artikel();
    const a = await anforderung(m, 10);
    expect(await eingang(m, 10, [a])).toBe(10);
    const { data } = await admin.from('material_orders').select('status, geliefert_am, lieferschein').eq('id', a).single();
    expect(data).toMatchObject({ status: 'Abholbereit', lieferschein: 'LS-312' });
    expect(data!.geliefert_am).not.toBeNull();
    // Wer danach noch auf der Einkaufsliste abhakt, bucht nichts doppelt.
    expect(await geliefert([a])).toBe(0);
    expect(await bestand(m)).toBe(10);
    const { data: b } = await admin.from('lagerbewegungen').select('art, menge').eq('material_id', m);
    expect((b ?? []).map((x) => [x.art, Number(x.menge)])).toEqual([['eingang', 10]]);
  });

  it('der Reihe nach: Anforderung ganz, Posten teilweise — der Rest bleibt bestellt', async () => {
    const m = await artikel();
    const a = await anforderung(m, 10);
    const p = await posten(m, 20);
    expect(await eingang(m, 25, [a, p])).toBe(25);
    const { data } = await admin.from('einkauf_posten').select('menge, geliefert_am, lieferschein')
      .eq('material_id', m).order('menge');
    expect(data!.map((z) => [Number(z.menge), !!z.geliefert_am, z.lieferschein])).toEqual([
      [5, false, null],
      [15, true, 'LS-312'],
    ]);
  });

  it('mehr als bestellt: der Rest geht frei in den Bestand', async () => {
    const m = await artikel();
    const p = await posten(m, 4);
    expect(await eingang(m, 6, [p])).toBe(6);
    const { data } = await admin.from('einkauf_posten').select('geliefert_am').eq('id', p).single();
    expect(data!.geliefert_am).not.toBeNull();
  });

  it('eine inzwischen gelieferte Bestellung: nichts wird gebucht', async () => {
    const m = await artikel();
    const a = await anforderung(m, 3);
    expect(await geliefert([a])).toBe(1);
    await expect(eingang(m, 3, [a])).rejects.toThrow(/inzwischen geliefert oder geändert/);
    expect(await bestand(m)).toBe(3);
  });

  it('eine Bestellung eines anderen Artikels nimmt er nicht', async () => {
    const m = await artikel();
    const anderer = await artikel();
    const a = await anforderung(anderer, 2);
    await expect(eingang(m, 2, [a])).rejects.toThrow(/inzwischen geliefert oder geändert/);
    expect(await bestand(m)).toBe(0);
  });

  it('Gleichbleiben: ohne Auswahl nur der Bestand — die Bestellung bleibt offen', async () => {
    const m = await artikel();
    const a = await anforderung(m, 5);
    expect(await eingang(m, 5)).toBe(5);
    const { data } = await admin.from('material_orders').select('status, geliefert_am').eq('id', a).single();
    expect(data).toMatchObject({ status: 'In Bearbeitung', geliefert_am: null });
  });
});
