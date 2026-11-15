/**
 * M4 (Durchsicht 15.11.2026): BESTELLUNG STORNIEREN MIT GRUND; „GELIEFERT“
 * MIT MENGE UND LIEFERSCHEIN-NR.
 *
 * Gegenprobe: ohne 20261116060400 gibt es `einkauf_stornieren` und
 * `einkauf_teillieferung` nicht, und `einkauf_geliefert` kennt keinen
 * Lieferschein — „bestellt“ war nicht rücknehmbar, „geliefert“ alles oder
 * nichts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { bestellungStornieren, geliefert, teillieferung } from '@/lib/db/pg/einkauf';

const A = 'm4-einkauf';
let lager: Konto;
let max: Konto;
let hahn: string;
let haendler: string;

async function bestellt(menge: number): Promise<string> {
  const id = randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: A, material_id: hahn, material_name: 'Kugelhahn', quantity: menge, status: 'In Bearbeitung',
    transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: '2026-240',
    beschaffung: 'einkauf', supplier_id: haendler, bestellt_am: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return id;
}

const bestand = async () => Number((await admin.from('materials').select('stock').eq('id', hahn).single()).data?.stock);

beforeAll(async () => {
  await betriebAnlegen(A);
  lager = await konto(A, 'Verwaltung', 'm4lager');
  max = await konto(A, 'Mitarbeiter', 'm4max');
  const m = await admin.from('materials').insert({ company_id: A, name: 'Kugelhahn', unit: 'Stk', stock: 0, lagerartikel: true }).select('id').single();
  if (m.error) throw new Error(m.error.message);
  hahn = m.data!.id;
  const s = await admin.from('suppliers').insert({ company_id: A, name: 'Frauenthal' }).select('id').single();
  if (s.error) throw new Error(s.error.message);
  haendler = s.data!.id;
  clientEinreichen(lager.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M4: Teillieferung mit Lieferschein', () => {
  it('6 von 10: 6 eingebucht und abholbereit, 4 bleiben bestellt — der Lieferschein steht an Zeile und Bewegung', async () => {
    const id = await bestellt(10);
    expect(await teillieferung(id, 6, 'LS-4711')).toBe(true);
    expect(await bestand()).toBe(6);
    const { data } = await admin.from('material_orders')
      .select('quantity, status, bestellt_am, geliefert_am, lieferschein').eq('company_id', A).order('quantity');
    expect(data!.map((z) => [Number(z.quantity), z.status, !!z.bestellt_am, !!z.geliefert_am, z.lieferschein])).toEqual([
      [4, 'In Bearbeitung', true, false, null],
      [6, 'Abholbereit', true, true, 'LS-4711'],
    ]);
    const { data: b } = await admin.from('lagerbewegungen').select('art, menge, lieferschein').eq('material_id', hahn);
    expect((b ?? []).map((x) => [x.art, Number(x.menge), x.lieferschein])).toEqual([['eingang', 6, 'LS-4711']]);
  });

  it('mehr als bestellt wird abgewiesen — das geht über den Wareneingang', async () => {
    const id = await bestellt(2);
    await expect(teillieferung(id, 3)).rejects.toThrow(/Bestellt sind 2/);
  });

  it('der eigene Posten des Büros ebenso', async () => {
    const p = await admin.from('einkauf_posten').insert({
      company_id: A, supplier_id: haendler, material_id: hahn, material_name: 'Kugelhahn', menge: 20,
      bestellt_am: new Date().toISOString(),
    }).select('id').single();
    if (p.error) throw new Error(p.error.message);
    const vorher = await bestand();
    expect(await teillieferung(p.data!.id, 5)).toBe(true);
    expect(await bestand()).toBe(vorher + 5);
    const { data } = await admin.from('einkauf_posten').select('menge, geliefert_am').eq('company_id', A).order('menge');
    expect(data!.map((z) => [Number(z.menge), !!z.geliefert_am])).toEqual([[5, true], [15, false]]);
  });

  it('Gleichbleiben: „Geliefert“ ohne Lieferschein bucht die ganze Menge wie bisher', async () => {
    const id = await bestellt(3);
    const vorher = await bestand();
    expect(await geliefert([id])).toBe(1);
    expect(await bestand()).toBe(vorher + 3);
  });
});

describe('M4: Bestellung stornieren', () => {
  it('mit Grund zurück auf „zu bestellen“; der Grund bleibt an der Zeile', async () => {
    const id = await bestellt(1);
    expect(await bestellungStornieren([id], 'Großhändler kann nicht liefern')).toBe(1);
    const { data } = await admin.from('material_orders')
      .select('bestellt_am, liefertermin, bestellung_storno_grund, bestellung_storniert_am, beschaffung').eq('id', id).single();
    expect(data).toMatchObject({ bestellt_am: null, liefertermin: null, bestellung_storno_grund: 'Großhändler kann nicht liefern', beschaffung: 'einkauf' });
    expect(data!.bestellung_storniert_am).not.toBeNull();
  });

  it('ohne Grund nicht, eine gelieferte nicht, und der Monteur gar nicht', async () => {
    const id = await bestellt(1);
    await expect(bestellungStornieren([id], '  ')).rejects.toThrow(/Ohne Grund/);
    await geliefert([id]);
    expect(await bestellungStornieren([id], 'zu spät')).toBe(0);
    clientEinreichen(max.client);
    await expect(bestellungStornieren([id], 'zu spät')).rejects.toThrow(/Verwaltung oder die Leitung/);
    clientEinreichen(lager.client);
  });
});
