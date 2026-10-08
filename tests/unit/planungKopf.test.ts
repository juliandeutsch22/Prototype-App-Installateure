import { describe, it, expect } from 'vitest';
import { kalenderwoche, monatsTage, monatsTitel, wochenTitel } from '@/features/assignments/planungKopf';

/*
  Der Kopf der Planung (Linie „Lot“, E2): groß „Diese Woche“ usw., klein
  die Kalenderwoche. Im Betrieb wird in Kalenderwochen gesprochen — eine
  falsche KW schickt den Monteur in die falsche Woche.
*/
describe('Kalenderwoche nach ISO 8601', () => {
  it('rechnet die Wochen des Jahres richtig', () => {
    expect(kalenderwoche('2026-10-12')).toBe(42);
    expect(kalenderwoche('2026-10-18')).toBe(42); // Sonntag gehört ans Ende der Woche
    expect(kalenderwoche('2026-09-02')).toBe(36);
  });

  it('am Jahreswechsel zählt der Donnerstag (Gegenprobe zur einfachen Zählung ab 1. Jänner)', () => {
    // Do, 01.01.2026 → KW 1, und der Montag davor (29.12.2025) gehört schon dazu.
    expect(kalenderwoche('2025-12-29')).toBe(1);
    // 2027 beginnt am Freitag: der 01.01.2027 liegt noch in KW 53 von 2026.
    expect(kalenderwoche('2027-01-01')).toBe(53);
    expect(kalenderwoche('2027-01-04')).toBe(1);
  });
});

describe('Wochentitel', () => {
  const HEUTE = '2026-09-02'; // Mittwoch, KW 36

  it('nennt die nahen Wochen beim Namen, mit KW und Zeitraum darunter', () => {
    expect(wochenTitel('2026-08-31', HEUTE)).toEqual({ titel: 'Diese Woche', klein: 'KW 36 · 31.08. – 06.09.' });
    expect(wochenTitel('2026-09-07', HEUTE).titel).toBe('Nächste Woche');
    expect(wochenTitel('2026-08-24', HEUTE).titel).toBe('Letzte Woche');
  });

  it('sonst den Zeitraum — ohne Jahr im laufenden Jahr', () => {
    expect(wochenTitel('2026-10-12', HEUTE)).toEqual({ titel: '12. Oktober – 18. Oktober', klein: 'KW 42' });
  });

  it('mit Jahr, wenn die Woche nicht im laufenden Jahr liegt', () => {
    expect(wochenTitel('2027-03-01', HEUTE).titel).toBe('1. März – 7. März 2027');
    expect(wochenTitel('2026-12-28', HEUTE).titel).toBe('28. Dezember 2026 – 3. Jänner 2027');
  });
});

describe('Monat', () => {
  it('nennt den Monat, klein das Jahr', () => {
    expect(monatsTitel(2026, 9)).toEqual({ titel: 'Oktober', klein: '2026' });
    expect(monatsTitel(2027, 0).titel).toBe('Jänner');
  });

  it('kennt die Länge des Monats, auch im Schaltjahr', () => {
    expect(monatsTage(2026, 1)).toHaveLength(28);
    expect(monatsTage(2028, 1)).toHaveLength(29);
    expect(monatsTage(2026, 9)[0]).toBe('2026-10-01');
    expect(monatsTage(2026, 9)[30]).toBe('2026-10-31');
  });
});
