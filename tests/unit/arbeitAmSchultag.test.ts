import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buchungKonflikt, tageMitEchterDoppelung } from '@/lib/tagesbuchungen';
import { calcMonthStats, calcOverallSaldo, saldoAusBilanzen } from '@/lib/time';
import { schultagGutschriftMin } from '@shared/arbeitszeit';
import { bilanzAusEintraegen } from '@shared/monatsbilanz';
import { tagesauswertung } from '@/features/accounting/tagesauswertung';
import { zeitraumFrage } from '@/features/time/zeitraumFrage';
import type { AppUser, TimeEntry } from '@/types';

/**
 * ARBEIT AM BERUFSSCHULTAG (Testbericht Runde 6, M1).
 *
 * „Für diesen Tag ist bereits „Berufsschule“ eingetragen“ — Arbeit nach dem
 * Unterricht ließ sich nicht buchen. Jetzt geht sie, und sie zählt nicht
 * doppelt: das Ist des Schultags ist max(Tagessoll, Unterricht + Arbeit).
 * Gegenproben: ein zweiter Schultag, Urlaub und Krankenstand bleiben
 * gesperrt; ein Schultag ohne Arbeit und einer ohne Unterrichtszeit zählen
 * wie bisher.
 */

const LENA: AppUser = {
  id: 'u1', uid: 'u1', companyId: 'perl', name: 'Lena Lehrling', email: 'l@perl.at',
  role: 'Mitarbeiter', weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5],
  appStartDate: '2026-10-19', einstufung: 'lehrling', lehrbeginn: '2025-09-01', lehrzeitMonate: 36,
};

let n = 0;
function e(teil: Partial<TimeEntry>): TimeEntry & { id: string } {
  n += 1;
  return {
    id: `e${n}`, companyId: 'perl', userId: 'u1', userName: 'Lena Lehrling',
    date: '2026-10-20', status: 'Anwesend', startTime: '07:00', endTime: '15:30', breakDuration: 30,
    ...teil,
  } as TimeEntry & { id: string };
}
const schule = (date: string, unterrichtMin?: number) =>
  e({ date, status: 'Berufsschule', startTime: undefined, endTime: undefined, breakDuration: 0, unterrichtMin, wegzeitMin: 60 });
const nachmittag = (date: string, bis = '17:30') =>
  e({ date, startTime: '16:00', endTime: bis, breakDuration: 0, projectNumber: 'PR-2026-0193' });

