import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { calcMonthStats, calcOverallSaldo, localDateStr, pflichtTage } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * GUTSCHRIFT NUR AN EINEM TAG MIT SOLL (Durchsicht 15.11.2026, Z12).
 *
 * Nachgestellt: Krank am Samstag und Urlaub am Feiertag. `calcMonthStats`
 * zählte sie nicht („ein Krank-Tag an einem freien Tag zählt nicht“), der
 * Gesamtsaldo schrieb je acht Stunden gut — derselbe Monat stand in der
 * Übersicht mit 0 und im Saldo mit +16 da.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 0));
});
afterAll(() => vi.useRealTimers());

const pia = {
  id: 'p', uid: 'p', companyId: 'perl', name: 'Pia', email: 'p@perl.at', role: 'Mitarbeiter', active: true,
  weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-06-01', initialOvertime: 0,
} as AppUser;

const tag = (date: string, status: TimeEntry['status'], extra: Partial<TimeEntry> = {}) =>
  ({ id: `${date}-${status}`, companyId: 'perl', userId: 'p', date, status, breakDuration: 0, ...extra }) as TimeEntry;

/** Juni 2026: jeden Arbeitstag acht Stunden. */
function juni(): TimeEntry[] {
  const raus: TimeEntry[] = [];
  for (const d = new Date('2026-06-01T00:00:00'); d <= new Date('2026-06-30T00:00:00'); d.setDate(d.getDate() + 1)) {
    if (pflichtTage(pia, d, d).length === 0) continue;
    raus.push(tag(localDateStr(d), 'Anwesend', { startTime: '07:00', endTime: '15:30', breakDuration: 30 }));
  }
  return raus;
}

describe('Krank und Urlaub an einem freien Tag', () => {
  // Samstag 13.06., Fronleichnam 04.06., stundenweise Pflege am Sonntag 14.06.
  const frei = [tag('2026-06-13', 'Krank'), tag('2026-06-04', 'Urlaub'),
    tag('2026-06-14', 'Pflegefreistellung', { startTime: '10:00', endTime: '12:00' })];

  it('schreiben im Saldo nichts gut — wie in der Monatsauswertung', () => {
    const eintraege = [...juni(), ...frei];
    expect(calcOverallSaldo(pia, eintraege, true).saldoH).toBe(0);
    expect(calcMonthStats(pia, eintraege, [], 2026, 5, true).saldoMin).toBe(0);
  });

  it('Gegenprobe: an einem Arbeitstag schreibt Krank das Tagessoll gut', () => {
    const eintraege = [...juni().filter((e) => e.date !== '2026-06-15'), tag('2026-06-15', 'Krank')];
    expect(calcOverallSaldo(pia, eintraege, true).saldoH).toBe(0);
    const ohne = juni().filter((e) => e.date !== '2026-06-15');
    expect(calcOverallSaldo(pia, ohne, true).saldoH).toBe(-8);
  });

  it('der Tag zählt weiter als gebucht — nur nicht als Gutschrift', () => {
    expect(calcOverallSaldo(pia, [...juni(), ...frei], true).daysWithoutEntry).toBe(0);
  });
});
