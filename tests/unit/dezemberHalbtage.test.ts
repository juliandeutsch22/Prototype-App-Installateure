/**
 * Der 24. und 31. Dezember als halbe Tage (Kollektivvertrag Metallgewerbe).
 *
 * An beiden Tagen endet die Normalarbeitszeit um 12 Uhr; Urlaub an beiden
 * zusammen ist EIN Urlaubstag. Beides folgt aus einem Gewicht je Tag
 * (`tagesAnteil`), und dieses Gewicht muss überall dasselbe sein: im Soll,
 * in der Gutschrift, in der Monatsbilanz, im Urlaubsverbrauch und im
 * Zuschlag. Jede Prüfung hier hat ihre Gegenprobe mit ausgeschalteter
 * Einstellung — die Regel darf nur wirken, wo sie gilt.
 *
 * Dezember 2025: 23 Werktage, davon drei Feiertage (8., 25., 26.) — zwanzig
 * Arbeitstage. Der 24. und der 31. sind Mittwoche.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  calcMonthStats, calcOverallSaldo, dezemberHalbtage, saldoAusBilanzen, tagesAnteil, tageGewicht,
  zeitausgleichMin,
} from '@/lib/time';
import { bilanzAusEintraegen } from '@shared/monatsbilanz';
import { dezemberNachmittagMin, zuschlagszeit } from '@/features/accounting/zuschlaege';
import { buildMonthCsv, buildUserCsv } from '@/features/accounting/export';
import type { AppUser, TimeEntry } from '@/types';

const monteur: AppUser = {
  id: 'u1', companyId: 'c', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
  role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5], appStartDate: '2025-12-01', initialOvertime: 0,
} as AppUser;

let nr = 0;
const eintrag = (date: string, status: TimeEntry['status'], over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: `e${++nr}`, companyId: 'c', userId: 'u1', userName: 'Max', date, status, breakDuration: 0,
    ...(status === 'Anwesend' ? { startTime: '07:00', endTime: '15:00' } : {}),
    ...over,
  }) as TimeEntry;

describe('Das Gewicht eines Tages', () => {
  it('ist am 24. und 31. Dezember ein halbes — sonst ein ganzes', () => {
    expect(tagesAnteil('2026-12-24', true)).toBe(0.5);
    expect(tagesAnteil('2026-12-31', true)).toBe(0.5);
    expect(tagesAnteil('2026-12-23', true)).toBe(1);
    expect(tagesAnteil('2027-01-02', true)).toBe(1);
    // Nur der Tag im Dezember, nicht „der 24." irgendeines Monats.
    expect(tagesAnteil('2026-11-24', true)).toBe(1);
    expect(tageGewicht(['2026-12-23', '2026-12-24', '2026-12-31'], true)).toBe(2);
  });

  it('Gegenprobe: ausgeschaltet zählt jeder Tag ganz', () => {
    expect(tagesAnteil('2026-12-24', false)).toBe(1);
    expect(tageGewicht(['2026-12-23', '2026-12-24', '2026-12-31'], false)).toBe(3);
  });

  it('ist ab Werk an, nur ein ausdrückliches Nein schaltet es ab', () => {
    expect(dezemberHalbtage(null)).toBe(true);
    expect(dezemberHalbtage({})).toBe(true);
    expect(dezemberHalbtage({ dezemberHalbtage: true })).toBe(true);
    expect(dezemberHalbtage({ dezemberHalbtage: false })).toBe(false);
  });
});

describe('Soll und Urlaub im Monat', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('der Dezember hat neunzehn Solltage statt zwanzig', () => {
    const an = calcMonthStats(monteur, [], [], 2025, 11, true);
    expect(an.requiredDays).toBe(19);
    expect(an.sollMin).toBe(19 * 8 * 60);
    const aus = calcMonthStats(monteur, [], [], 2025, 11, false);
    expect(aus.requiredDays).toBe(20);
    expect(aus.sollMin).toBe(20 * 8 * 60);
  });

  it('Urlaub an beiden Tagen ist EIN Urlaubstag', () => {
    const urlaub = [eintrag('2025-12-24', 'Urlaub'), eintrag('2025-12-31', 'Urlaub')];
    const an = calcMonthStats(monteur, urlaub, urlaub, 2025, 11, true);
    expect(an.urlaubDays).toBe(1);
    expect(an.yearlyUrlaubDays).toBe(1);
    // 25 Tage Anspruch, einer verbraucht.
    expect(an.urlaubRest).toBe(24);
    // Das Soll sinkt um genau das, was der Urlaub wiegt: 19 − 1.
    expect(an.requiredDays).toBe(18);

    const aus = calcMonthStats(monteur, urlaub, urlaub, 2025, 11, false);
    expect(aus.urlaubDays).toBe(2);
    expect(aus.urlaubRest).toBe(23);
    expect(aus.requiredDays).toBe(18);
  });

  it('ein Krankenstand zählt als Kalendertag, im Soll aber halb', () => {
    const krank = [eintrag('2025-12-24', 'Krank')];
    const an = calcMonthStats(monteur, krank, krank, 2025, 11, true);
    expect(an.krankDays).toBe(1);
    expect(an.requiredDays).toBe(18.5);
  });

  it('ein ganztägiger Zeitausgleich am 24. kostet ein halbes Tagessoll', () => {
    const za = [eintrag('2025-12-24', 'Zeitausgleich')];
    expect(calcMonthStats(monteur, za, za, 2025, 11, true).zaMin).toBe(4 * 60);
    expect(calcMonthStats(monteur, za, za, 2025, 11, false).zaMin).toBe(8 * 60);
    // Stundenweise bleibt es bei den eingetragenen Stunden.
    expect(zeitausgleichMin({ status: 'Zeitausgleich', startTime: '08:00', endTime: '10:00' }, 4)).toBe(120);
  });
});

describe('Der Saldo', () => {
  /*
    22.12.2025 bis 1.1.2026: Pflichttage 22., 23., 24., 29., 30., 31. —
    sechs, mit dem halben 24. und 31. fünf. Heute ist der 2. Jänner.
  */
  const ab22: AppUser = { ...monteur, appStartDate: '2025-12-22' };
  const woche = [
    eintrag('2025-12-22', 'Anwesend'), eintrag('2025-12-23', 'Anwesend'),
    eintrag('2025-12-29', 'Anwesend'), eintrag('2025-12-30', 'Anwesend'),
    eintrag('2025-12-31', 'Urlaub'),
  ];

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T10:00:00'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('bis 12 Uhr gearbeitet ist der 24. erfüllt', () => {
    const mit = [...woche, eintrag('2025-12-24', 'Anwesend', { startTime: '07:00', endTime: '11:00' })];
    // Ist 4 × 8 + 4 + ½ Urlaub (4) = 40, Soll 5 × 8 = 40.
    expect(calcOverallSaldo(ab22, mit, true).saldoH).toBe(0);
    // Gegenprobe: als ganze Tage fehlen die vier Stunden bis 16 Uhr.
    expect(calcOverallSaldo(ab22, mit, false).saldoH).toBe(-4);
  });

  it('Urlaub an beiden Tagen hält den Saldo auf null — mit und ohne Regel', () => {
    const mit = [...woche, eintrag('2025-12-24', 'Urlaub')];
    expect(calcOverallSaldo(ab22, mit, true).saldoH).toBe(0);
    expect(calcOverallSaldo(ab22, mit, false).saldoH).toBe(0);
  });

  it('aus Monatsbilanzen kommt derselbe Saldo heraus', () => {
    const mit = [...woche, eintrag('2025-12-24', 'Krank')];
    const bilanz = bilanzAusEintraegen('2025-12', mit);
    expect(bilanz.abwesendHalbtage).toBe(2);
    for (const halbe of [true, false]) {
      expect(saldoAusBilanzen(ab22, [bilanz], [], halbe).saldoH)
        .toBe(calcOverallSaldo(ab22, mit, halbe).saldoH);
    }
  });
});

