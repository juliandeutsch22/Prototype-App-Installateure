/**
 * Den Bestand bewegt das Lager — und der Monteur über seine Wege.
 *
 * PRÜFLAUF 25.09.2026 (P1-11, P3-17). Drei Lücken hingen zusammen: der
 * Monteur konnte den Bestand über die Schnittstelle frei setzen, weil seine
 * Abholung und seine Retoure mit SEINEN Rechten liefen; und seine eigene
 * Anforderung liess sich noch ändern, nachdem das Lager sie geprüft und
 * zugesagt hatte — aus zwei Stück wurden 999, ohne dass die Lagerprüfung
 * noch einmal hinsah.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'lager-recht';
const FREMD = 'lager-recht-b';

let lager: Konto;
let monteur: Konto;
let fremd: Konto;
let artikel: string;
let fremderArtikel: string;

async function bestand(id = artikel): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', id).single();
  return Number(data!.stock);
}

/** Eine Anforderung des Monteurs — über seinen eigenen Zugang, wie in der App. */
async function anforderung(menge: number): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await monteur.client.from('material_orders').insert({
    id, company_id: BETRIEB, material_id: artikel, material_name: 'Pressfitting 22',
    quantity: menge, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
  });
  if (error) throw new Error(error.message);
  return id;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Lagerrechte');
  await betriebAnlegen(FREMD, 'Fremdes Lager');
  lager = await konto(BETRIEB, 'Verwaltung', 'lrlager');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'lrmon');
  fremd = await konto(FREMD, 'Mitarbeiter', 'lrfremd');
  const m = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Pressfitting 22', stock: 20, unit: 'Stk' })
    .select('id').single();
  artikel = m.data!.id;
  const f = await admin.from('materials')
    .insert({ company_id: FREMD, name: 'Fremdes Fitting', stock: 50, unit: 'Stk' })
    .select('id').single();
  fremderArtikel = f.data!.id;
}, 120_000);

describe('Der Bestand', () => {
  it('setzt der Monteur nicht von Hand', async () => {
    const { error } = await monteur.client.from('materials').update({ stock: 0 }).eq('id', artikel);
    expect(error?.code).toBe('42501');
    expect(await bestand()).toBe(20);
  });

  it('bucht das Lager weiter von Hand — der Wareneingang', async () => {
    const { error } = await lager.client.rpc('bestand_anpassen', { p_material: artikel, p_delta: 5 });
    expect(error).toBeNull();
    expect(await bestand()).toBe(25);
    await admin.from('materials').update({ stock: 20 }).eq('id', artikel);
  });

  it('bewegt die Abholung des Monteurs — über „Abgeholt“', async () => {
    const id = await anforderung(3);
    const { error } = await monteur.client.rpc('anforderung_abschliessen', { p_order: id });
    expect(error).toBeNull();
    expect(await bestand()).toBe(17);
  });

  it('ein fremder Monteur schliesst die Anforderung nicht ab', async () => {
    const id = await anforderung(2);
    const { error } = await fremd.client.rpc('anforderung_abschliessen', { p_order: id });
    expect(error).toBeNull(); // wie vorher: eine fremde Anforderung sieht aus wie keine
    expect(await bestand()).toBe(17);
    const { data } = await admin.from('material_orders').select('status').eq('id', id).single();
    expect(data!.status).toBe('Offen');
  });

  it('die Retoure geht nur auf den eigenen Namen', async () => {
    const { error } = await monteur.client.rpc('retoure_anlegen', {
      p_beleg: {
        id: crypto.randomUUID(), company_id: BETRIEB, material_id: artikel,
        material_name: 'Pressfitting 22', quantity: 4, condition: 'neu', user_id: lager.uid,
      },
    });
    expect(error?.code).toBe('42501');
    expect(await bestand()).toBe(17);
  });

  it('und nie in einen fremden Betrieb — auch nicht auf einen fremden Artikel', async () => {
    const inFremdenBetrieb = await monteur.client.rpc('retoure_anlegen', {
      p_beleg: {
        id: crypto.randomUUID(), company_id: FREMD, material_id: fremderArtikel,
        material_name: 'Fremdes Fitting', quantity: 4, condition: 'neu', user_id: monteur.uid,
      },
    });
    expect(inFremdenBetrieb.error?.code).toBe('42501');

    const aufFremdenArtikel = await monteur.client.rpc('retoure_anlegen', {
      p_beleg: {
        id: crypto.randomUUID(), company_id: BETRIEB, material_id: fremderArtikel,
        material_name: 'Fremdes Fitting', quantity: 4, condition: 'neu', user_id: monteur.uid,
      },
    });
    expect(aufFremdenArtikel.error).toBeNull();
    expect(await bestand(fremderArtikel)).toBe(50);
  });
});

describe('Die eigene Anforderung', () => {
  it('ändert der Monteur, solange sie offen ist', async () => {
    const id = await anforderung(2);
    const { error } = await monteur.client.from('material_orders')
      .update({ quantity: 4, note: 'doch zwei mehr' }).eq('id', id);
    expect(error).toBeNull();
  });

  it('aber nicht mehr, sobald das Lager sie zugesagt hat', async () => {
    const id = await anforderung(2);
    const { error: zugesagt } = await lager.client.from('material_orders')
      .update({ beschaffung: 'lager', status: 'Abholbereit' }).eq('id', id);
    expect(zugesagt).toBeNull();

    const { error } = await monteur.client.from('material_orders')
      .update({ quantity: 999 }).eq('id', id);
    expect(error?.code).toBe('42501');
    const { data } = await admin.from('material_orders').select('quantity').eq('id', id).single();
    expect(Number(data!.quantity)).toBe(2);
  });

  it('und schiebt sich nicht selbst auf „abholbereit“', async () => {
    const id = await anforderung(1);
    const { error } = await monteur.client.from('material_orders')
      .update({ beschaffung: 'lager', status: 'Abholbereit' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });
});

describe('Die Lagerprüfung', () => {
  it('sieht auch eine nachträglich erhöhte Menge', async () => {
    // 17 im Regal. Zugesagt werden 5 — danach 50 daraus zu machen, ginge an
    // der Prüfung vorbei, wenn sie nur beim Abhaken hinsähe.
    const id = await anforderung(5);
    await lager.client.from('material_orders')
      .update({ beschaffung: 'lager', status: 'Abholbereit' }).eq('id', id);
    const { error } = await lager.client.from('material_orders')
      .update({ quantity: 50 }).eq('id', id);
    expect(error?.message).toMatch(/angefordert sind 50/);

    // Weniger vom selben geht immer.
    const weniger = await lager.client.from('material_orders').update({ quantity: 4 }).eq('id', id);
    expect(weniger.error).toBeNull();
  });
});
