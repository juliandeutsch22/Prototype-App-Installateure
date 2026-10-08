import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { lagerFrei, listMaterials, listKnappeLagerArtikel } from '@/lib/db/pg/materials';

const gross = 'lager-frei-40800';
const klein = 'lager-frei-1501';
let chefin: Konto;
let monteur: Konto;
let artikel: string[];

beforeAll(async () => {
  await betriebAnlegen(gross);
  await betriebAnlegen(klein);
  chefin = await konto(gross, 'Geschäftsführung', 'lagerfrei-gross');
  monteur = await konto(klein, 'Mitarbeiter', 'lagerfrei-klein');
  // Mengen ausschließlich in der fest adressierten lokalen Testdatenbank.
  const db = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  try {
    await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)");
    await db.query(`insert into public.materials(company_id, name, stock, unit)
      select $1, 'Großartikel ' || i, case when i <= 800 then 5 else 0 end, 'Stk'
        from generate_series(1,40800) i`, [gross]);
    const r = await db.query(`insert into public.materials(company_id, name, stock, unit)
      select $1, 'Kleinartikel ' || i, 7, 'Stk' from generate_series(1,1501) i returning id`, [klein]);
    artikel = r.rows.map((z: { id: string }) => z.id);
  } finally {
    await db.end();
  }
}, 120_000);
afterAll(() => clientEinreichen(null));

it('berechnet den Großhandelskatalog innerhalb des unveränderten SQL-Zeitlimits', async () => {
  const r = await chefin.client.rpc('lager_frei');
  expect(r.error).toBeNull();
  expect(r.data?.length).toBeGreaterThan(0);
  expect(r.data?.every((z: { bestand: number; frei: number }) => [0, 5].includes(Number(z.bestand)) && Number(z.frei) === Number(z.bestand))).toBe(true);
});

it('liefert auch ohne Artikelauswahl alle 1.501 Bestände statt der ersten API-Seite', async () => {
  clientEinreichen(monteur.client);
  const alle = await lagerFrei();
  expect(alle.size).toBe(1501);
  expect(new Set(alle.keys())).toEqual(new Set(artikel));
});

it('liefert genau die gewählten 1.101 Artikel einschließlich der alten Folgeseite', async () => {
  clientEinreichen(monteur.client);
  const ids = artikel.slice(400);
  const alle = await lagerFrei(ids);
  expect(new Set(alle.keys())).toEqual(new Set(ids));
  expect([...alle.values()].every((z) => z.bestand === 7 && z.zugesagt === 0 && z.geplant === 0 && z.frei === 7)).toBe(true);
});

it('holt für eine leere Artikelauswahl keinen unbeschränkten Katalog', async () => {
  clientEinreichen(monteur.client);
  expect((await lagerFrei([])).size).toBe(0);
});

it('gibt auch bei direkter Artikelauswahl keine Daten eines anderen Betriebs heraus', async () => {
  const r = await chefin.client.rpc('lager_frei', { p_material_ids: artikel.slice(0, 2) });
  expect(r.error).toBeNull();
  expect(r.data).toEqual([]);
});

it('behält den bisherigen Ergebnisaufbau für den Monteur bei', async () => {
  const r = await monteur.client.rpc('lager_frei');
  expect(r.error).toBeNull();
  expect(r.data?.length).toBeGreaterThan(0);
  expect(Object.keys(r.data![0]).sort()).toEqual(['material_id', 'bestand', 'zugesagt', 'geplant', 'frei'].sort());
});

it('holt alle 800 Lagerartikel vor der Kataloggrenze statt einer zufälligen Teilmenge', async () => {
  clientEinreichen(chefin.client);
  const alle = await listMaterials(gross, 2000, true);
  expect(alle).toHaveLength(800);
  expect(alle.every((m) => m.lagerartikel === true && m.stock === 5)).toBe(true);
});

it('zählt Knappheit vollständig, mit strenger Mindestmenge und zugesagtem Bestand', async () => {
  clientEinreichen(monteur.client);
  for (const [id, minimum] of [[artikel[1499], 8], [artikel[1498], 7], [artikel[1497], 0]] as const) {
    expect((await admin.from('materials').update({ mindestmenge: minimum }).eq('id', id)).error).toBeNull();
  }
  expect((await admin.from('material_orders').insert({
    id: crypto.randomUUID(), company_id: klein, material_id: artikel[0], material_name: 'Kleinartikel 1',
    user_id: monteur.uid, quantity: 4, status: 'Abholbereit', transaction_type: 'order',
    beschaffung: 'lager', processed: false,
  })).error).toBeNull();
  const knapp = await listKnappeLagerArtikel(5);
  expect(new Set(knapp.map((m) => m.id))).toEqual(new Set([artikel[0], artikel[1499]]));
  expect(knapp.find((m) => m.id === artikel[0])?.frei).toBe(3);
  expect(knapp.find((m) => m.id === artikel[1499])?.mindestmenge).toBe(8);
  expect(await listKnappeLagerArtikel(7)).toHaveLength(1499);
  clientEinreichen(chefin.client);
  expect(await listKnappeLagerArtikel(5)).toHaveLength(800);
});
