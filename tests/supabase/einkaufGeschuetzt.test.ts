/**
 * Einkaufspreise, Preislisten und Kostensätze sieht, wer sie braucht —
 * gegen die echte Datenbank (offene Punkte B1, Teil 1; Prüflauf P3-12).
 *
 * Geprüft werden beide Seiten: wer liest und wer nicht, und der Einlass —
 * was in die alten Spalten geschrieben wird (alte App, Datanorm, alte
 * Sicherung), landet in der geschützten Tabelle, und die Spalte bleibt leer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, einblickBeginnen, konto, plattformkonto, type Konto } from './helfer';

const BETRIEB = 'einkauf-b1';

let chef: Konto;
let verwaltung: Konto;
let leitung: Konto;
let monteur: Konto;
let artikel: string;

const einkauf = async (material: string) => {
  const { data } = await admin.from('material_einkaufspreise')
    .select('einkaufspreis').eq('material_id', material).maybeSingle();
  return (data as { einkaufspreis: number } | null)?.einkaufspreis ?? null;
};
const spalte = async (material: string) => {
  const { data } = await admin.from('materials').select('einkaufspreis').eq('id', material).single();
  return (data as { einkaufspreis: number | null }).einkaufspreis;
};

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Einkauf GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'ekchef');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'ekvw');
  leitung = await konto(BETRIEB, 'Projektleiter', 'ekpl');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'ekmon');

  // Wie eine alte Sicherung oder die Datanorm-Übernahme: über die Spalte.
  const { data, error } = await admin.from('materials')
    .insert({ company_id: BETRIEB, name: 'Eckventil', stock: 3, einkaufspreis: 3.5 })
    .select('id').single();
  if (error) throw new Error(error.message);
  artikel = (data as { id: string }).id;

  const { data: lieferant } = await admin.from('suppliers')
    .insert({ company_id: BETRIEB, name: 'Grosshandel' }).select('id').single();
  await admin.from('material_prices').insert({
    company_id: BETRIEB, material_id: artikel, supplier_id: (lieferant as { id: string }).id,
    listenpreis: 10, rabatt_prozent: 35, einkaufspreis: 6.5,
  });

  await admin.from('companies').update({ cost_rates: { fach: 38.5, helper: 24 } }).eq('id', BETRIEB);
}, 180_000);

afterAll(async () => {
  await admin.from('support_zugriffe').delete().eq('company_id', BETRIEB);
  await admin.from('support_freigaben').delete().eq('company_id', BETRIEB);
});

describe('Der Einlass', () => {
  it('legt den Einkaufspreis um — die Spalte am Artikel bleibt leer', async () => {
    expect(await spalte(artikel)).toBeNull();
    expect(await einkauf(artikel)).toBe(3.5);
  });

  it('legt die Kostensätze um — die Spalte am Betrieb bleibt leer', async () => {
    const { data: firma } = await admin.from('companies').select('cost_rates').eq('id', BETRIEB).single();
    expect((firma as { cost_rates: unknown }).cost_rates).toBeNull();
    const { data } = await admin.from('betrieb_kostensaetze').select('fach, helper').eq('company_id', BETRIEB).single();
    expect(data).toEqual({ fach: 38.5, helper: 24 });
  });

  it('die Geschäftsführung ändert über die Spalte, wie die App es tut', async () => {
    const { error } = await chef.client.from('materials').update({ einkaufspreis: 4.2 }).eq('id', artikel);
    expect(error).toBeNull();
    expect(await spalte(artikel)).toBeNull();
    expect(await einkauf(artikel)).toBe(4.2);

    const { error: e2 } = await chef.client.from('companies')
      .update({ cost_rates: { fach: 40, helper: 25 } }).eq('id', BETRIEB);
    expect(e2).toBeNull();
    const { data } = await chef.client.from('betrieb_kostensaetze').select('fach, helper').single();
    expect(data).toEqual({ fach: 40, helper: 25 });
  });

  it('ein neuer Artikel mit Preis — der Preis steht, sobald der Artikel steht', async () => {
    const { data, error } = await chef.client.from('materials')
      .insert({ company_id: BETRIEB, name: 'Kugelhahn', stock: 1, einkaufspreis: 12 })
      .select('id').single();
    expect(error).toBeNull();
    expect(await einkauf((data as { id: string }).id)).toBe(12);
  });

  it('der Wächter prüft VOR dem Umlegen: die Verwaltung setzt keinen Einkaufspreis', async () => {
    const { error } = await verwaltung.client.from('materials').update({ einkaufspreis: 1 }).eq('id', artikel);
    expect(error?.code).toBe('42501');
    expect(await einkauf(artikel)).toBe(4.2);
  });

  it('ein Betrieb aus einer alten Sicherung bringt seine Kostensätze mit', async () => {
    // Der Rücklauf legt den Betrieb MIT `cost_rates` an — die Kostensätze
    // entstehen, bevor der Betrieb steht (Fremdschlüssel erst beim Abschluss).
    const alt = `${BETRIEB}-alt`;
    const { error } = await admin.from('companies')
      .insert({ id: alt, name: 'Aus der Sicherung', cost_rates: { fach: 30, helper: 20 } });
    expect(error).toBeNull();
    const { data } = await admin.from('betrieb_kostensaetze').select('fach, helper').eq('company_id', alt).single();
    expect(data).toEqual({ fach: 30, helper: 20 });
    await admin.from('companies').delete().eq('id', alt);
  });

  it('mit dem Artikel geht auch sein Preis', async () => {
    const { data } = await admin.from('materials')
      .insert({ company_id: BETRIEB, name: 'Weg damit', stock: 0, einkaufspreis: 1 })
      .select('id').single();
    const id = (data as { id: string }).id;
    expect(await einkauf(id)).toBe(1);
    await admin.from('materials').delete().eq('id', id);
    expect(await einkauf(id)).toBeNull();
  });
});

describe('Wer liest', () => {
  it('Einkaufspreis und Kostensätze: nur die Spitze', async () => {
    for (const k of [monteur, verwaltung, leitung]) {
      const { data: ek } = await k.client.from('material_einkaufspreise').select('einkaufspreis');
      expect(ek ?? []).toEqual([]);
      const { data: ks } = await k.client.from('betrieb_kostensaetze').select('fach');
      expect(ks ?? []).toEqual([]);
    }
    // Die Gegenprobe.
    const { data: ek } = await chef.client.from('material_einkaufspreise').select('einkaufspreis');
    expect((ek ?? []).length).toBeGreaterThan(0);
    const { data: ks } = await chef.client.from('betrieb_kostensaetze').select('fach');
    expect(ks).toHaveLength(1);
  });

  it('am Artikel und am Betrieb steht für niemanden mehr etwas', async () => {
    const { data: m } = await monteur.client.from('materials').select('einkaufspreis').eq('id', artikel).single();
    expect(m).toEqual({ einkaufspreis: null });
    const { data: c } = await monteur.client.from('companies').select('cost_rates').eq('id', BETRIEB).single();
    expect(c).toEqual({ cost_rates: null });
  });

  it('die Preislisten der Grosshändler: wer einkauft — nicht der Monteur', async () => {
    const { data: mon } = await monteur.client.from('material_prices').select('einkaufspreis');
    expect(mon ?? []).toEqual([]);
    for (const k of [verwaltung, leitung, chef]) {
      const { data } = await k.client.from('material_prices').select('einkaufspreis');
      expect(data).toEqual([{ einkaufspreis: 6.5 }]);
    }
  });

  it('der Support, der den Betrieb ansieht, liest mit — erst nach dem Beginn', async () => {
    const plattform = await plattformkonto('ekplatt');
    const { data: f } = await chef.client.from('support_freigaben').insert({
      company_id: BETRIEB, gewaehrt_von: chef.uid, grund: 'Nachkalkulation prüfen',
      gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
    }).select('id').single();
    const vorher = await plattform.client.from('betrieb_kostensaetze').select('fach');
    expect(vorher.data ?? []).toEqual([]);
    await einblickBeginnen(plattform, BETRIEB, (f as { id: string }).id);
    const { data } = await plattform.client.from('betrieb_kostensaetze').select('fach');
    expect(data).toEqual([{ fach: 40 }]);
  });
});
