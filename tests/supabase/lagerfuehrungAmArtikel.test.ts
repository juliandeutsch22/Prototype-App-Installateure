/**
 * M6 (Durchsicht 15.11.2026): LAGERFÜHRUNG IST EINE EIGENSCHAFT DES ARTIKELS.
 *
 * Bis dahin machte jede Lieferung für eine Anforderung den Artikel für immer
 * zum Lagerartikel (Eingang in den Bestand → `app.lager_folgt_bestand`); nach
 * der Abholung stand er mit Bestand null unter „knapp“.
 *
 * Gegenprobe: ohne 20261116060200 ist „Sonderfitting“ nach der Lieferung
 * Lagerartikel mit Bestand 4, und das Protokoll trägt Eingang und Entnahme.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { geliefert } from '@/lib/db/pg/einkauf';
import { kommissionsartikelImLager } from '@/lib/db/pg/materials';

const A = 'm6-lagerfuehrung';
let lager: Konto;
let max: Konto;
const sonder = randomUUID();
const rohr = randomUUID();
const altKommission = randomUUID();
const altGezaehlt = randomUUID();

async function anforderung(material: string, name: string, menge: number): Promise<string> {
  const id = randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: A, material_id: material, material_name: name, quantity: menge, status: 'In Bearbeitung',
    transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: '2026-260', beschaffung: 'einkauf',
  });
  if (error) throw new Error(error.message);
  return id;
}

const artikel = async (id: string) =>
  (await admin.from('materials').select('lagerartikel, stock').eq('id', id).single()).data;
const bewegungen = async (id: string) =>
  ((await admin.from('lagerbewegungen').select('art, menge').eq('material_id', id)).data ?? [])
    .map((b) => `${b.art} ${Number(b.menge)}`).sort();

beforeAll(async () => {
  await betriebAnlegen(A);
  lager = await konto(A, 'Verwaltung', 'm6lager');
  max = await konto(A, 'Mitarbeiter', 'm6max');
  const { error } = await admin.from('materials').insert([
    { id: sonder, company_id: A, name: 'Sonderfitting', unit: 'Stk', stock: 0, lagerartikel: false },
    { id: rohr, company_id: A, name: 'Kupferrohr 15', unit: 'm', stock: 0, lagerartikel: true },
    // Altdaten: so sah ein Kommissionsartikel nach dem alten Weg aus — und einer, den das Lager gezählt hat.
    { id: altKommission, company_id: A, name: 'Alt Kommission', unit: 'Stk', stock: 0, lagerartikel: true },
    { id: altGezaehlt, company_id: A, name: 'Alt gezählt', unit: 'Stk', stock: 0, lagerartikel: true },
  ]);
  if (error) throw new Error(error.message);
  const altOrder = await anforderung(altKommission, 'Alt Kommission', 2);
  const b = await admin.from('lagerbewegungen').insert([
    { company_id: A, material_id: altKommission, art: 'eingang', menge: 2, bestand_nachher: 2, material_order_id: altOrder },
    { company_id: A, material_id: altKommission, art: 'entnahme', menge: -2, bestand_nachher: 0, material_order_id: altOrder },
    { company_id: A, material_id: altGezaehlt, art: 'eingang', menge: 2, bestand_nachher: 2, material_order_id: altOrder },
    { company_id: A, material_id: altGezaehlt, art: 'inventur', menge: -2, bestand_nachher: 0 },
  ]);
  if (b.error) throw new Error(b.error.message);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M6: Kommissionsware bleibt Kommissionsware', () => {
  it('Lieferung und Abholung lassen einen nicht geführten Artikel aus dem Bestand', async () => {
    const id = await anforderung(sonder, 'Sonderfitting', 4);
    clientEinreichen(lager.client);
    expect(await geliefert([id])).toBe(1);
    expect(await artikel(sonder)).toEqual({ lagerartikel: false, stock: 0 });
    const { data: o } = await admin.from('material_orders').select('status, kommission').eq('id', id).single();
    expect(o).toEqual({ status: 'Abholbereit', kommission: true });

    const { error } = await max.client.rpc('anforderung_abschliessen', { p_order: id });
    expect(error).toBeNull();
    expect(await artikel(sonder)).toEqual({ lagerartikel: false, stock: 0 });
    expect(await bewegungen(sonder)).toEqual([]);
  });

  it('auch „beim Abholen geliefert“ (nie über die Einkaufsliste abgehakt)', async () => {
    const id = await anforderung(sonder, 'Sonderfitting', 2);
    const { error } = await max.client.rpc('anforderung_abschliessen', { p_order: id });
    expect(error).toBeNull();
    expect(await artikel(sonder)).toEqual({ lagerartikel: false, stock: 0 });
  });

  it('geliefert als Kommission, dann geführt: die Abholung bucht trotzdem nichts ab', async () => {
    const id = await anforderung(sonder, 'Sonderfitting', 3);
    clientEinreichen(lager.client);
    await geliefert([id]);
    // Inzwischen legt das Lager 10 Stück ins Regal.
    await admin.from('materials').update({ stock: 10 }).eq('id', sonder);
    expect((await artikel(sonder))?.lagerartikel).toBe(true);
    await max.client.rpc('anforderung_abschliessen', { p_order: id });
    expect(Number((await artikel(sonder))?.stock)).toBe(10);
  });

  it('Gleichbleiben: ein geführter Artikel bucht Eingang und Entnahme wie bisher', async () => {
    const id = await anforderung(rohr, 'Kupferrohr 15', 5);
    clientEinreichen(lager.client);
    await geliefert([id]);
    expect(await artikel(rohr)).toEqual({ lagerartikel: true, stock: 5 });
    await max.client.rpc('anforderung_abschliessen', { p_order: id });
    expect(await artikel(rohr)).toEqual({ lagerartikel: true, stock: 0 });
    expect(await bewegungen(rohr)).toEqual(['eingang 5', 'entnahme -5']);
  });
});

describe('M6: Altdaten — Kommissionsartikel, die schon im Lager stehen', () => {
  it('nennt nur, was nie anders als über eine Anforderung ins Lager kam, und nimmt genau das heraus', async () => {
    clientEinreichen(lager.client);
    expect((await kommissionsartikelImLager()).map((m) => m.name)).toEqual(['Alt Kommission']);
    const raus = await kommissionsartikelImLager([altKommission, altGezaehlt]);
    expect(raus.map((m) => m.name)).toEqual(['Alt Kommission']);
    expect((await artikel(altKommission))?.lagerartikel).toBe(false);
    expect((await artikel(altGezaehlt))?.lagerartikel).toBe(true);
  });

  it('der Monteur darf das nicht', async () => {
    clientEinreichen(max.client);
    await expect(kommissionsartikelImLager()).rejects.toThrow(/Verwaltung oder die Leitung/);
  });
});
