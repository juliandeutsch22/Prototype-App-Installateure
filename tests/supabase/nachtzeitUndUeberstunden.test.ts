/**
 * Testbericht 30.09.2026, Paket 2c — Nachtzeit (M35) und Überstundenmodell
 * je Betrieb.
 *
 * Die Vorgaben sind das bisherige Verhalten (22–6 Uhr, Zeitkonto); die
 * Geschäftsführung stellt um, ein Monteur nicht. Die Form prüft die
 * Datenbank.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'nacht-2c';
let chefin: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'n2cgf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'n2cmon');
}, 60_000);

async function einstellungen() {
  const { data, error } = await admin.from('companies')
    .select('nacht_von, nacht_bis, ueberstunden_modell, ueberstunden_grenze, ueberstunden_hundert_sonn_feiertag')
    .eq('id', BETRIEB).single();
  if (error) throw new Error(error.message);
  return data;
}

describe('Vorgaben wie bisher', () => {
  it('22–6 Uhr und Zeitkonto', async () => {
    expect(await einstellungen()).toEqual({
      nacht_von: '22:00', nacht_bis: '06:00', ueberstunden_modell: 'zeitkonto',
      ueberstunden_grenze: 'tagessoll', ueberstunden_hundert_sonn_feiertag: false,
    });
  });
});

describe('Wer umstellt', () => {
  it('die Geschäftsführung stellt Nachtzeit und Tagesgrenze ein', async () => {
    const { error, count } = await chefin.client.from('companies')
      .update({
        nacht_von: '23:00', nacht_bis: '05:00', ueberstunden_modell: 'tagesgrenze',
        ueberstunden_grenze: 'zehn', ueberstunden_hundert_sonn_feiertag: true,
      }, { count: 'exact' })
      .eq('id', BETRIEB);
    expect(error).toBeNull();
    expect(count).toBe(1);
    expect((await einstellungen()).ueberstunden_modell).toBe('tagesgrenze');
  });

  it('ein Monteur nicht', async () => {
    const { count } = await monteur.client.from('companies')
      .update({ ueberstunden_modell: 'zeitkonto' }, { count: 'exact' })
      .eq('id', BETRIEB);
    expect(count ?? 0).toBe(0);
    expect((await einstellungen()).ueberstunden_modell).toBe('tagesgrenze');
  });
});

describe('Die Form', () => {
  it.each([
    ['eine Uhrzeit 25:00', { nacht_von: '25:00' }],
    ['kein Doppelpunkt', { nacht_bis: '0600' }],
    ['Beginn gleich Ende', { nacht_von: '06:00', nacht_bis: '06:00' }],
    ['ein unbekanntes Modell', { ueberstunden_modell: 'pauschale' }],
    ['eine unbekannte Grenze', { ueberstunden_grenze: 'neun' }],
  ])('%s: abgewiesen', async (_, zeile) => {
    const { error } = await admin.from('companies').update(zeile).eq('id', BETRIEB);
    expect(error?.message).toMatch(/companies_(nachtzeit|ueberstunden)_form/);
  });
});

describe('Durchrechnungszeitraum (10.10.2026)', () => {
  const wochen = async () =>
    (await admin.from('companies').select('durchrechnung_wochen').eq('id', BETRIEB).single()).data?.durchrechnung_wochen;

  it('ab Werk 17 Wochen; die Geschäftsführung stellt bis 52 ein', async () => {
    expect(await wochen()).toBe(17);
    const { error } = await chefin.client.from('companies').update({ durchrechnung_wochen: 52 }).eq('id', BETRIEB);
    expect(error).toBeNull();
    expect(await wochen()).toBe(52);
  });

  it('Gegenprobe: unter 17 oder über 52 weist die Datenbank ab', async () => {
    for (const w of [16, 53]) {
      const { error } = await chefin.client.from('companies').update({ durchrechnung_wochen: w }).eq('id', BETRIEB);
      expect(error?.code).toBe('23514');
    }
    expect(await wochen()).toBe(52);
  });
});
