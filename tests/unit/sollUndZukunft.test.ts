/**
 * Was noch nicht war, zählt nicht — weder beim Soll noch beim Saldo.
 *
 * Gefunden im Prüflauf vom 24.09.2026: eine Krankmeldung bis Monatsende
 * machte das „Soll bisher" der Mitarbeiterübersicht um 15 Stunden zu klein.
 * Die Pflichttage reichen im laufenden Monat bis gestern, abgezogen wurden
 * aber die Krank- und Urlaubstage des ganzen Monats. Dasselbe drohte dem
 * Saldo, sobald die Zeiterfassung künftige Abwesenheiten mitlädt: jeder Tag
 * einer Krankmeldung wird gutgeschrieben, das Soll dafür entsteht erst,
 * wenn er vorbei ist.
 *
 * Heute ist hier Donnerstag, der 24.09.2026. Pflichttage im September bis
 * gestern: 1.–4., 7.–11., 14.–18., 21.–23. — siebzehn.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { calcMonthStats, calcOverallSaldo, saldoAusBilanzen } from '@/lib/time';
import { objektAlsZeile } from '@/lib/db/pg/felder';
import type { AppUser, TimeEntry } from '@/types';

const monteur: AppUser = {
  id: 'u1',
  companyId: 'perl',
  uid: 'u1',
  name: 'Max Mustermann',
  email: 'max@perl.at',
  role: 'Mitarbeiter',
  active: true,
  weeklyTargetHours: 40,
  yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5],
  appStartDate: '2026-09-01',
  initialOvertime: 0,
};

const tag = (date: string, status: TimeEntry['status']): TimeEntry =>
  ({ id: date, companyId: 'perl', userId: 'u1', userName: 'Max', date, status, breakDuration: 0 }) as TimeEntry;

// Krank vom 22. bis Monatsende (heute und fünf Tage in der Zukunft), dazu
// ein Urlaubstag an einem Samstag, an dem ohnehin kein Soll besteht.
const eintraege: TimeEntry[] = [
  ...['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30']
    .map((d) => tag(d, 'Krank')),
  tag('2026-09-26', 'Urlaub'),
];

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T10:00:00'));
});
afterAll(() => {
  vi.useRealTimers();
});

describe('Soll bisher', () => {
  it('zieht nur die Krank- und Urlaubstage ab, die im Soll stecken', () => {
    const s = calcMonthStats(monteur, eintraege, eintraege, 2026, 8);
    // 17 Pflichttage, davon zwei krank (22., 23.) — nicht die künftigen,
    // nicht der Samstag.
    expect(s.requiredDays).toBe(15);
    expect(s.sollMin).toBe(15 * 8 * 60);
    // Angezeigt werden weiterhin alle Tage des Monats.
    expect(s.krankDays).toBe(7);
    expect(s.urlaubDays).toBe(1);
  });
});

describe('Saldo', () => {
  /*
    BEWUSST GEÄNDERT (Prüflauf 25.09.2026, P1-16). Hier stand „22., 23. und
    heute — drei Tage": der heutige Krankentag wurde gutgeschrieben, obwohl
    das Soll nur bis gestern zählt. Der Saldo stand damit den ganzen Tag um
    acht Stunden zu hoch. Ein ganztägiger Tag zählt jetzt erst, wenn er
    vorbei ist — wie sein Soll.
  */
  it('schreibt nichts aus der Zukunft gut — und den heutigen Krankentag erst morgen', () => {
    // Gutgeschrieben: 22. und 23. — zwei Tage. Soll: 17 Tage.
    expect(calcOverallSaldo(monteur, eintraege).saldoH).toBe((2 - 17) * 8);
  });

  it('rechnet aus den Monatsbilanzen dasselbe', () => {
    expect(saldoAusBilanzen(monteur, [], eintraege).saldoH).toBe((2 - 17) * 8);
  });

  it('zählt heute gearbeitete Zeit weiterhin sofort', () => {
    // Die Anwesenheit von heute ist geleistet — sie steht gleich im Saldo.
    const heuteGearbeitet: TimeEntry = {
      ...tag('2026-09-24', 'Anwesend'),
      id: 'a24',
      startTime: '07:00',
      endTime: '11:00',
    } as TimeEntry;
    const ohneKrankHeute = eintraege.filter((e) => e.date !== '2026-09-24');
    const mit = [...ohneKrankHeute, heuteGearbeitet];
    expect(calcOverallSaldo(monteur, mit).saldoH).toBe((2 - 17) * 8 + 4);
    expect(saldoAusBilanzen(monteur, [], mit).saldoH).toBe((2 - 17) * 8 + 4);
  });
});

describe('Eine leere Uhrzeit', () => {
  it('geht als null in die Datenbank, nicht als leerer Text', () => {
    expect(objektAlsZeile('time_entries', { startTime: '', endTime: '16:00', comment: '' })).toEqual({
      start_time: null, end_time: '16:00', comment: '',
    });
  });
});
