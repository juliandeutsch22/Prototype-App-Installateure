/**
 * „ABGEHOLT“ IM STAND „OFFEN“ — was im Lager gebucht wird (Plan C7, Prüfung in Paket 2).
 *
 * Abgeholt geht bewusst schon bei „Offen“: kleine Betriebe haben niemanden,
 * der vorher bereitstellt (Entscheidung C7, 12.11.2026). Bevor dazu eine
 * Rückfrage kommt (Paket 8), war zu belegen, dass der Schritt heute richtig
 * bucht. Diese Datei hält das fest — und schlägt an, sobald sich daran etwas
 * ändert:
 *
 * - Katalogartikel, das Büro hat nichts entschieden (`beschaffung` leer):
 *   genau ein Abgang über die Menge aus dem Hauptlager, mit Bezug zur
 *   Anforderung — wie bei „Abholbereit“.
 * - Mehr abgeholt als gebucht im Regal liegt: der Bestand bleibt bei 0 und
 *   die Abholung scheitert nicht. Wer es in der Hand hat, hat es genommen;
 *   der Unterschied gehört in die Inventur, nicht in eine Fehlermeldung.
 * - Freitext ohne Katalogeintrag: abgeschlossen, keine Bewegung.
 * - Schon beim Großhändler bestellt, noch nicht geliefert: Eingang und Abgang
 *   zugleich, der Bestand bleibt gleich.
 * - Zweimal abgeholt (zwei Geräte): nur ein Abgang.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'abgeholt-offen-a';

let monteur: Konto;
let artikel: string;

async function bestandSetzen(stock: number): Promise<void> {
  // Mit dem Dienstschlüssel: der Bestand ändert sich sonst nur über Bewegungen.
  const { error } = await admin.from('materials').update({ stock }).eq('id', artikel);
  if (error) throw new Error(error.message);
}

const bestand = async () =>
  Number((await admin.from('materials').select('stock').eq('id', artikel).single()).data!.stock);

async function bewegungenZu(order: string) {
  const { data, error } = await admin.from('lagerbewegungen')
    .select('art, menge, bestand_nachher, material_id').eq('material_order_id', order).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((b) => ({ ...b, menge: Number(b.menge), bestand_nachher: Number(b.bestand_nachher) }));
}

async function anforderung(menge: number, rest: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: BETRIEB, material_id: artikel, material_name: 'Kugelhahn 1/2"',
    quantity: menge, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
    user_name: 'Max Monteur', project_number: 'PR-2026-0301', ...rest,
  });
  if (error) throw new Error(error.message);
  return id;
}

async function zeile(id: string) {
  const { data } = await admin.from('material_orders')
    .select('status, processed, material_id, geliefert_am').eq('id', id).single();
  return data!;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'abgoffmon');
  const m = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Kugelhahn 1/2"', stock: 10, unit: 'Stk' })
    .select('id').single();
  artikel = m.data!.id;
}, 120_000);

beforeEach(async () => {
  clientEinreichen(monteur.client);
  await bestandSetzen(10);
});

afterAll(() => clientEinreichen(null));

describe('Abgeholt im Stand „Offen“ (C7)', () => {
  it('bucht genau einen Abgang über die Menge aus dem Lager', async () => {
    const id = await anforderung(3);
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Offen' })).toEqual({ art: 'geaendert' });
    expect(await zeile(id)).toMatchObject({ status: 'Erledigt', processed: true, material_id: artikel });
    expect(await bestand()).toBe(7);
    expect(await bewegungenZu(id)).toEqual([
      { art: 'entnahme', menge: -3, bestand_nachher: 7, material_id: artikel },
    ]);
  });

  it('scheitert nicht, wenn mehr abgeholt wird als gebucht im Regal liegt — der Bestand bleibt bei 0', async () => {
    await bestandSetzen(1);
    const id = await anforderung(4);
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Offen' })).toEqual({ art: 'geaendert' });
    expect(await bestand()).toBe(0);
    const b = await bewegungenZu(id);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ art: 'entnahme', bestand_nachher: 0 });
  });

  it('Freitext ohne Katalogeintrag: abgeschlossen, keine Bewegung, Bestand unverändert', async () => {
    const id = await anforderung(2, { material_id: null, material_name: 'Sonderteil vom Händler xyz-77' });
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Offen' })).toEqual({ art: 'geaendert' });
    expect(await zeile(id)).toMatchObject({ status: 'Erledigt', processed: true, material_id: null });
    expect(await bewegungenZu(id)).toEqual([]);
    expect(await bestand()).toBe(10);
  });

  it('beim Großhändler bestellt, noch nicht geliefert: Eingang und Abgang, der Bestand bleibt gleich', async () => {
    const id = await anforderung(2, { beschaffung: 'einkauf', status: 'In Bearbeitung' });
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'In Bearbeitung' })).toEqual({ art: 'geaendert' });
    expect(await bestand()).toBe(10);
    expect((await bewegungenZu(id)).map((b) => [b.art, b.menge])).toEqual([['eingang', 2], ['entnahme', -2]]);
    expect((await zeile(id)).geliefert_am).not.toBeNull();
  });

  it('zweimal abgeholt (zweites Gerät, alter Stand): nur ein Abgang', async () => {
    const id = await anforderung(2);
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Offen' })).toEqual({ art: 'geaendert' });
    expect(await anforderungen.updateOrderStatus(id, 'Erledigt', { von: 'Offen' })).toEqual({ art: 'veraltet' });
    expect(await bestand()).toBe(8);
    expect(await bewegungenZu(id)).toHaveLength(1);
  });
});
