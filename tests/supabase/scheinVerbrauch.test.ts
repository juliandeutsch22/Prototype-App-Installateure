/**
 * M3/F10 (Durchsicht 15.11.2026): VERBRAUCH AM SCHEIN BUCHT DAS LAGER.
 *
 * Bisher bewegte der Schein keinen Bestand; was ohne Anforderung aus dem
 * Fahrzeug oder dem Regal kam, sank nirgends. Jetzt bietet der
 * unterschriebene Schein die Differenz „auf dem Schein, aber nicht
 * ausgegeben“ an, gebucht wird einmal je Schein.
 *
 * Gegenprobe: ohne 20261116060600 gibt es `schein_verbrauch_vorschlag` und
 * `schein_verbrauch_buchen` nicht — der Fahrzeugbestand bleibt bei 20.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { scheinVerbrauchBuchen, scheinVerbrauchVorschlag } from '@/lib/db/pg/workSheets';
import { retoureRahmen } from '@/lib/db/pg/materialOrders';

const A = 'm3-schein';
const NR = '2026-210';
let lager: Konto;
let max: Konto;
let tom: Konto;
let buch: Konto;
let fitting: string;
let bus = '';

async function schein(von: Konto, menge: number): Promise<string> {
  const id = randomUUID();
  const s = await admin.from('work_sheets').insert({
    id, company_id: A, project_number: NR, customer_name: 'Familie Huber', datum: '2026-11-16', status: 'Entwurf',
    abrechnung: 'Regie', erstellt_von_uid: von.uid, erstellt_von_name: 'Max',
  });
  if (s.error) throw new Error(s.error.message);
  const m = await admin.from('work_sheet_material').insert({
    company_id: A, work_sheet_id: id, position: 0, name: 'Pressfitting 15', menge, einheit: 'Stk', material_id: fitting,
  });
  if (m.error) throw new Error(m.error.message);
  const u = await admin.from('work_sheets').update({ status: 'Unterschrieben' }).eq('id', id);
  if (u.error) throw new Error(u.error.message);
  return id;
}

const imBus = async () => Number((await admin.from('lagerbestaende').select('menge')
  .eq('lagerort_id', bus).eq('material_id', fitting).single()).data?.menge);
const imLager = async () => Number((await admin.from('materials').select('stock').eq('id', fitting).single()).data?.stock);

beforeAll(async () => {
  await betriebAnlegen(A);
  lager = await konto(A, 'Verwaltung', 'm3lager');
  max = await konto(A, 'Mitarbeiter', 'm3max');
  tom = await konto(A, 'Mitarbeiter', 'm3tom');
  buch = await konto(A, 'Buchhaltung', 'm3buch');
  const m = await admin.from('materials').insert({ company_id: A, name: 'Pressfitting 15', unit: 'Stk', stock: 10, lagerartikel: true }).select('id').single();
  if (m.error) throw new Error(m.error.message);
  fitting = m.data!.id;
  const { data: fz, error } = await lager.client.rpc('fahrzeug_speichern', {
    p_fahrzeug: { kennzeichen: 'W-123M3', standardfahrer_uid: max.uid, aktiv: true },
  });
  if (error) throw new Error(error.message);
  bus = (await admin.from('lagerorte').select('id').eq('fahrzeug_id', fz).single()).data!.id;
  const b = await admin.from('lagerbestaende').insert({ company_id: A, lagerort_id: bus, material_id: fitting, menge: 20 });
  if (b.error) throw new Error(b.error.message);
  // 4 Stück für die Baustelle über eine Anforderung abgeholt.
  const o = await admin.from('material_orders').insert({
    id: randomUUID(), company_id: A, material_id: fitting, material_name: 'Pressfitting 15', quantity: 4,
    status: 'Erledigt', transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: NR,
  });
  if (o.error) throw new Error(o.error.message);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M3: Verbrauch am Schein', () => {
  let erster: string;

  it('bietet an, was über das Ausgegebene hinausgeht — mit dem eigenen Fahrzeug zur Wahl', async () => {
    erster = await schein(max, 6);
    clientEinreichen(max.client);
    const v = await scheinVerbrauchVorschlag(erster);
    expect(v?.entschieden).toBe(false);
    expect(v?.zeilen.map((z) => [z.name, z.aufSchein, z.vorschlag])).toEqual([['Pressfitting 15', 6, 2]]);
    expect(v?.orte.map((o) => o.id)).toEqual([bus]);
  });

  it('aus einem fremden Fahrzeug bucht der Monteur nicht; die Buchhaltung bekommt nichts angeboten', async () => {
    clientEinreichen(tom.client);
    expect(await scheinVerbrauchVorschlag(erster)).toBeNull();
    await expect(scheinVerbrauchBuchen(erster, [])).rejects.toThrow(/angelegt hat, oder das Lager/);
    clientEinreichen(buch.client);
    expect(await scheinVerbrauchVorschlag(erster)).toBeNull();
  });

  it('bucht aus dem Fahrzeug — einmal; danach steht nur noch, was gebucht wurde', async () => {
    clientEinreichen(max.client);
    await expect(scheinVerbrauchBuchen(erster, [{ materialId: fitting, menge: 3, ortId: bus }]))
      .rejects.toThrow(/höchstens/);
    expect(await scheinVerbrauchBuchen(erster, [{ materialId: fitting, menge: 2, ortId: bus }])).toBe(true);
    expect(await imBus()).toBe(18);
    expect(await scheinVerbrauchBuchen(erster, [])).toBe(false);
    const v = await scheinVerbrauchVorschlag(erster);
    expect(v?.entschieden).toBe(true);
    expect(v?.gebucht.map((g) => [g.menge, g.ort])).toEqual([[2, 'W-123M3']]);
  });

  it('der nächste Schein rechnet mit: der gebuchte Verbrauch zählt als ausgegeben', async () => {
    const zweiter = await schein(max, 1);
    clientEinreichen(max.client);
    // ausgegeben 4 + gebucht 2 − auf dem ersten Schein 6 = 0 frei → 1 anzubieten.
    expect((await scheinVerbrauchVorschlag(zweiter))?.zeilen.map((z) => z.vorschlag)).toEqual([1]);
    expect(await scheinVerbrauchBuchen(zweiter, [])).toBe(true);
    expect(await imLager()).toBe(10);
  });

  it('die Retoure darf zurückbringen, was am Schein vom Fahrzeug gebucht wurde', async () => {
    clientEinreichen(max.client);
    expect((await retoureRahmen(NR, fitting, 'Pressfitting 15'))?.ausgegeben).toBe(6);
  });

  it('Gleichbleiben: was über Anforderungen kam, wird nicht angeboten', async () => {
    await admin.from('material_orders').insert({
      id: randomUUID(), company_id: A, material_id: fitting, material_name: 'Pressfitting 15', quantity: 10,
      status: 'Erledigt', transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: NR,
    });
    const dritter = await schein(max, 3);
    clientEinreichen(max.client);
    expect((await scheinVerbrauchVorschlag(dritter))?.zeilen).toEqual([]);
  });
});
