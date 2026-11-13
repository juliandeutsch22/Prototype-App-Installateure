/**
 * „ABGEHOLT“ MIT HERKUNFT (C7, E89) — `anforderung_abschliessen(…, p_herkunft)`.
 *
 * Solange das Büro nichts bereitgestellt hat, fragt die App, woher die Ware
 * kam. „Beim Händler mitgenommen“ bucht nichts im Lager ab — das Regal hat
 * sie nie gesehen —, die Anforderung ist trotzdem erledigt und hält die
 * Herkunft fest. „Aus dem Lager“ bucht wie bisher (siehe
 * `abgeholtBeiOffen.test.ts`). Liegt die Ware schon abholbereit oder ist sie
 * beim Großhändler bestellt, gibt es „vom Händler“ nicht.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'abgeholt-herkunft-a';

let monteur: Konto;
let artikel: string;

const bestand = async () =>
  Number((await admin.from('materials').select('stock').eq('id', artikel).single()).data!.stock);

async function bewegungen(order: string) {
  const { data } = await admin.from('lagerbewegungen').select('art, menge').eq('material_order_id', order);
  return data ?? [];
}

async function anforderung(rest: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: BETRIEB, material_id: artikel, material_name: 'Kugelhahn 1/2"',
    quantity: 3, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
    user_name: 'Max Monteur', project_number: 'PR-2026-0301', ...rest,
  });
  if (error) throw new Error(error.message);
  return id;
}

async function zeile(id: string) {
  const { data } = await admin.from('material_orders')
    .select('status, processed, abgeholt_herkunft, geliefert_am').eq('id', id).single();
  return data!;
}

const abholen = (id: string, herkunft?: string, status = 'Offen') =>
  monteur.client.rpc('anforderung_abschliessen', { p_order: id, p_status: status, ...(herkunft ? { p_herkunft: herkunft } : {}) });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'abgherkmon');
  const m = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Kugelhahn 1/2"', stock: 10, unit: 'Stk' })
    .select('id').single();
  artikel = m.data!.id;
}, 120_000);

beforeEach(async () => {
  await admin.from('materials').update({ stock: 10 }).eq('id', artikel);
});

describe('beim Händler mitgenommen', () => {
  it('im Stand „Offen“: erledigt, kein Abgang, der Bestand bleibt, die Herkunft steht da', async () => {
    const id = await anforderung();
    const { data, error } = await abholen(id, 'haendler');
    expect(error).toBeNull();
    expect(data).toBe(1);
    expect(await zeile(id)).toMatchObject({ status: 'Erledigt', processed: true, abgeholt_herkunft: 'haendler' });
    expect(await bewegungen(id)).toEqual([]);
    expect(await bestand()).toBe(10);
  });

  it('Gegenprobe: aus dem Lager — ein Abgang über die Menge, Herkunft „lager“', async () => {
    const id = await anforderung();
    expect((await abholen(id, 'lager')).error).toBeNull();
    expect(await zeile(id)).toMatchObject({ status: 'Erledigt', abgeholt_herkunft: 'lager' });
    expect((await bewegungen(id)).map((b) => Number(b.menge))).toEqual([-3]);
    expect(await bestand()).toBe(7);
  });

  it('gleich geblieben: ohne Angabe gilt das Lager, wie bisher', async () => {
    const id = await anforderung();
    expect((await abholen(id)).error).toBeNull();
    expect(await zeile(id)).toMatchObject({ abgeholt_herkunft: 'lager' });
    expect(await bestand()).toBe(7);
  });

  it('auf der Einkaufsliste, noch nicht bestellt: vom Händler geht, sie verschwindet von der Liste', async () => {
    const id = await anforderung({ beschaffung: 'einkauf' });
    expect((await abholen(id, 'haendler')).error).toBeNull();
    const z = await zeile(id);
    expect(z).toMatchObject({ processed: true, abgeholt_herkunft: 'haendler' });
    expect(z.geliefert_am).not.toBeNull();
    expect(await bewegungen(id)).toEqual([]);
    expect(await bestand()).toBe(10);
  });
});

describe('vom Händler gibt es nicht, wenn …', () => {
  it('… die Ware schon abholbereit liegt', async () => {
    const id = await anforderung({ status: 'Abholbereit' });
    const { error } = await abholen(id, 'haendler', 'Abholbereit');
    expect(error?.message).toMatch(/solange nichts bereitgestellt oder bestellt ist/);
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit', processed: false, abgeholt_herkunft: null });
  });

  it('… sie beim Großhändler bestellt ist', async () => {
    const id = await anforderung({ beschaffung: 'einkauf', bestellt_am: new Date().toISOString() });
    const { error } = await abholen(id, 'haendler');
    expect(error?.message).toMatch(/solange nichts bereitgestellt oder bestellt ist/);
    expect(await zeile(id)).toMatchObject({ processed: false });
  });

  it('eine andere Herkunft als Lager oder Händler: abgewiesen', async () => {
    const id = await anforderung();
    const { error } = await abholen(id, 'baumarkt');
    expect(error?.code).toBe('22023');
    expect(await zeile(id)).toMatchObject({ status: 'Offen', processed: false });
  });
});
