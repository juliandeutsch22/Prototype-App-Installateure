/**
 * Mehrarbeit in Teilzeit (19.10.2026): die Vollzeit des Betriebs. Ab Werk
 * 38,5 Std. (KV Metallgewerbe); die Geschäftsführung stellt um, ein Monteur
 * nicht; mehr als 40 Std. (§ 3 AZG) und null lässt die Datenbank nicht zu.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'vollzeit-woche';
let chefin: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'vzgf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'vzmon');
}, 60_000);

const vollzeit = async () =>
  Number((await admin.from('companies').select('vollzeit_wochenstunden').eq('id', BETRIEB).single()).data?.vollzeit_wochenstunden);

describe('Vollzeit je Woche', () => {
  it('ab Werk 38,5; die Geschäftsführung stellt auf 40', async () => {
    expect(await vollzeit()).toBe(38.5);
    const { error } = await chefin.client.from('companies').update({ vollzeit_wochenstunden: 40 }).eq('id', BETRIEB);
    expect(error).toBeNull();
    expect(await vollzeit()).toBe(40);
  });

  it('Gegenprobe: ein Monteur nicht', async () => {
    const { count } = await monteur.client.from('companies')
      .update({ vollzeit_wochenstunden: 20 }, { count: 'exact' })
      .eq('id', BETRIEB);
    expect(count ?? 0).toBe(0);
    expect(await vollzeit()).toBe(40);
  });

  it('Gegenprobe: über 40 und null weist die Datenbank ab', async () => {
    for (const wert of [40.5, 0]) {
      const { error } = await admin.from('companies').update({ vollzeit_wochenstunden: wert }).eq('id', BETRIEB);
      expect(error?.message).toMatch(/companies_vollzeit_wochenstunden/);
    }
    expect(await vollzeit()).toBe(40);
  });
});
