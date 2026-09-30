/**
 * Testbericht 30.09.2026, M32 und G19 — eine Rüstliste ab heute reserviert
 * Bestand wie eine zugesagte Anforderung, und `lager_frei` nennt je Artikel,
 * was frei ist.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'm32-ruest';
let lager: Konto;
let monteur: Konto;
let artikel: string;

const tag = (versatz: number) => {
  const d = new Date(Date.now() + versatz * 86_400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
};

async function ruestliste(datum: string, menge: number, baustelle: string) {
  const { data, error } = await admin.from('einsatz_material')
    .insert({ company_id: BETRIEB, date: datum, project_number: baustelle }).select('id').single();
  if (error) throw new Error(error.message);
  const p = await admin.from('einsatz_material_positionen').insert({
    id: `p${crypto.randomUUID().slice(0, 8)}`, company_id: BETRIEB, einsatz_material_id: data!.id,
    position: 0, material_id: artikel, name: 'Mischbatterie', menge,
  });
  if (p.error) throw new Error(p.error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  lager = await konto(BETRIEB, 'Verwaltung', 'm32lager');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'm32mont');
  const { data } = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Mischbatterie', stock: 5, unit: 'Stk' }).select('id').single();
  artikel = data!.id as string;
  await ruestliste(tag(1), 4, 'B-1');   // morgen: reserviert
  await ruestliste(tag(-3), 5, 'B-2');  // vorbei: reserviert nichts mehr
}, 120_000);

describe('lager_frei', () => {
  it('zieht die geplanten Rüstlisten ab — auch für den Monteur', async () => {
    for (const k of [lager, monteur]) {
      const { data, error } = await k.client.rpc('lager_frei');
      expect(error).toBeNull();
      const z = (data as Array<Record<string, unknown>>).find((r) => r.material_id === artikel)!;
      expect({ bestand: Number(z.bestand), geplant: Number(z.geplant), frei: Number(z.frei) })
        .toEqual({ bestand: 5, geplant: 4, frei: 1 });
    }
  });
});

describe('Aus Lager', () => {
  it('sagt nicht zu, was eine Rüstliste reserviert hat', async () => {
    const id = crypto.randomUUID();
    await admin.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: artikel, material_name: 'Mischbatterie', quantity: 2,
      status: 'Offen', transaction_type: 'order', user_id: monteur.uid, user_name: 'Monteur',
    });
    const { error } = await lager.client.from('material_orders')
      .update({ beschaffung: 'lager', status: 'Abholbereit' }).eq('id', id);
    expect(error?.message).toMatch(/nur 1 Stk frei/);
  });

  it('Gegenprobe: was nach der Reservierung frei ist, geht', async () => {
    const id = crypto.randomUUID();
    await admin.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: artikel, material_name: 'Mischbatterie', quantity: 1,
      status: 'Offen', transaction_type: 'order', user_id: monteur.uid, user_name: 'Monteur',
    });
    const { error } = await lager.client.from('material_orders')
      .update({ beschaffung: 'lager', status: 'Abholbereit' }).eq('id', id);
    expect(error).toBeNull();
  });
});
