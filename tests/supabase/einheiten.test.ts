/**
 * Nachtest 01.10.2026, U5 — Einheiten im Lager einheitlich: die Datenbank
 * schreibt Varianten in die übliche Form, unbekannte bleiben.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen } from './helfer';

const BETRIEB = 'einheiten-u5';

let db: Client;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
});

afterAll(async () => {
  await db?.end();
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

/*
  DIE ANGLEICHUNG DES BESTANDS, WIE SIE BEIM EINSPIELEN LÄUFT (02.10.2026).
  Der erste Anlauf scheiterte im Projekt an der Katalogsperre: beim
  Einspielen ist niemand angemeldet. Von null an fiel es nicht auf, weil die
  Tabelle dort leer ist. Hier stehen alte Schreibweisen schon in der Tabelle
  (an der Normalisierung vorbei angelegt), und angeglichen wird mit derselben
  Rolle wie beim Einspielen.
*/
describe('Angleichung des Bestands beim Einspielen', () => {
  it('gleicht alte Zeilen an — trotz Katalogsperre, ohne den Änderungszeitpunkt zu verschieben', async () => {
    await db.query('alter table public.materials disable trigger materials_einheit_norm');
    await db.query('alter table public.einkauf_posten disable trigger einkauf_posten_einheit_norm');
    let artikel: string;
    let posten: string;
    try {
      ({ rows: [{ id: artikel }] } = await db.query<{ id: string }>(
        `insert into public.materials (company_id, name, unit, stock, updated_at)
         values ($1, 'Altbestand Rohr', 'Stck', 0, '2026-01-15T08:00:00Z') returning id`, [BETRIEB]));
      ({ rows: [{ id: posten }] } = await db.query<{ id: string }>(
        `insert into public.einkauf_posten (company_id, material_name, menge, einheit)
         values ($1, 'Altbestand Silikon', 2, 'M') returning id`, [BETRIEB]));
    } finally {
      await db.query('alter table public.materials enable trigger materials_einheit_norm');
      await db.query('alter table public.einkauf_posten enable trigger einkauf_posten_einheit_norm');
    }

    const { rows: [{ n }] } = await db.query<{ n: number }>('select app.einheiten_angleichen() as n');
    expect(n).toBeGreaterThanOrEqual(2);

    const { rows: [m] } = await db.query<{ unit: string; updated_at: Date }>(
      'select unit, updated_at from public.materials where id = $1', [artikel]);
    expect(m.unit).toBe('Stk');
    expect(m.updated_at.toISOString()).toBe('2026-01-15T08:00:00.000Z');
    const { rows: [p] } = await db.query<{ einheit: string }>(
      'select einheit from public.einkauf_posten where id = $1', [posten]);
    expect(p.einheit).toBe('m');

    // Danach wirken die Sperren wieder: die Trigger sind eingeschaltet.
    const { rows: aus } = await db.query(
      `select tgname from pg_trigger
        where tgrelid in ('public.materials'::regclass, 'public.einkauf_posten'::regclass)
          and not tgisinternal and tgenabled = 'D'`);
    expect(aus).toEqual([]);
  });
});
