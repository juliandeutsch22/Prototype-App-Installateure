/**
 * Ein Datumsformat für die ganze App (Prüflauf 24.09.2026, D1).
 */
import { describe, it, expect } from 'vitest';
import { datumAT, datumAusMs } from '@/lib/datum';

describe('datumAT', () => {
  it('schreibt ein ISO-Datum als TT.MM.JJJJ, mit führender Null', () => {
    expect(datumAT('2026-09-24')).toBe('24.09.2026');
    expect(datumAT('2027-01-05')).toBe('05.01.2027');
  });

  it('nimmt den Kalendertag aus einem Zeitstempel, ohne ihn zu verschieben', () => {
    expect(datumAT('2026-09-24T23:30:00+00:00')).toBe('24.09.2026');
  });

  it('zeigt nichts für nichts, und Fremdes unverändert', () => {
    expect(datumAT('')).toBe('');
    expect(datumAT(null)).toBe('');
    expect(datumAT(undefined)).toBe('');
    expect(datumAT('demnächst')).toBe('demnächst');
  });
});

describe('datumAusMs', () => {
  it('füllt Tag und Monat auf', () => {
    expect(datumAusMs(new Date(2027, 8, 4, 12).getTime())).toBe('04.09.2027');
    expect(datumAusMs(null)).toBe('');
  });
});
