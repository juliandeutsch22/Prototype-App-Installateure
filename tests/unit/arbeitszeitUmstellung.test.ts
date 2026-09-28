import { describe, it, expect } from 'vitest';
import { calcWorkMin } from '@shared/arbeitszeit';
import { UMSTELLUNG } from '../faelle/zeitumstellung';

/**
 * Die Nacht der Zeitumstellung zählt richtig (offene Punkte B6).
 *
 * Vorher waren 22:00–06:00 immer acht Stunden. Die Fälle und ihre Minuten
 * stehen in `tests/faelle/zeitumstellung.ts` — gerechnet von Postgres, damit
 * App und Datenbank dieselbe Zahl liefern.
 */
describe('Arbeitszeit über die Zeitumstellung', () => {
  it.each(UMSTELLUNG)('$was ($datum $von–$bis)', ({ datum, von, bis, minuten }) => {
    expect(calcWorkMin({ status: 'Anwesend', startTime: von, endTime: bis, breakDuration: 0, date: datum })).toBe(minuten);
  });

  it('ohne Tag rechnet sie wie bisher', () => {
    expect(calcWorkMin({ status: 'Anwesend', startTime: '22:00', endTime: '06:00', breakDuration: 0 })).toBe(480);
  });

  it('zieht die Pause danach ab', () => {
    expect(calcWorkMin({ status: 'Anwesend', startTime: '22:00', endTime: '06:00', breakDuration: 30, date: '2026-10-24' })).toBe(510);
  });
});