describe('Arbeit nach 12 Uhr', () => {
  const am24 = (over: Partial<TimeEntry>) => eintrag('2025-12-24', 'Anwesend', over);

  it('zählt ab Mittag, die Pause geht vom Nachmittag ab', () => {
    // 07:00–16:00 mit 30 min Pause: 4 h nach 12 Uhr, abzüglich Pause 3,5 h.
    expect(dezemberNachmittagMin(am24({ startTime: '07:00', endTime: '16:00', breakDuration: 30 }), true)).toBe(210);
    expect(dezemberNachmittagMin(am24({ startTime: '13:00', endTime: '15:00' }), true)).toBe(120);
    expect(dezemberNachmittagMin(am24({ startTime: '07:00', endTime: '11:30' }), true)).toBe(0);
    // Über Mitternacht nur bis 24 Uhr — danach ist Christtag.
    expect(dezemberNachmittagMin(am24({ startTime: '22:00', endTime: '02:00' }), true)).toBe(120);
  });

  it('Gegenprobe: nicht an anderen Tagen, nicht ausgeschaltet, nicht ohne Uhrzeit', () => {
    const nachmittag = { startTime: '13:00', endTime: '15:00' };
    expect(dezemberNachmittagMin(eintrag('2025-12-23', 'Anwesend', nachmittag), true)).toBe(0);
    expect(dezemberNachmittagMin(am24(nachmittag), false)).toBe(0);
    expect(dezemberNachmittagMin(am24({ startTime: undefined, endTime: undefined, hours: 6 }), true)).toBe(0);
  });

  it('zählt eine Nachtschicht nicht doppelt in die Summe', () => {
    const z = zuschlagszeit([am24({ startTime: '13:00', endTime: '15:00', isNightWork: true })], true);
    expect(z.dezemberMin).toBe(120);
    expect(z.nachtMin).toBe(120);
    expect(z.gesamtMin).toBe(120);
  });

  it('steht in der Lohn-CSV als eigene Spalte, halbe Urlaubstage mit Komma', () => {
    const eintraege = [
      am24({ startTime: '07:00', endTime: '16:00', breakDuration: 30 }),
      eintrag('2025-12-31', 'Urlaub'),
    ];
    const stats = calcMonthStats(monteur, eintraege, eintraege, 2025, 11, true);
    const monat = buildMonthCsv([{ user: monteur, monthEntries: eintraege, stats }], 2025, 11, true);
    expect(monat).toContain('Zeitausgleich(Std);24./31.12. ab 12 Uhr(Std)');
    // … Urlaub 0,5 Tage, Resturlaub 24,5, Zeitausgleich 0, danach 3,5 h.
    expect(monat).toMatch(/;0,5;24,5;0,00;0,00;0,00;0,00;3,50$/m);

    const person = buildUserCsv(monteur, eintraege, stats, 2025, 11, true);
    expect(person).toContain('Urlaub (Monat);0,5 Tage');
    expect(person).toContain('24./31.12. ab 12 Uhr;3,50 h');

    // Gegenprobe: ausgeschaltet steht die Spalte da, mit null.
    const aus = calcMonthStats(monteur, eintraege, eintraege, 2025, 11, false);
    const ohne = buildUserCsv(monteur, eintraege, aus, 2025, 11, false);
    expect(ohne).toContain('Urlaub (Monat);1 Tage');
    expect(ohne).toContain('24./31.12. ab 12 Uhr;0,00 h');
  });
});
