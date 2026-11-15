import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { calcMonthStats, calcOverallSaldo, localDateStr, pflichtTage } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

/**
 * AUSTRITT: DIE SALDORECHNUNG ENDET AM AUSTRITTSTAG (Durchsicht 15.11.2026, Z2).
 *
 * Nachgestellt nach der Analyse (B2): Austritt am 13.06.2026, ein genehmigter
 * Urlaub 16.–20.06. bleibt stehen. Jeder Urlaubstag danach schrieb das
 * Tagessoll gut — +32 Std im Gesamtsaldo, „die Zahl für die Endabrechnung“.
 * Ebenso eine Krankmeldung, die über den Austritt hinausläuft.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 16, 10, 0, 0));
});
afterAll(() => vi.useRealTimers());

const person = (over: Partial<AppUser> = {}): AppUser => ({
  id: 'a', uid: 'a', companyId: 'perl', name: 'Anton', email: 'a@perl.at', role: 'Mitarbeiter', active: false,
  weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-06-01', initialOvertime: 0, ...over,
} as AppUser);

const tag = (date: string, status: TimeEntry['status'], extra: Partial<TimeEntry> = {}) =>
  ({ id: `${date}-${status}`, companyId: 'perl', userId: 'a', date, status, breakDuration: 0, ...extra }) as TimeEntry;

/** 1.–12.06. jeden Arbeitstag acht Stunden; danach Urlaub 15.–19.06. (Fronleichnam 4.6. frei). */
function buchungen(): TimeEntry[] {
  const raus: TimeEntry[] = [];
  for (const d = new Date('2026-06-01T00:00:00'); d <= new Date('2026-06-12T00:00:00'); d.setDate(d.getDate() + 1)) {
    if (pflichtTage(person(), d, d).length === 0) continue;
    raus.push(tag(localDateStr(d), 'Anwesend', { startTime: '07:00', endTime: '15:30', breakDuration: 30 }));
  }
  for (const t of ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19']) raus.push(tag(t, 'Urlaub'));
  return raus;
}

describe('Austritt am 12.06., Urlaub danach stehen geblieben', () => {
  const ausgetreten = person({ austritt: '2026-06-12' });

  it('der Gesamtsaldo ist 0 — der Urlaub nach dem Austritt schreibt nichts gut', () => {
    expect(calcOverallSaldo(ausgetreten, buchungen(), true)).toMatchObject({ saldoH: 0, daysWithoutEntry: 0 });
  });

  it('auch eine Krankmeldung über den Austritt hinaus zählt nur bis zum Austritt', () => {
    const krank = [...buchungen().filter((e) => e.date <= '2026-06-10'), tag('2026-06-11', 'Krank'), tag('2026-06-12', 'Krank'),
      tag('2026-06-15', 'Krank'), tag('2026-06-16', 'Krank')];
    expect(calcOverallSaldo(ausgetreten, krank, true).saldoH).toBe(0);
  });

  it('die Monatsauswertung des Austrittsmonats zählt keinen Urlaubstag danach', () => {
    const juni = calcMonthStats(ausgetreten, buchungen(), buchungen(), 2026, 5, true);
    expect(juni.urlaubDays).toBe(0);
    expect(juni.saldoMin).toBe(0);
  });

  it('bleibt gleich: ohne Austritt schreibt derselbe Urlaub gut wie bisher', () => {
    expect(calcOverallSaldo(person({ active: true }), buchungen(), true).saldoH).toBeLessThan(0);
    expect(calcMonthStats(person({ active: true }), buchungen(), buchungen(), 2026, 5, true).urlaubDays).toBe(5);
  });
});
