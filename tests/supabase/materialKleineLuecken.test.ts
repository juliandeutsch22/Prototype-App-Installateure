/**
 * M8 (Durchsicht 15.11.2026): KLEINE LÜCKEN IM MATERIAL — DIE TEILE IN DER
 * DATENBANK.
 *
 * - Eine freie Zeile mit Kommamenge, deren Name einem Artikel in „Stk“
 *   gleicht, ließ sich nicht abholen (auch nicht „beim Händler“).
 * - Anforderungen trugen keine Einheit.
 * - Die Nachkalkulation rechnete mit dem heutigen Einkaufspreis.
 *
 * Gegenprobe: ohne 20261116060700 scheitert „Abgeholt“ mit „In „Stk“ zählen
 * ganze Stück“, `einheit` gibt es nicht, und `ausgegebenes_material_gesamt`
 * liefert keinen Einkaufspreis.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { ausgegebenesMaterialGesamt } from '@/lib/db/pg/materialOrders';

const A = 'm8-luecken';
const NR = '2026-200';
let gf: Konto;
let buch: Konto;
let max: Konto;
let fitting: string;
let rohr: string;

async function anfordern(teil: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  const { error } = await max.client.from('material_orders').insert({
    id, company_id: A, quantity: 1, status: 'Offen', transaction_type: 'order',
    user_id: max.uid, user_name: 'Max', project_number: NR, ...teil,
  });
  if (error) throw new Error(error.message);
  return id;
}

beforeAll(async () => {
  await betriebAnlegen(A);
  gf = await konto(A, 'Geschäftsführung', 'm8gf');
  buch = await konto(A, 'Buchhaltung', 'm8buch');
  max = await konto(A, 'Mitarbeiter', 'm8max');
  const m = await admin.from('materials').insert([
    { company_id: A, name: 'Pressfitting 15', unit: 'Stk', stock: 5, lagerartikel: true },
    { company_id: A, name: 'Rohr 18', unit: 'm', stock: 50, lagerartikel: true },
  ]).select('id, name');
  if (m.error) throw new Error(m.error.message);
  fitting = m.data!.find((x) => x.name === 'Pressfitting 15')!.id;
  rohr = m.data!.find((x) => x.name === 'Rohr 18')!.id;
  const e = await admin.from('material_einkaufspreise').insert({ company_id: A, material_id: rohr, einkaufspreis: 3.2 });
  if (e.error) throw new Error(e.error.message);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M8: freie Zeile mit Kommamenge', () => {
  it('lässt sich abholen — sie bleibt frei, statt am Artikel in „Stk“ zu scheitern', async () => {
    const id = await anfordern({ material_name: 'pressfitting 15', quantity: 2.5, einheit: 'Stangen' });
    const { error } = await max.client.rpc('anforderung_abschliessen', { p_order: id });
    expect(error).toBeNull();
    const { data } = await admin.from('material_orders').select('material_id, status, einheit').eq('id', id).single();
    expect(data).toEqual({ material_id: null, status: 'Erledigt', einheit: 'Stangen' });
    expect(Number((await admin.from('materials').select('stock').eq('id', fitting).single()).data?.stock)).toBe(5);
  });

  it('Gleichbleiben: mit ganzer Menge bekommt sie den Artikel und bucht ab', async () => {
    const id = await anfordern({ material_name: 'Pressfitting 15', quantity: 2 });
    await max.client.rpc('anforderung_abschliessen', { p_order: id });
    const { data } = await admin.from('material_orders').select('material_id, einheit').eq('id', id).single();
    expect(data).toEqual({ material_id: fitting, einheit: 'Stk' });
  });
});

describe('M8: Einheit an der Anforderung', () => {
  it('beim Katalogartikel die des Artikels — auch wenn etwas anderes geschickt wird', async () => {
    const id = await anfordern({ material_id: rohr, material_name: 'Rohr 18', quantity: 4.5, einheit: 'Stk' });
    expect((await admin.from('material_orders').select('einheit').eq('id', id).single()).data).toEqual({ einheit: 'm' });
  });
});

describe('M8: Einkaufspreis zum Zeitpunkt der Ausgabe', () => {
  it('hält ihn beim Abholen fest; ein neuer Preis ändert die Nachkalkulation nicht mehr', async () => {
    const id = await anfordern({ material_id: rohr, material_name: 'Rohr 18', quantity: 10 });
    await max.client.rpc('anforderung_abschliessen', { p_order: id });
    await admin.from('material_einkaufspreise').update({ einkaufspreis: 9 }).eq('material_id', rohr);
    clientEinreichen(gf.client);
    const zeilen = (await ausgegebenesMaterialGesamt([NR])).get(NR) ?? [];
    expect(zeilen.find((z) => z.materialId === rohr && z.menge === 10)?.einkaufspreis).toBe(3.2);
  });

  it('wer Einkaufspreise nicht sieht, bekommt keinen — die Buchhaltung und erst recht der Monteur', async () => {
    clientEinreichen(buch.client);
    const zeilen = (await ausgegebenesMaterialGesamt([NR])).get(NR) ?? [];
    expect(zeilen.every((z) => z.einkaufspreis == null)).toBe(true);
    const { data } = await max.client.from('einkaufspreis_festgehalten').select('id');
    expect(data).toEqual([]);
  });
});
