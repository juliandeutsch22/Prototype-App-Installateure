/**
 * Urlaub im Eintrittsjahr (18.10.2026): taggenau oder je begonnenem Monat ein
 * Zwölftel (§ 2 Abs 4 Z 1 UrlG) — eine Wahl je Betrieb. Ab Werk wie bisher
 * taggenau; die Geschäftsführung stellt um, ein Monteur nicht; nur die zwei
 * Werte lässt die Datenbank zu.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'urlaub-eintritt';
let chefin: Konto;
let monteur: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'uegf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'uemon');
}, 60_000);

const wahl = async () =>
  (await admin.from('companies').select('urlaub_eintritt_aliquot').eq('id', BETRIEB).single()).data?.urlaub_eintritt_aliquot;

describe('Anspruch im Eintrittsjahr', () => {
  it('ab Werk taggenau; die Geschäftsführung stellt auf Zwölftel', async () => {
    expect(await wahl()).toBe('taggenau');
    const { error } = await chefin.client.from('companies').update({ urlaub_eintritt_aliquot: 'zwoelftel' }).eq('id', BETRIEB);
    expect(error).toBeNull();
    expect(await wahl()).toBe('zwoelftel');
  });

  it('Gegenprobe: ein Monteur nicht', async () => {
    const { count } = await monteur.client.from('companies')
      .update({ urlaub_eintritt_aliquot: 'taggenau' }, { count: 'exact' })
      .eq('id', BETRIEB);
    expect(count ?? 0).toBe(0);
    expect(await wahl()).toBe('zwoelftel');
  });

  it('Gegenprobe: ein dritter Wert wird abgewiesen', async () => {
    const { error } = await admin.from('companies').update({ urlaub_eintritt_aliquot: 'monatsgenau' }).eq('id', BETRIEB);
    expect(error?.message).toMatch(/companies_urlaub_eintritt_aliquot/);
  });
});
