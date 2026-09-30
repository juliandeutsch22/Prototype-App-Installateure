/**
 * Testbericht 30.09.2026, H10 — die Buchhaltung pflegt die Rechnungsvorgaben
 * (Zahlungsziel, Skonto, Mahnspesen, Basiszinssatz), und nur diese.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'rechte-h10';
let monteur: Konto;
let buero: Konto;
let verwaltung: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'h10mont');
  buero = await konto(BETRIEB, 'Buchhaltung', 'h10buch');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'h10verw');
}, 60_000);

describe('H10 — Rechnungsvorgaben', () => {
  const rates = async () =>
    ((await admin.from('companies').select('rates').eq('id', BETRIEB).single()).data!.rates ?? {}) as Record<string, unknown>;

  beforeAll(async () => {
    await admin.from('companies').update({ rates: { fach: 70, helper: 50, vatRate: 0.2, dueDays: 14 } }).eq('id', BETRIEB);
  });

  it('die Buchhaltung setzt Zahlungsziel, Skonto, Mahnspesen und Basiszinssatz', async () => {
    const { error } = await buero.client.rpc('rechnungsvorgaben_speichern', {
      p_vorgaben: { dueDays: 21, skontoProzent: 2, skontoTage: 10, mahnspesen: [0, 10, 20],
        basiszinssatz: 1.53, basiszinssatzAb: '2026-07-01' },
    });
    expect(error).toBeNull();
    expect(await rates()).toMatchObject({ fach: 70, helper: 50, dueDays: 21, skontoProzent: 2, basiszinssatz: 1.53 });
  });

  it('kommt aber nicht an Stundensätze und Steuersatz', async () => {
    const fremd = await buero.client.rpc('rechnungsvorgaben_speichern', { p_vorgaben: { fach: 1 } });
    expect(fremd.error?.message).toMatch(/keine Rechnungsvorgabe/);
    const ganz = await buero.client.from('companies').update({ rates: { fach: 1 } }).eq('id', BETRIEB).select('id');
    expect(ganz.data ?? []).toEqual([]);
    expect((await rates()).fach).toBe(70);
  });

  it('null nimmt einen Wert heraus — „kein Skonto“', async () => {
    await buero.client.rpc('rechnungsvorgaben_speichern', { p_vorgaben: { skontoProzent: null, skontoTage: null } });
    const r = await rates();
    expect(r).not.toHaveProperty('skontoProzent');
    expect(r).not.toHaveProperty('skontoTage');
  });

  it('weist Unsinn ab', async () => {
    const falsch = [
      { skontoProzent: 150 }, { dueDays: 2.5 }, { mahnspesen: [-5] }, { basiszinssatzAb: '2026-03-01' },
    ];
    for (const p_vorgaben of falsch) {
      const { error } = await buero.client.rpc('rechnungsvorgaben_speichern', { p_vorgaben });
      expect(error, JSON.stringify(p_vorgaben)).not.toBeNull();
    }
  });

  it('Verwaltung und Monteur dürfen es nicht', async () => {
    for (const k of [verwaltung, monteur]) {
      const { error } = await k.client.rpc('rechnungsvorgaben_speichern', { p_vorgaben: { dueDays: 1 } });
      expect(error?.message).toMatch(/pflegen Buchhaltung/);
    }
  });
});
