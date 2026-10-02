import { describe, it, expect } from 'vitest';
import { SCHREIBWEISE } from '../links/schreibweise';

/** Testbericht 30.09.2026, G1 — die Muster der Seitenprüfung, mit Gegenprobe. */
const fund = (text: string) => SCHREIBWEISE.filter(([, m]) => m.test(text)).map(([r]) => r);

describe('Schreibweise im Sichtbaren (G1)', () => {
  it('findet, was der Testbericht sah', () => {
    expect(fund('Di., 29.09.. nicht gebucht')).toEqual(['doppelter Punkt nach einem Datum']);
    expect(fund('gebucht am 2026-09-30')).toEqual(['ISO-Datum statt TT.MM.JJJJ']);
    expect(fund('Saldo 8.33 h')).toEqual(['Dezimalpunkt statt Komma']);
    expect(fund('12.5 m Kupferrohr')).toEqual(['Dezimalpunkt statt Komma']);
  });

  it('lässt stehen, was richtig ist', () => {
    for (const richtig of [
      'Di., 29.09.2026', 'bis 30.09.2026.', 'Saldo 8,33 h', '€ 1.416,00', '1.000 Stk',
      'PR-2026-0189', 'Stunden_Max_2026-09-01_2026-09-30.pdf', 'RE-2026-0231',
    ]) {
      expect({ richtig, funde: fund(richtig) }).toEqual({ richtig, funde: [] });
    }
  });
});
