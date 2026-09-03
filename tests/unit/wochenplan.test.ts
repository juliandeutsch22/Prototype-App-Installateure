import { describe, it, expect } from 'vitest';
import { montagDer, wocheAb, wocheVerschoben } from '@/features/assignments/wochenplan';

/**
 * Die Wochenrechnung des Wochenplans.
 *
 * ZWEI FEHLER LAUERN HIER, und beide sehen im Betrieb wie „die Woche ist
 * falsch" aus, ohne dass jemand sagen koennte, warum:
 *
 *   1. `getDay()` zaehlt ab SONNTAG (0). Wer den Montag als `1 - getDay()`
 *      rechnet, verschiebt jede Sonntagswoche um sieben Tage nach vorn.
 *   2. `toISOString` rechnet in UTC und liefert in Mitteleuropa vor 02:00 Uhr
 *      (Sommerzeit) noch den Vortag.
 */

describe('Der Montag einer Woche', () => {
  it('findet ihn von einem Mittwoch aus', () => {
    // Mi, 02.09.2026 -> Mo, 31.08.2026 (ueber den Monatswechsel)
    expect(montagDer('2026-09-02')).toBe('2026-08-31');
  });

  it('gibt am Montag den Montag selbst', () => {
    expect(montagDer('2026-08-31')).toBe('2026-08-31');
  });

  it('rechnet am SONNTAG zurueck, nicht vor', () => {
    // So, 06.09.2026 gehoert ans ENDE der Woche vom 31.08.
    expect(montagDer('2026-09-06')).toBe('2026-08-31');
  });

  it('haelt ueber den Jahreswechsel', () => {
    // Fr, 01.01.2027 -> Mo, 28.12.2026
    expect(montagDer('2027-01-01')).toBe('2026-12-28');
  });
});

describe('Die sieben Tage', () => {
  it('laufen von Montag bis Sonntag', () => {
    expect(wocheAb('2026-08-31')).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ]);
  });

  it('uebersteht die Umstellung auf Winterzeit', () => {
    // In der Nacht auf Sonntag, 25.10.2026, wird die Uhr zurueckgestellt.
    // Eine Rechnung ueber Millisekunden landet dabei auf dem Vortag.
    const w = wocheAb('2026-10-19');
    expect(w[6]).toBe('2026-10-25');
    expect(w).toHaveLength(7);
  });
});

describe('Eine Woche weiter', () => {
  it('geht vor und zurueck', () => {
    expect(wocheVerschoben('2026-08-31', 1)).toBe('2026-09-07');
    expect(wocheVerschoben('2026-08-31', -1)).toBe('2026-08-24');
  });

  it('uebersteht den Jahreswechsel', () => {
    expect(wocheVerschoben('2026-12-28', 1)).toBe('2027-01-04');
  });
});
