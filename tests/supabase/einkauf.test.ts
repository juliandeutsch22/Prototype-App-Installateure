/**
 * Lager und Einkauf — gegen die echte Datenbank.
 *
 * WAS HIER AUF DEM SPIEL STEHT, ist der Bestand. Ware vom Grosshändler geht
 * beim Eintreffen ins Lager und beim Abschluss wieder hinaus; beides zusammen
 * muss null ergeben. Bucht einer der Schritte doppelt oder gar nicht, stimmt
 * das Regal nicht mehr — und das fällt erst bei der nächsten Inventur auf.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as einkauf from '@/lib/db/pg/einkauf';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'einkauf-a';
const FREMD = 'einkauf-b';

let lager: Konto;
let monteur: Konto;
let grosshaendler: string;
let fremderHaendler: string;
let artikel: string;

async function bestand(): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', artikel).single();
  return Number(data?.stock);
}

async function anforderung(menge: number): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: BETRIEB, material_id: artikel, material_name: 'Eckventil 1/2',
    quantity: menge, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
    project_number: 'B-2026-0001',
  });
  if (error) throw new Error(error.message);
  return id;
}

async function zeile(id: string) {
  const { data } = await admin.from('material_orders')
    .select('status, beschaffung, supplier_id, bestellt_am, geliefert_am, processed')
    .eq('id', id).single();
  return data!;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  lager = await konto(BETRIEB, 'Verwaltung', 'lager');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
  clientEinreichen(lager.client);

  grosshaendler = await einkauf.grosshaendlerSpeichern(BETRIEB, null, {
    name: 'Holter', customerNumber: '4711', bestellEmail: 'vertreter@holter.test', contactLine: '',
  });
  const f = await admin.from('suppliers').insert({ company_id: FREMD, name: 'Fremd' }).select('id').single();
  fremderHaendler = f.data!.id;
  const m = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Eckventil 1/2', stock: 10, unit: 'Stk', article_number: 'EV-12' })
    .select('id').single();
  artikel = m.data!.id;
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Der Grosshändler', () => {
  it('wird mit Bestelladresse gespeichert — leere Felder als NULL', async () => {
    const liste = await einkauf.listGrosshaendler(BETRIEB);
    const h = liste.find((x) => x.id === grosshaendler)!;
    expect(h).toMatchObject({ name: 'Holter', customerNumber: '4711', bestellEmail: 'vertreter@holter.test' });
    expect(h.contactLine ?? null).toBeNull();
  });
});

describe('Aus dem Lager', () => {
  it('wird gleich abholbereit — der Bestand bleibt bis zum Abschluss', async () => {
    const vorher = await bestand();
    const id = await anforderung(2);
    await einkauf.ausLager(id);
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit', beschaffung: 'lager' });
    expect(await bestand()).toBe(vorher);

    await anforderungen.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(vorher - 2);
  });
});

describe('Über die Einkaufsliste', () => {
  it('bestellt, geliefert, abgeschlossen: der Bestand endet, wo er begann', async () => {
    const vorher = await bestand();
    const id = await anforderung(3);

    await einkauf.aufEinkaufsliste(id, grosshaendler);
    expect(await zeile(id)).toMatchObject({
      status: 'In Bearbeitung', beschaffung: 'einkauf', supplier_id: grosshaendler, bestellt_am: null,
    });

    await einkauf.alsBestelltMarkieren([id]);
    expect((await zeile(id)).bestellt_am).not.toBeNull();

    expect(await einkauf.geliefert([id])).toBe(1);
    expect(await zeile(id)).toMatchObject({ status: 'Abholbereit' });
    expect(await bestand()).toBe(vorher + 3);

    // Zweimal gedrückt bucht nicht zweimal ein.
    expect(await einkauf.geliefert([id])).toBe(0);
    expect(await bestand()).toBe(vorher + 3);

    await anforderungen.updateOrderStatus(id, 'Erledigt');
    expect(await bestand()).toBe(vorher);
  });

  it('abgeschlossen OHNE „geliefert" zieht nicht ab, was nie im Regal lag', async () => {
    const vorher = await bestand();
    const id = await anforderung(4);
    await einkauf.aufEinkaufsliste(id, grosshaendler);
    await anforderungen.updateOrderStatus(id, 'Erledigt');

    expect(await bestand()).toBe(vorher);
    const z = await zeile(id);
    expect(z.geliefert_am).not.toBeNull();
    expect(z.processed).toBe(true);
  });

  it('lässt sich zurücknehmen, solange nicht bestellt — danach nicht mehr', async () => {
    const a = await anforderung(1);
    await einkauf.aufEinkaufsliste(a, grosshaendler);
    await einkauf.vonEinkaufslisteNehmen(a);
    expect(await zeile(a)).toMatchObject({ status: 'Offen', beschaffung: null, supplier_id: null });

    const b = await anforderung(1);
    await einkauf.aufEinkaufsliste(b, grosshaendler);
    await einkauf.alsBestelltMarkieren([b]);
    await einkauf.vonEinkaufslisteNehmen(b);
    expect(await zeile(b)).toMatchObject({ beschaffung: 'einkauf', status: 'In Bearbeitung' });
  });

  it('„bestellt" überschreibt kein früheres Bestelldatum', async () => {
    const id = await anforderung(1);
    await einkauf.aufEinkaufsliste(id, grosshaendler);
    await einkauf.alsBestelltMarkieren([id]);
    const erst = (await zeile(id)).bestellt_am;
    await new Promise((r) => setTimeout(r, 20));
    await einkauf.alsBestelltMarkieren([id]);
    expect((await zeile(id)).bestellt_am).toBe(erst);
  });

  it('lässt den Monteur seine eigene Ware nicht als geliefert buchen', async () => {
    // Seine eigene Anforderung darf er ändern (für „Abgeholt") — den
    // Wareneingang und damit den Bestand darf er deshalb noch lange nicht.
    const vorher = await bestand();
    const id = await anforderung(5);
    await einkauf.aufEinkaufsliste(id, grosshaendler);
    const { error } = await monteur.client.rpc('einkauf_geliefert', { p_ids: [id] });
    expect(error?.message).toMatch(/Verwaltung oder die Leitung/);
    expect(await bestand()).toBe(vorher);
    expect((await zeile(id)).geliefert_am).toBeNull();
  });

  it('nimmt keinen Grosshändler eines anderen Betriebs an', async () => {
    const id = await anforderung(1);
    await expect(einkauf.aufEinkaufsliste(id, fremderHaendler)).rejects.toThrow(/Grosshändler/);
  });
});
