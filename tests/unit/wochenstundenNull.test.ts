import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { calcMonthStats, calcOverallSaldo, offeneWerktage, tagessollStunden, wochenstundenVon } from '@/lib/time';
import { pflegeWocheMin } from '@shared/freistellung';
import type { AppUser, TimeEntry } from '@/types';

/**
 * WOCHENSTUNDEN 0 HEISSEN KEIN SOLL (Durchsicht 15.11.2026, Z11).
 *
 * Nachgestellt: das Benutzerformular verspricht, eine eingetippte 0 bleibe 0
 * („geringfügig, ruhendes Dienstverhältnis, die Chefin selbst“) — die
 * Rechnung machte mit `|| 40` daraus vierzig: rund 170 Minusstunden im Monat
 * und jeder Arbeitstag eine Lücke.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 0));
});
afterAll(() => vi.useRealTimers());

const gering = {
  id: 'g', uid: 'g', companyId: 'perl', name: 'Gerti', email: 'g@perl.at', role: 'Mitarbeiter', active: true,
  weeklyTargetHours: 0, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-06-01', initialOvertime: 0,
} as AppUser;

const einsatz = { id: 'e1', companyId: 'perl', userId: 'g', date: '2026-06-10', status: 'Anwesend', startTime: '08:00', endTime: '12:00', breakDuration: 0 } as TimeEntry;
const krank = { id: 'k1', companyId: 'perl', userId: 'g', date: '2026-06-11', status: 'Krank', breakDuration: 0 } as TimeEntry;

describe('0 Wochenstunden', () => {
  it('kein Soll: der Saldo ist die gearbeitete Zeit, und kein Tag fehlt', () => {
    const s = calcOverallSaldo(gering, [einsatz, krank], true);
    expect(s.saldoH).toBe(4);
    expect(s.daysWithoutEntry).toBe(0);
    expect(tagessollStunden(gering, '2026-06-10')).toBe(0);
  });

  it('die Monatsauswertung: Soll 0, keine Lücke', () => {
    const m = calcMonthStats(gering, [einsatz, krank], [], 2026, 5, true);
    expect(m.sollMin).toBe(0);
    expect(m.weeklyTarget).toBe(0);
    expect(m.workdaysInMonth).toBe(0);
    expect(offeneWerktage(gering, [einsatz], new Date('2026-06-01T00:00:00'), new Date('2026-06-30T00:00:00'))).toEqual([]);
  });

  it('die Pflegefreistellung folgt derselben Zahl', () => {
    expect(pflegeWocheMin(0)).toBe(0);
  });

  it('bleibt gleich: leer heißt weiter die Vorgabe 40', () => {
    expect(wochenstundenVon(undefined)).toBe(40);
    expect(wochenstundenVon(null)).toBe(40);
    expect(pflegeWocheMin(null)).toBe(40 * 60);
    const ohneAngabe = { ...gering, weeklyTargetHours: undefined };
    expect(tagessollStunden(ohneAngabe, '2026-06-10')).toBe(8);
    expect(calcOverallSaldo(ohneAngabe, [einsatz], true).saldoH).toBeLessThan(-100);
  });
});
