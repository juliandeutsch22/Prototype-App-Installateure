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

  it('findet den Vorschlag beim Anlegen, wie ihn Runde 3 sah (G1)', () => {
    expect(fund('Vorschlag für 2026-10-06: 5.96 Tage — taggenau')).toEqual([
      'ISO-Datum statt TT.MM.JJJJ', 'Dezimalpunkt statt Komma',
    ]);
    expect(fund('noch 0.5 Tag offen')).toEqual(['Dezimalpunkt statt Komma']);
  });

  it('lässt den richtig geschriebenen Vorschlag stehen (G1)', () => {
    for (const richtig of [
      'Vorschlag für 06.10.2026: 5,96 Tage', 'seit 5 Tagen', '1 Tag', 'am 06.10. Tagesbericht',
    ]) {
      expect({ richtig, funde: fund(richtig) }).toEqual({ richtig, funde: [] });
    }
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
