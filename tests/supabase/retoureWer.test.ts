/**
 * RETOURE: WER ZURÜCKGEBRACHT HAT UND WER ERFASST HAT (A4 der Durchsicht vom
 * 24.10.2026).
 *
 * Erfasste das Lager, was ein Monteur hereinbrachte, stand die Retoure auf
 * dem Namen des Lagers. Jetzt gehört sie der Person, die zurückgebracht hat;
 * wer erfasst hat, hält die Datenbank daneben fest. Geprüft gegen die echte
 * Datenbank:
 *
 *   - das Lager erfasst für den Monteur: die Retoure lautet auf ihn, mit
 *     seinem Namen aus der Belegschaft, „erfasst von“ ist das Lager; die
 *     Gutschrift kommt wie bisher, der Monteur sieht sie selbst;
 *   - auch eine gewöhnliche Anforderung trägt, wer sie angelegt hat;
 *     ändern lässt sich das nicht, der Rücklauf behält es;
 *   - die Datenauskunft des Lagers zählt die für andere erfassten.
 *
 * Gegenproben: die Buchhaltung und der Monteur erfassen nicht für andere,
 * und niemand für eine Person eines anderen Betriebs. Gleich bleibt: die
 * eigene Retoure geht wie bisher (`lagerRechte.test.ts` prüft weiter, dass
 * der Monteur nicht auf das Lager bucht).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'retoure-wer';
const FREMD = 'retoure-wer-b';

let lager: Konto;
let monteur: Konto;
let buch: Konto;
let chefin: Konto;
let fremd: Konto;
let artikel: string;

async function bestand(): Promise<number> {
  const { data } = await admin.from('materials').select('stock').eq('id', artikel).single();
  return Number(data!.stock);
}

function retoure(wer: Konto, fuer: string, menge = 2) {
  return wer.client.rpc('retoure_anlegen', {
    p_beleg: {
      id: crypto.randomUUID(), company_id: BETRIEB, material_id: artikel,
      material_name: 'Kugelhahn 1/2', quantity: menge, condition: 'neu',
      user_id: fuer, user_name: 'vom Gerät', project_number: '',
    },
  });
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Retoure wer');
  await betriebAnlegen(FREMD, 'Retoure fremd');
  lager = await konto(BETRIEB, 'Verwaltung', 'rwlager');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'rwmon');
  buch = await konto(BETRIEB, 'Buchhaltung', 'rwbuch');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'rwgf');
  fremd = await konto(FREMD, 'Mitarbeiter', 'rwfremd');
  for (const [k, name] of [[lager, 'Lena Lager'], [monteur, 'Max Monteur']] as const) {
    const { error } = await admin.from('users').update({ name }).eq('id', k.uid);
    expect(error).toBeNull();
  }
  const m = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Kugelhahn 1/2', stock: 10, unit: 'Stk' })
    .select('id').single();
  artikel = m.data!.id;
}, 120_000);

describe('Das Lager erfasst eine Retoure für den Monteur', () => {
  it('sie lautet auf ihn, „erfasst von“ ist das Lager, gutgeschrieben wird wie bisher', async () => {
    const vorher = await bestand();
    const { data: id, error } = await retoure(lager, monteur.uid, 3);
    expect(error).toBeNull();
    const { data } = await admin.from('material_orders')
      .select('user_id, user_name, erfasst_von, erfasst_von_name, transaction_type').eq('id', id).single();
    expect(data).toEqual({
      user_id: monteur.uid, user_name: 'Max Monteur',
      erfasst_von: lager.uid, erfasst_von_name: 'Lena Lager', transaction_type: 'return',
    });
    expect(await bestand()).toBe(vorher + 3);

    // Der Monteur sieht seine Rückgabe selbst.
    const eigene = await monteur.client.from('material_orders').select('id').eq('id', id);
    expect(eigene.data).toHaveLength(1);
  });

  it('die Lagerbewegung nennt den, der zurückgebracht hat', async () => {
    const { data: id } = await retoure(lager, monteur.uid, 1);
    const { data } = await admin.from('lagerbewegungen')
      .select('bezug, erfasst_von').eq('material_order_id', id).single();
    expect(data!.bezug).toBe('Retoure · Max Monteur');
    expect(data!.erfasst_von).toBe(lager.uid);
  });

  it('auch die Geschäftsführung darf es', async () => {
    const { error } = await retoure(chefin, monteur.uid);
    expect(error).toBeNull();
  });

  it('Gegenprobe: Buchhaltung und Monteur erfassen nicht für andere', async () => {
    const vorher = await bestand();
    expect((await retoure(buch, monteur.uid)).error?.code).toBe('42501');
    expect((await retoure(monteur, lager.uid)).error?.code).toBe('42501');
    expect(await bestand()).toBe(vorher);
  });

  it('Gegenprobe: niemand für eine Person eines anderen Betriebs', async () => {
    const vorher = await bestand();
    expect((await retoure(lager, fremd.uid)).error?.code).toBe('42501');
    expect(await bestand()).toBe(vorher);
  });

  it('gleich bleibt: die eigene Retoure, mit „erfasst von“ derselben Person', async () => {
    const { data: id, error } = await retoure(monteur, monteur.uid);
    expect(error).toBeNull();
    const { data } = await admin.from('material_orders')
      .select('user_id, erfasst_von').eq('id', id).single();
    expect(data).toEqual({ user_id: monteur.uid, erfasst_von: monteur.uid });
  });
});

describe('„Erfasst von“ an jeder Anforderung', () => {
  it('setzt die Datenbank aus der Anmeldung, nicht aus der App', async () => {
    const id = crypto.randomUUID();
    const { error } = await monteur.client.from('material_orders').insert({
      id, company_id: BETRIEB, material_id: artikel, material_name: 'Kugelhahn 1/2',
      quantity: 1, status: 'Offen', transaction_type: 'order', user_id: monteur.uid,
      erfasst_von: lager.uid, erfasst_von_name: 'Erfunden',
    });
    expect(error).toBeNull();
    const { data } = await admin.from('material_orders')
      .select('erfasst_von, erfasst_von_name').eq('id', id).single();
    expect(data).toEqual({ erfasst_von: monteur.uid, erfasst_von_name: 'Max Monteur' });

    // Ändern lässt es sich danach nicht — auch nicht vom Lager.
    const { error: geaendert } = await lager.client.from('material_orders')
      .update({ erfasst_von: lager.uid }).eq('id', id);
    expect(geaendert?.code).toBe('42501');
  });

  it('der Rücklauf einer Sicherung behält, was er mitbringt', async () => {
    const { data, error } = await admin.from('material_orders').insert({
      id: crypto.randomUUID(), company_id: BETRIEB, material_name: 'Altbestand', quantity: 1, status: 'Erledigt',
      transaction_type: 'order', user_id: monteur.uid, erfasst_von: chefin.uid, erfasst_von_name: 'Clara Chefin',
    }).select('erfasst_von, erfasst_von_name').single();
    expect(error).toBeNull();
    expect(data).toEqual({ erfasst_von: chefin.uid, erfasst_von_name: 'Clara Chefin' });
  });
});

describe('Die Datenauskunft', () => {
  it('zählt beim Lager, was es für andere erfasst hat — der Inhalt steht beim Monteur', async () => {
    const lagerAuskunft = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: lager.uid });
    expect(lagerAuskunft.error).toBeNull();
    const a = lagerAuskunft.data as { als_bearbeiter: Record<string, number>; daten: Record<string, unknown[]> };
    expect(a.als_bearbeiter.anforderungen_fuer_andere_erfasst).toBe(2);
    expect(a.daten.materialanforderungen).toEqual([]);

    const monteurAuskunft = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: monteur.uid });
    const m = monteurAuskunft.data as { daten: { materialanforderungen: { transaction_type: string }[] } };
    expect(m.daten.materialanforderungen.filter((o) => o.transaction_type === 'return').length).toBe(4);
  });
});
