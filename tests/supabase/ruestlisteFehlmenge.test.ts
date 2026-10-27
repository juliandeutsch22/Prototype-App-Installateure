/**
 * DIE FEHLMENGE DER RÜSTLISTE WIRD NICHT DOPPELT AUSGEGEBEN (Testbericht Runde 6, M5).
 *
 * Der Ablauf aus dem Bericht: Rüstliste 6 Pressfitting, im Lager 4 — „Im
 * Lager fehlen 2“. Vorher entstand die Anforderung über 2 sofort, die
 * Verwaltung erfüllte sie „Aus Lager“, der Monteur lud 6 ein und holte die 2
 * zusätzlich: 8 ausgegeben für 6.
 *
 * Jetzt entsteht die Anforderung mit der Liste und trägt ihre Position; die
 * Liste reserviert und bucht nur den Rest aus dem Regal.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'r6p4-ruest';
const FREMD = 'r6p4-ruest-fremd';
const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
let chefin: Konto;
let verwaltung: Konto;
let monteur: Konto;
let kollege: Konto;
let fremdChef: Konto;

async function artikel(name: string, stock: number): Promise<string> {
  const { data, error } = await admin.from('materials')
    .insert({ company_id: BETRIEB, name, unit: 'Stk', stock, lagerartikel: true }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function bestand(id: string): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', id).single();
  return Number((data as { stock: number }).stock);
}

async function lage(id: string) {
  const { data, error } = await chefin.client.rpc('lager_frei', { p_ids: [id] });
  if (error) throw new Error(error.message);
  const z = (data as { zugesagt: number; geplant: number; frei: number }[])[0];
  return { zugesagt: Number(z.zugesagt), geplant: Number(z.geplant), frei: Number(z.frei) };
}

async function liste(baustelle: string, positionen: Record<string, unknown>[]) {
  const { data, error } = await chefin.client.rpc('ruestliste_speichern', {
    p_datum: heute, p_baustelle: baustelle, p_positionen: positionen, p_uids: [monteur.uid], p_von: 'Chefin',
  });
  if (error) throw new Error(error.message);
  return String(data);
}

async function anforderungenZu(kopf: string) {
  const { data } = await admin.from('material_orders')
    .select('id, quantity, ruest_position, user_id, status, project_number, note').eq('ruestliste_id', kopf);
  return (data ?? []) as { id: string; quantity: number; ruest_position: string; user_id: string; status: string; project_number: string; note: string }[];
}

const einladen = (baustelle: string, position: string) => monteur.client.rpc('laden_umschalten', {
  p_datum: heute, p_baustelle: baustelle, p_position: position, p_an: true, p_von: 'Max',
});

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'r6p4gfr');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'r6p4vwr');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'r6p4mor');
  kollege = await konto(BETRIEB, 'Mitarbeiter', 'r6p4kor');
  fremdChef = await konto(FREMD, 'Geschäftsführung', 'r6p4fgr');
}, 60_000);

describe('Rüstliste mit Fehlmenge (M5)', () => {
  let fitting = '';
  let kopf = '';

  it('legt die Anforderung beim Speichern an, mit der Position verknüpft', async () => {
    fitting = await artikel('Pressfitting 15', 4);
    kopf = await liste('PR-M5', [{
      id: 'p-fit', position: 0, material_id: fitting, name: 'Pressfitting 15', menge: 6, einheit: 'Stk',
      anfordern: { menge: 2, user_id: monteur.uid, user_name: 'Max', note: 'Für den Einsatz · angelegt von Chefin' },
    }]);
    const a = await anforderungenZu(kopf);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ ruest_position: 'p-fit', user_id: monteur.uid, status: 'Offen', project_number: 'PR-M5' });
    expect(Number(a[0].quantity)).toBe(2);
  });

  it('die Liste reserviert nur den Rest aus dem Regal — 4, nicht 6', async () => {
    expect(await lage(fitting)).toEqual({ zugesagt: 0, geplant: 4, frei: 0 });
  });

  it('„Aus Lager“ geht nur, was neben der Reservierung frei ist', async () => {
    const [a] = await anforderungenZu(kopf);
    const zuFrueh = await verwaltung.client.from('material_orders')
      .update({ beschaffung: 'lager', status: 'Abholbereit' }).eq('id', a.id);
    expect(zuFrueh.error?.message).toMatch(/nur 0 Stk frei/);

    // Zwei kommen herein — jetzt ist genau die Fehlmenge frei.
    const eingang = await verwaltung.client.rpc('lager_eingang', {
      p_material: fitting, p_menge: 2, p_lieferant: 'Frauenthal', p_lieferschein: null, p_bezug: null,
    });
    expect(eingang.error).toBeNull();
    const jetzt = await verwaltung.client.from('material_orders')
      .update({ beschaffung: 'lager', status: 'Abholbereit' }).eq('id', a.id);
    expect(jetzt.error).toBeNull();
    expect(await lage(fitting)).toEqual({ zugesagt: 2, geplant: 4, frei: 0 });
  });

  it('einladen bucht nur den Rest, abholen die Fehlmenge — 6 ausgegeben, nicht 8', async () => {
    const r = await einladen('PR-M5', 'p-fit');
    expect(r.error).toBeNull();
    expect(Number(r.data)).toBe(4);
    expect(await bestand(fitting)).toBe(2);

    const [a] = await anforderungenZu(kopf);
    expect((await verwaltung.client.rpc('anforderung_abschliessen', { p_order: a.id })).error).toBeNull();
    expect(await bestand(fitting)).toBe(0);

    const { data, error } = await chefin.client.rpc('ausgegebenes_material', { p_baustelle: 'PR-M5' });
    expect(error).toBeNull();
    const zeilen = (data as { art: string; menge: number }[]).map((z) => [z.art, Number(z.menge)]).sort();
    expect(zeilen).toEqual([['anforderung', 2], ['ruestliste', 4]]);
  });

  it('der Monteur sieht den Teil der Anforderung — auch wenn sie nicht auf ihm steht', async () => {
    const { data, error } = await kollege.client.rpc('ruest_angefordert', { p_listen: [kopf] });
    expect(error).toBeNull();
    expect(data).toEqual([{ einsatz_material_id: kopf, position_id: 'p-fit', menge: 2 }]);
    // Ein fremder Betrieb bekommt nichts.
    const fremd = await fremdChef.client.rpc('ruest_angefordert', { p_listen: [kopf] });
    expect(fremd.data).toEqual([]);
  });
});

describe('Was gleich bleibt (M5, Gegenproben)', () => {
  it('ohne Anforderung reserviert und bucht die Liste ihre ganze Menge — wie bisher', async () => {
    const ventil = await artikel('Eckventil', 10);
    await liste('PR-M5b', [{ id: 'p-v', position: 0, material_id: ventil, name: 'Eckventil', menge: 6, einheit: 'Stk' }]);
    expect(await lage(ventil)).toEqual({ zugesagt: 0, geplant: 6, frei: 4 });
    const r = await einladen('PR-M5b', 'p-v');
    expect(Number(r.data)).toBe(6);
    expect(await bestand(ventil)).toBe(4);
  });

  it('wird die Anforderung gelöscht, reserviert die Position wieder ganz', async () => {
    const hahn = await artikel('Kugelhahn', 1);
    const k = await liste('PR-M5c', [{
      id: 'p-h', position: 0, material_id: hahn, name: 'Kugelhahn', menge: 4, einheit: 'Stk',
      anfordern: { menge: 3, user_id: monteur.uid, user_name: 'Max', note: '' },
    }]);
    expect((await lage(hahn)).geplant).toBe(1);
    const [a] = await anforderungenZu(k);
    expect((await verwaltung.client.from('material_orders').delete().eq('id', a.id)).error).toBeNull();
    expect((await lage(hahn)).geplant).toBe(4);
  });

  it('ein zweites Speichern ohne Vormerkung legt keine zweite Anforderung an', async () => {
    const muffe = await artikel('Muffe', 0);
    const pos = { id: 'p-m', position: 0, material_id: muffe, name: 'Muffe', menge: 2, einheit: 'Stk' };
    const k = await liste('PR-M5d', [{ ...pos, anfordern: { menge: 2, user_id: monteur.uid, user_name: 'Max', note: '' } }]);
    await liste('PR-M5d', [pos]);
    expect(await anforderungenZu(k)).toHaveLength(1);
  });

  it('eine Anforderung zeigt nicht auf die Rüstliste eines fremden Betriebs', async () => {
    const { data: fk, error: fe } = await admin.from('einsatz_material')
      .insert({ company_id: FREMD, date: heute, project_number: 'PR-X', uids: [], geladen: {} }).select('id').single();
    expect(fe).toBeNull();
    const { error } = await chefin.client.from('material_orders').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, material_name: 'Muffe', quantity: 1, status: 'Offen',
      transaction_type: 'order', user_id: chefin.uid, user_name: 'Chefin',
      ruestliste_id: (fk as { id: string }).id, ruest_position: 'x',
    });
    expect(error?.message).toMatch(/Rüstliste gibt es in diesem Betrieb nicht/);
  });
});
