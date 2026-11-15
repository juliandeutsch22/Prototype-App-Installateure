/**
 * M5/F5 (Durchsicht 15.11.2026): TEILMENGEN; ZURÜCKZIEHEN UND ÄNDERN.
 *
 * - „Aus Lager“ war alles oder nichts: 6 frei, 10 angefordert → abgewiesen.
 * - „Abgeholt“ kannte nur die ganze Menge.
 * - Der Besteller konnte nicht zurückziehen.
 *
 * Gegenprobe: ohne 20261116060300 gibt es `anforderung_aus_lager` und
 * `anforderung_zurueckziehen` nicht, und `anforderung_abschliessen` kennt
 * `p_menge` nicht (die Schnittstelle meldet die Funktion als unbekannt).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';

const A = 'm5-teilmengen';
let lager: Konto;
let max: Konto;
let kollege: Konto;
let fitting: string;
let haendler: string;

async function anforderung(menge: number, von: Konto = max, rest: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  const { error } = await von.client.from('material_orders').insert({
    id, company_id: A, material_id: fitting, material_name: 'Pressfitting', quantity: menge, status: 'Offen',
    transaction_type: 'order', user_id: von.uid, user_name: 'Max', project_number: '2026-250', ...rest,
  });
  if (error) throw new Error(error.message);
  return id;
}

const zeilen = async () =>
  ((await admin.from('material_orders')
    .select('quantity, status, beschaffung, processed, erfasst_von, supplier_id')
    .eq('company_id', A).order('quantity')).data ?? [])
    .map((z) => `${Number(z.quantity)} ${z.status} ${z.beschaffung ?? '-'}${z.processed ? ' verbucht' : ''}`)
    // Gleiche Mengen haben keine feste Reihenfolge aus der Datenbank — sortiert wird hier.
    .sort();

const bestand = async () => Number((await admin.from('materials').select('stock').eq('id', fitting).single()).data?.stock);

beforeAll(async () => {
  await betriebAnlegen(A);
  lager = await konto(A, 'Verwaltung', 'm5lager');
  max = await konto(A, 'Mitarbeiter', 'm5max');
  kollege = await konto(A, 'Mitarbeiter', 'm5kollege');
  const m = await admin.from('materials').insert({ company_id: A, name: 'Pressfitting', unit: 'Stk', stock: 6, lagerartikel: true }).select('id').single();
  if (m.error) throw new Error(m.error.message);
  fitting = m.data!.id;
  const s = await admin.from('suppliers').insert({ company_id: A, name: 'Frauenthal' }).select('id').single();
  if (s.error) throw new Error(s.error.message);
  haendler = s.data!.id;
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M5: Teilmengen', () => {
  let id: string;

  it('6 aus dem Lager, 4 auf die Einkaufsliste — der Erfasser bleibt an beiden Zeilen', async () => {
    id = await anforderung(10);
    // Vorher (und weiter): alles aus dem Lager geht nicht.
    const ganz = await lager.client.from('material_orders').update({ beschaffung: 'lager', status: 'Abholbereit' }).eq('id', id);
    expect(ganz.error?.message).toMatch(/nur 6 Stk frei/);

    const { data, error } = await lager.client.rpc('anforderung_aus_lager', {
      p_id: id, p_status: 'Offen', p_menge: 6, p_rest: 'einkauf', p_supplier: haendler,
    });
    expect(error).toBeNull();
    expect((data as { ergebnis: string }).ergebnis).toBe('geaendert');
    expect(await zeilen()).toEqual(['4 In Bearbeitung einkauf', '6 Abholbereit lager']);
    const erfasser = (await admin.from('material_orders').select('erfasst_von').eq('company_id', A)).data ?? [];
    expect(new Set(erfasser.map((z) => z.erfasst_von))).toEqual(new Set([max.uid]));
  });

  it('veraltet, wenn ein anderer schneller war', async () => {
    const { data } = await lager.client.rpc('anforderung_aus_lager', { p_id: id, p_status: 'Offen', p_menge: 2 });
    expect(data).toEqual({ ergebnis: 'veraltet' });
  });

  it('4 von 6 abgeholt: nur 4 gehen aus dem Bestand, 2 bleiben abholbereit', async () => {
    const { data: teil } = await admin.from('material_orders').select('id').eq('company_id', A).eq('beschaffung', 'lager').single();
    const { data, error } = await max.client.rpc('anforderung_abschliessen', {
      p_order: teil!.id, p_status: 'Abholbereit', p_menge: 4,
    });
    expect(error).toBeNull();
    expect(data).toBe(1);
    expect(await bestand()).toBe(2);
    expect(await zeilen()).toEqual(['2 Abholbereit lager', '4 Erledigt lager verbucht', '4 In Bearbeitung einkauf']);
  });

  it('mehr als angefordert gibt es nicht', async () => {
    const { data: rest } = await admin.from('material_orders').select('id').eq('company_id', A)
      .eq('status', 'Abholbereit').single();
    const { error } = await max.client.rpc('anforderung_abschliessen', { p_order: rest!.id, p_menge: 3 });
    expect(error?.message).toMatch(/höchstens die angeforderten 2/);
  });

  it('Gleichbleiben: ohne Menge wird die ganze Anforderung gebucht', async () => {
    const { data: rest } = await admin.from('material_orders').select('id').eq('company_id', A)
      .eq('status', 'Abholbereit').single();
    const { error } = await max.client.rpc('anforderung_abschliessen', { p_order: rest!.id });
    expect(error).toBeNull();
    expect(await bestand()).toBe(0);
  });
});

describe('M5: Zurückziehen und Ändern, solange „Offen“', () => {
  it('der Besteller ändert die Menge und zieht zurück', async () => {
    const id = await anforderung(30);
    const aendern = await max.client.from('material_orders').update({ quantity: 3 }).eq('id', id).select('quantity');
    expect(aendern.error).toBeNull();
    const { data } = await max.client.rpc('anforderung_zurueckziehen', { p_id: id });
    expect(data).toEqual({ ergebnis: 'zurueckgezogen' });
    expect((await admin.from('material_orders').select('id').eq('id', id)).data).toEqual([]);
  });

  it('nicht mehr, sobald das Lager entschieden hat — und nicht die Anforderung eines Kollegen', async () => {
    await admin.from('materials').update({ stock: 5 }).eq('id', fitting);
    const id = await anforderung(1);
    const aus = await lager.client.rpc('anforderung_aus_lager', { p_id: id, p_status: 'Offen' });
    expect(aus.data).toMatchObject({ ergebnis: 'geaendert' });
    const spaet = await max.client.rpc('anforderung_zurueckziehen', { p_id: id });
    expect(spaet.data).toEqual({ ergebnis: 'veraltet' });

    const fremd = await anforderung(1, kollege);
    const versuch = await max.client.rpc('anforderung_zurueckziehen', { p_id: fremd });
    expect(versuch.error?.message).toMatch(/Zurückziehen kann, wer angefordert hat/);
    expect((await admin.from('material_orders').select('id').eq('id', fremd)).data).toHaveLength(1);
  });
});
