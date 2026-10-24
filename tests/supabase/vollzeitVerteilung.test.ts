/**
 * DIE VOLLZEIT JE WOCHENTAG (A6 der Durchsicht vom 24.10.2026).
 *
 * Ab Werk keine Verteilung — dann gilt wie bisher ein Fünftel der Woche je
 * Tag. Die Geschäftsführung stellt eine ein; die Datenbank nimmt nur, was als
 * Woche aufgeht: Wochentage 0–6, je 0 bis 10 Std. (§ 4 AZG), Summe gleich
 * der Vollzeit je Woche.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'vollzeit-verteilung';
let chefin: Konto;
let monteur: Konto;

/** Vier lange Tage und ein kurzer Freitag: 4 × 8,5 + 4,5 = 38,5. */
const VIER_LANGE = { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 4.5 };

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'vvgf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'vvmon');
}, 60_000);

const verteilung = async () =>
  (await admin.from('companies').select('vollzeit_verteilung').eq('id', BETRIEB).single()).data?.vollzeit_verteilung;

describe('Vollzeit je Wochentag', () => {
  it('ab Werk leer; die Geschäftsführung stellt vier lange Tage ein', async () => {
    expect(await verteilung()).toBeNull();
    const { error } = await chefin.client.from('companies').update({ vollzeit_verteilung: VIER_LANGE }).eq('id', BETRIEB);
    expect(error).toBeNull();
    expect(await verteilung()).toEqual({ 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 4.5 });
  });

  it('Gegenprobe: ein Monteur nicht', async () => {
    const { count } = await monteur.client.from('companies')
      .update({ vollzeit_verteilung: null }, { count: 'exact' })
      .eq('id', BETRIEB);
    expect(count ?? 0).toBe(0);
    expect(await verteilung()).not.toBeNull();
  });

  it('Gegenprobe: was nicht als Woche aufgeht, weist die Datenbank ab', async () => {
    for (const falsch of [
      { 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 }, // 40 statt 38,5
      { 1: 11, 2: 9, 3: 9, 4: 9, 5: 0.5 }, // mehr als 10 an einem Tag
      { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 7: 4.5 }, // kein Wochentag
      { 1: -1, 2: 9.875, 3: 9.875, 4: 9.875, 5: 9.875 }, // negativ
      [8.5, 8.5], // keine Zuordnung zu Tagen
    ]) {
      const { error } = await chefin.client.from('companies').update({ vollzeit_verteilung: falsch }).eq('id', BETRIEB);
      expect(error?.message, JSON.stringify(falsch)).toMatch(/companies_vollzeit_verteilung/);
    }
    expect(await verteilung()).toEqual(VIER_LANGE);
  });

  it('wer die Vollzeit ändert, ändert die Verteilung mit — sonst weist die Datenbank ab', async () => {
    const allein = await chefin.client.from('companies').update({ vollzeit_wochenstunden: 40 }).eq('id', BETRIEB);
    expect(allein.error?.message).toMatch(/companies_vollzeit_verteilung/);
    const beides = await chefin.client.from('companies')
      .update({ vollzeit_wochenstunden: 40, vollzeit_verteilung: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 4 } }).eq('id', BETRIEB);
    expect(beides.error).toBeNull();
  });

  it('gleich bleibt: ohne Verteilung ändert die Geschäftsführung die Vollzeit wie bisher', async () => {
    const zurueck = await chefin.client.from('companies')
      .update({ vollzeit_verteilung: null, vollzeit_wochenstunden: 38.5 }).eq('id', BETRIEB);
    expect(zurueck.error).toBeNull();
    const { error } = await chefin.client.from('companies').update({ vollzeit_wochenstunden: 39 }).eq('id', BETRIEB);
    expect(error).toBeNull();
  });
});
