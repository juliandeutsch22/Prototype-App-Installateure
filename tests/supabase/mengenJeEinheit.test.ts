/**
 * Testbericht 30.09.2026, M27 — die Datenbank prüft Mengen je Einheit:
 * Meter und Kilo mit Komma, Stück ganz, nie null oder weniger.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'm27-mengen';
let monteur: Konto;
let rohr: string;
let dichtung: string;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'm27mont');
  const { data } = await admin.from('materials').insert([
    { company_id: BETRIEB, name: 'Kupferrohr 15', unit: 'm' },
    { company_id: BETRIEB, name: 'Dichtung', unit: 'Stk' },
  ]).select('id, name');
  rohr = data!.find((m) => m.name === 'Kupferrohr 15')!.id;
  dichtung = data!.find((m) => m.name === 'Dichtung')!.id;
}, 60_000);

const anfordern = (material_id: string, quantity: number) =>
  monteur.client.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: BETRIEB, material_id, material_name: 'x', quantity, status: 'Offen',
    transaction_type: 'order', user_id: monteur.uid, user_name: 'Monteur',
  }).select('id');

describe('Anforderungen', () => {
  it('2,5 m Rohr gehen durch', async () => {
    const { error } = await anfordern(rohr, 2.5);
    expect(error).toBeNull();
  });

  it('2,5 Stück Dichtungen nicht', async () => {
    const { error } = await anfordern(dichtung, 2.5);
    expect(error?.message).toMatch(/ganze Stück/);
  });

  it('Gegenprobe: null oder weniger nie, ganze Stück schon', async () => {
    expect((await anfordern(dichtung, 0)).error?.message).toMatch(/größer als null/);
    expect((await anfordern(rohr, -1)).error?.message).toMatch(/größer als null/);
    expect((await anfordern(dichtung, 3)).error).toBeNull();
  });
});