/** Mo 19. bis Do 22.10. gebucht, am Di 20.10. Schule und danach Arbeit. */
function woche(unterrichtMin?: number, bis = '17:30') {
  return [
    e({ date: '2026-10-19' }),
    schule('2026-10-20', unterrichtMin),
    nachmittag('2026-10-20', bis),
    e({ date: '2026-10-21' }),
    e({ date: '2026-10-22' }),
  ];
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Fr 23.10.2026: das Soll reicht bis gestern, Mo–Do.
  vi.setSystemTime(new Date(2026, 9, 23, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('Buchen am Schultag', () => {
  const tag = [schule('2026-10-20', 360)];

  it('Arbeit nach dem Unterricht darf dazu — auch die Berufsschule zur gebuchten Arbeit', () => {
    expect(buchungKonflikt({ status: 'Anwesend', startTime: '16:00', endTime: '17:30', projectNumber: 'PR-2026-0193' }, tag)).toBeNull();
    expect(buchungKonflikt({ status: 'Berufsschule' }, [nachmittag('2026-10-20')])).toBeNull();
    // Zwei Baustellen nach der Schule: wie an jedem Tag.
    expect(buchungKonflikt(
      { status: 'Anwesend', startTime: '17:30', endTime: '18:00', projectNumber: 'PR-2026-0190' },
      [...tag, nachmittag('2026-10-20')],
    )).toBeNull();
  });

  it('Gegenprobe: ein zweiter Schultag, Urlaub, Krank, ganztägiger Zeitausgleich bleiben gesperrt', () => {
    expect(buchungKonflikt({ status: 'Berufsschule' }, tag)).toMatch(/„Berufsschule“ eingetragen/);
    expect(buchungKonflikt({ status: 'Urlaub' }, tag)).toMatch(/„Berufsschule“ eingetragen/);
    expect(buchungKonflikt({ status: 'Krank' }, tag)).toMatch(/„Berufsschule“ eingetragen/);
    expect(buchungKonflikt({ status: 'Zeitausgleich' }, tag)).toMatch(/„Berufsschule“ eingetragen/);
    expect(buchungKonflikt({ status: 'Zeitausgleich', startTime: '16:00', endTime: '17:00' }, tag)).toMatch(/„Berufsschule“ eingetragen/);
    // Die Schule nicht neben Urlaub oder Krankenstand, auch nicht neben Arbeit UND Urlaub.
    expect(buchungKonflikt({ status: 'Berufsschule' }, [e({ status: 'Urlaub', startTime: undefined, endTime: undefined })])).not.toBeNull();
    expect(buchungKonflikt({ status: 'Berufsschule' }, [e({ status: 'Krank', startTime: undefined, endTime: undefined })])).not.toBeNull();
  });

  it('Gegenprobe: Arbeit neben Urlaub und Krank bleibt gesperrt', () => {
    expect(buchungKonflikt({ status: 'Anwesend', startTime: '16:00', endTime: '17:30', projectNumber: 'PR-1' },
      [e({ status: 'Krank', startTime: undefined, endTime: undefined })])).toMatch(/„Krank“ eingetragen/);
    expect(buchungKonflikt({ status: 'Anwesend', startTime: '16:00', endTime: '17:30', projectNumber: 'PR-1' },
      [e({ status: 'Urlaub', startTime: undefined, endTime: undefined })])).toMatch(/„Urlaub“ eingetragen/);
  });

  it('die Zeitübersicht meldet Schule und Arbeit nicht als „doppelt gebucht“ — zwei Schultage schon', () => {
    expect(tageMitEchterDoppelung([schule('2026-10-20', 360), nachmittag('2026-10-20')]).size).toBe(0);
    expect(tageMitEchterDoppelung([schule('2026-10-20'), schule('2026-10-20')])).toEqual(new Set(['2026-10-20']));
  });
});

describe('Was der Schultag gutschreibt', () => {
  it('max(Tagessoll, Unterricht + Arbeit) — nie mehr als das Tagessoll selbst', () => {
    expect(schultagGutschriftMin(480, 360, 90)).toBe(390); // 6 + 1,5 < 8: auf 8 aufgefüllt
    expect(schultagGutschriftMin(480, 360, 180)).toBe(360); // 6 + 3 = 9: eine Stunde darüber
    expect(schultagGutschriftMin(480, 600, 60)).toBe(480); // Unterricht über dem Soll: das Soll
  });

  it('Gegenprobe: ohne Arbeit oder ohne Unterrichtszeit das Tagessoll, wie bisher', () => {
    expect(schultagGutschriftMin(480, 360, 0)).toBe(480);
    expect(schultagGutschriftMin(480, null, 90)).toBe(480);
    expect(schultagGutschriftMin(480, undefined, 0)).toBe(480);
  });
});

describe('Saldo und Monat mit Arbeit am Schultag', () => {
  it('6 Std. Unterricht und 1:30 Arbeit: kein Plus — die Arbeit füllt das Tagessoll', () => {
    expect(calcOverallSaldo(LENA, woche(360), false).saldoH).toBe(0);
    const m = calcMonthStats(LENA, woche(360), woche(360), 2026, 9, false);
    expect(m.saldoMin).toBe(0);
    expect(m.istMin).toBe(3 * 480 + 90); // gearbeitet bleibt gearbeitet (Lohn, Nachkalkulation)
    expect(m.berufsschuleMin).toBe(390);
  });

  it('6 Std. Unterricht und 3 Std. Arbeit: eine Stunde darüber', () => {
    expect(calcOverallSaldo(LENA, woche(360, '19:00'), false).saldoH).toBe(1);
    expect(calcMonthStats(LENA, woche(360, '19:00'), [], 2026, 9, false).saldoMin).toBe(60);
  });

  it('Gegenprobe: ohne Unterrichtszeit zählt der Schultag mit dem Tagessoll, die Arbeit kommt dazu', () => {
    expect(calcOverallSaldo(LENA, woche(undefined), false).saldoH).toBe(1.5);
    expect(calcMonthStats(LENA, woche(undefined), [], 2026, 9, false).saldoMin).toBe(90);
  });

  it('Gegenprobe: ein Schultag ohne Arbeit schreibt das Tagessoll gut, wie bisher', () => {
    const ohne = woche(360).filter((x) => x.startTime !== '16:00');
    expect(calcOverallSaldo(LENA, ohne, false).saldoH).toBe(0);
    expect(calcMonthStats(LENA, ohne, [], 2026, 9, false).berufsschuleMin).toBe(480);
  });

  it('die Monatsbilanz kommt auf dieselbe Zahl wie die Einzelbuchungen', () => {
    // Im November: der Oktober kommt aus der Bilanz.
    vi.setSystemTime(new Date(2026, 10, 3, 10, 0, 0));
    for (const [u, bis] of [[360, '17:30'], [360, '19:00'], [undefined, '17:30']] as const) {
      const alle = woche(u, bis);
      const bilanz = bilanzAusEintraegen('2026-10', alle);
      const direkt = calcOverallSaldo(LENA, alle, false);
      expect(saldoAusBilanzen(LENA, [bilanz], [], false).saldoH).toBeCloseTo(direkt.saldoH, 6);
    }
    expect(bilanzAusEintraegen('2026-10', woche(360)).schultage).toEqual([{ tag: '2026-10-20', unterrichtMin: 360, arbeitMin: 90 }]);
  });

  it('der Tag im Streifen: gebucht, das Soll im Saldo ist der Rest bis zum Tagessoll', () => {
    const [di] = tagesauswertung({
      user: LENA, eintraege: woche(360), tage: ['2026-10-20'], fehlend: [], halbeTage: false, heute: '2026-10-23',
    });
    expect(di.zustand).toBe('ok');
    expect(di.istMin).toBe(90);
    expect(di.sollImSaldoMin).toBe(90);
  });
});

describe('Die Rückfrage vor einem Zeitraum (M3, G12)', () => {
  it('nennt Tage, Arbeitstage und was schon gebucht ist — wie im Testbericht', () => {
    const f = zeitraumFrage('Krank', '2026-10-21', '2026-10-27', [1, 2, 3, 4, 5], [{ date: '2026-10-22', status: 'Anwesend' }]);
    expect(f.titel).toBe('Krankmeldung über 7 Tage?');
    expect(f.text).toBe('21.10.–27.10.2026: 7 Tage, davon 3 Arbeitstage als „Krank“ im Zeitkonto (21.10., 23.10. und 27.10.). 22.10. ist schon gebucht und bleibt.');
  });

  it('Berufsschule kommt zur gebuchten Arbeit dazu — anders als Krank und Urlaub', () => {
    const f = zeitraumFrage('Berufsschule', '2026-10-19', '2026-10-23', [1, 2, 3, 4, 5], [
      { date: '2026-10-20', status: 'Anwesend' }, { date: '2026-10-22', status: 'Urlaub' },
    ]);
    expect(f.text).toContain('davon 4 Arbeitstage als „Berufsschule“ im Zeitkonto (19.10., 20.10., 21.10. und 23.10.)');
    expect(f.text).toContain('22.10. ist schon gebucht und bleibt.');
    expect(f.text).toContain('An 20.10. ist schon Arbeit gebucht — sie bleibt, die Berufsschule kommt dazu.');
  });

  it('ohne geladene Buchungen: nur der Hinweis, dass Gebuchtes bleibt', () => {
    const f = zeitraumFrage('Urlaub', '2026-10-19', '2026-10-20', [1, 2, 3, 4, 5], null);
    expect(f.text).toBe('19.10.–20.10.2026: 2 Tage, davon 2 Arbeitstage als „Urlaub“ im Zeitkonto (19.10. und 20.10.). Schon gebuchte Tage bleiben, wie sie sind.');
  });
});
