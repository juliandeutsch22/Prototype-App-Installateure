/**
 * Testbericht 30.09.2026, Paket 5a — Rechnung und Buchhaltung (Teil der Rechnungen).
 *
 *   M25  Die Projektauswertung der Monats-CSV zählt alle Personen, wie die Oberfläche.
 *   M22  Mahnspesen: an Firmenkunden höchstens 40 € je Rechnung, an
 *        Privatkunden eine Warnung darüber.
 */
import { describe, it, expect } from 'vitest';
import { buildMonthCsv } from '@/features/accounting/export';
import { mahnspesenBefund, spesenSumme } from '@/features/invoices/mahnung';
import { calcMonthStats } from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';

const eintrag = (over: Partial<TimeEntry>): TimeEntry =>
  ({
    id: 'e', companyId: 'c', userId: 'u1', date: '2026-09-02', status: 'Anwesend',
    startTime: '07:00', endTime: '11:00', breakDuration: 0, projectNumber: 'PR-187', ...over,
  }) as TimeEntry;

describe('M25 — Projektstunden in der Monats-CSV', () => {
  const monteur = {
    id: 'u1', uid: 'u1', companyId: 'c', name: 'Max', email: 'm@x.at', role: 'Mitarbeiter',
    weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-01-01',
  } as AppUser;
  const seine = [eintrag({ id: 'a' })];
  // Die Geschäftsführung ohne Zeitkonto steht nicht in den Zeilen oben — ihre Stunden auf der Baustelle zählen trotzdem.
  const chefin = eintrag({ id: 'b', userId: 'gf', startTime: '12:00', endTime: '15:00' });
  const helfer = eintrag({ id: 'c', userId: 'u2', isHelper: true, startTime: '07:00', endTime: '09:00' });
  const andere = eintrag({ id: 'd', userId: 'gf', projectNumber: 'PR-189', startTime: '07:00', endTime: '08:00' });
  const zeilen = [{ user: monteur, monthEntries: seine, stats: calcMonthStats(monteur, seine, seine, 2026, 8, true) }];

  it('zählt alle Buchungen des Monats, getrennt nach Fach und Helfer', () => {
    const csv = buildMonthCsv(zeilen, 2026, 8, true, {}, [...seine, chefin, helfer, andere]);
    const teil = csv.split('Projektauswertung (alle Personen)')[1];
    expect(teil).toContain('PR-187;7,00;2,00;9,00');
    // Vorher fehlte eine Baustelle, auf der nur Personen ohne Zeitkonto gebucht hatten.
    expect(teil).toContain('PR-189;1,00;0,00;1,00');
  });

  it('ohne eigene Liste die Buchungen der Zeilen', () => {
    const csv = buildMonthCsv(zeilen, 2026, 8, true);
    expect(csv).toContain('PR-187;4,00;0,00;4,00');
  });
});

describe('M22 — Mahnspesen', () => {
  it('summiert über die drei Stufen', () => {
    expect(spesenSumme([5, 10, 20])).toBe(35);
    expect(spesenSumme(undefined)).toBe(0);
  });

  it('an Firmenkunden über 40 € je Rechnung: zu viel', () => {
    expect(mahnspesenBefund({ mahnspesen: [10, 15, 20] }).firmaZuViel).toBe(45);
    expect(mahnspesenBefund({ mahnspesen: [10, 10, 20] }).firmaZuViel).toBeNull();
    // Mit der Pauschale nach § 458 UGB gelten die Spesen je Stufe für Firmenkunden nicht.
    expect(mahnspesenBefund({ mahnspesen: [100, 100, 100], mahnspesenVerbraucher: [0, 5, 10], pauschale458: true }).firmaZuViel).toBeNull();
  });

  it('an Privatkunden über 40 € nur eine Warnung', () => {
    const b = mahnspesenBefund({ mahnspesen: [0, 10, 20], mahnspesenVerbraucher: [10, 1000, 1500] });
    expect(b.privatHoch).toBe(2510);
    expect(b.firmaZuViel).toBeNull();
  });
});
