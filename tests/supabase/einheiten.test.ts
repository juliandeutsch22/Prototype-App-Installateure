/**
 * Nachtest 01.10.2026, U5 — Einheiten im Lager einheitlich: die Datenbank
 * schreibt Varianten in die übliche Form, unbekannte bleiben.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen } from './helfer';

const BETRIEB = 'einheiten-u5';

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
});

async function einheit(unit: string): Promise<string | null> {
  const { data, error } = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: `Artikel ${unit}-${crypto.randomUUID().slice(0, 4)}`, unit, stock: 0 })
    .select('unit').single();
  if (error) throw new Error(error.message);
  return (data as { unit: string | null }).unit;
}

describe('Einheiten', () => {
  it('schreibt „Stck“, „M“ und „qm“ in die übliche Form', async () => {
    expect(await einheit('Stck')).toBe('Stk');
    expect(await einheit('M')).toBe('m');
    expect(await einheit(' qm ')).toBe('m²');
    expect(await einheit('PAK')).toBe('Pkg');
  });

  it('lässt eine unbekannte Einheit stehen', async () => {
    expect(await einheit('Karton')).toBe('Karton');
  });

  it('gilt ebenso für die eigenen Posten der Einkaufsliste', async () => {
    const { data, error } = await admin.from('einkauf_posten')
      .insert({ company_id: BETRIEB, material_name: 'Silikon', menge: 2, einheit: 'stück' }).select('einheit').single();
    if (error) throw new Error(error.message);
    expect((data as { einheit: string }).einheit).toBe('Stk');
  });
});
