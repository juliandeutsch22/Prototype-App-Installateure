import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  arbeitszeitAm, calcMonthStats, calcOverallSaldo, localDateStr, pflichtTage, tagessollStunden, todayStr,
  urlaubsStand, urlaubsTage, type UrlaubsPosten,
} from '@/lib/time';
import { buildMonthCsv, buildUserCsv } from '@/features/accounting/export';
import { zeitkontoBestand, type BestandPerson } from '../fixtures/zeitkontoBestand';
import type { AppUser, ArbeitszeitAbschnitt, TimeEntry } from '@/types';

/**
 * ARBEITSZEIT UND URLAUBSANSPRUCH MIT „GÜLTIG AB“ (Durchsicht 15.11.2026,
 * Z3 + F2).
 *
 * Nachgestellt: wer die Wochenstunden einer Person änderte, änderte jeden
 * Monat seit dem Saldo-Start (40 → 30 Std: im Beispiel der Analyse +936 Std);
 * 25 → 30 Urlaubstage gaben auch dem Vorjahr 30. Mit dem Verlauf gilt eine
 * Änderung ab ihrem Tag bzw. Urlaubsjahr.
 *
 * Und das Wichtigste: für jede Person OHNE Änderung ändert sich keine Zahl —
 * weder Saldo noch Monat noch Urlaubsrest noch Export. Geprüft über einen
 * gewachsenen Bestand (`tests/fixtures/zeitkontoBestand.ts`), auch mit dem
 * Eintrag „gültig ab Saldo-Start mit den heutigen Werten“, den die Datenbank
 * bei der ersten Änderung anlegt.
 */

// Ein fester Tag, damit Monate und Jahre in jedem Lauf dieselben sind.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 16, 10, 0, 0));
});
afterAll(() => vi.useRealTimers());

function vollzeit(over: Partial<AppUser> = {}): AppUser {
  return {
    id: 'p', uid: 'p', companyId: 'perl', name: 'Pia', email: 'p@perl.at', role: 'Mitarbeiter', active: true,
    weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], yearlyVacationDays: 25, appStartDate: '2025-01-01',
    initialOvertime: 0, ...over,
  } as AppUser;
}

/** Jeden Arbeitstag acht Stunden — bei 40 Wochenstunden bleibt nur das Plus aus 24./31.12. */
function achtStunden(von: string, bis: string): TimeEntry[] {
  const raus: TimeEntry[] = [];
  for (const d = new Date(`${von}T00:00:00`); localDateStr(d) <= bis; d.setDate(d.getDate() + 1)) {
    const tag = localDateStr(d);
    if (pflichtTage(vollzeit({ appStartDate: von }), d, d).length === 0) continue;
    raus.push({ id: tag, companyId: 'perl', userId: 'p', date: tag, status: 'Anwesend', startTime: '07:00', endTime: '15:30', breakDuration: 30 } as TimeEntry);
  }
  return raus;
}

const teilzeitAbOktober: ArbeitszeitAbschnitt[] = [
  { ab: '2025-01-01', wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
  { ab: '2026-10-01', wochenstunden: 30, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
];

describe('Z3 nachgestellt: eine Änderung der Arbeitszeit rechnete rückwirkend', () => {
  const eintraege = achtStunden('2025-01-01', '2026-11-15');

  it('Gegenprobe (der Fehler): Wochenstunden ohne Datum geändert — jeder alte Monat bekommt ein anderes Soll', () => {
    const vorher = calcMonthStats(vollzeit(), eintraege.filter((e) => e.date.startsWith('2025-03')), [], 2025, 2, true);
    const nachher = calcMonthStats(vollzeit({ weeklyTargetHours: 30 }), eintraege.filter((e) => e.date.startsWith('2025-03')), [], 2025, 2, true);
    expect(nachher.sollMin).not.toBe(vorher.sollMin);
    // Der Gesamtsaldo springt um Hunderte Stunden.
    expect(calcOverallSaldo(vollzeit({ weeklyTargetHours: 30 }), eintraege, true).saldoH).toBeGreaterThan(500);
  });

  it('mit „gültig ab 1.10.2026“: die Monate davor bleiben, wie sie waren', () => {
    const p = vollzeit({ weeklyTargetHours: 30, arbeitszeitVerlauf: teilzeitAbOktober });
    for (const [jahr, monat] of [[2025, 2], [2025, 11], [2026, 8]] as const) {
      const prefix = `${jahr}-${String(monat + 1).padStart(2, '0')}`;
      const imMonat = eintraege.filter((e) => e.date.startsWith(prefix));
      expect(calcMonthStats(p, imMonat, [], jahr, monat, true)).toEqual(calcMonthStats(vollzeit(), imMonat, [], jahr, monat, true));
    }
  });

  it('ab dem 1.10. gilt das neue Soll — sechs Stunden je Tag', () => {
    const p = vollzeit({ weeklyTargetHours: 30, arbeitszeitVerlauf: teilzeitAbOktober });
    const oktober = eintraege.filter((e) => e.date.startsWith('2026-10'));
    const stats = calcMonthStats(p, oktober, [], 2026, 9, true);
    expect(stats.sollMin).toBe(stats.workdaysInMonth * 6 * 60);
    expect(stats.weeklyTarget).toBe(30);
    expect(tagessollStunden(p, '2026-09-30')).toBe(8);
    expect(tagessollStunden(p, '2026-10-01')).toBe(6);
  });

  it('der Gesamtsaldo wächst nur um die zwei Stunden je Tag seit dem 1.10.', () => {
    const p = vollzeit({ weeklyTargetHours: 30, arbeitszeitVerlauf: teilzeitAbOktober });
    const tageSeit = pflichtTage(p, new Date('2026-10-01T00:00:00'), new Date()).length;
    // Vorher stand er bei den acht Stunden aus 24./31.12. (halbe Solltage, voll gearbeitet).
    const vorher = calcOverallSaldo(vollzeit(), eintraege, true).saldoH;
    expect(vorher).toBe(8);
    expect(calcOverallSaldo(p, eintraege, true).saldoH).toBe(vorher + tageSeit * 2);
  });

  it('weniger Arbeitstage ab einem Tag: Pflicht- und Urlaubstage zählen davor fünf, danach vier Tage', () => {
    const p = vollzeit({
      workDays: [1, 2, 3, 4], weeklyTargetHours: 32,
      arbeitszeitVerlauf: [
        { ab: '2025-01-01', wochenstunden: 40, arbeitstage: [1, 2, 3, 4, 5], tagessoll: null },
        { ab: '2026-12-07', wochenstunden: 32, arbeitstage: [1, 2, 3, 4], tagessoll: null },
      ],
    });
    // 30.11.–11.12.2026: zwei Wochen, die zweite ab dem Wechsel — 8.12. ist Feiertag.
    expect(urlaubsTage(p, '2026-11-30', '2026-12-11')).toEqual([
      '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04',
      '2026-12-07', '2026-12-09', '2026-12-10',
    ]);
    expect(arbeitszeitAm(p, '2026-12-04').workDays).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Z3 nachgestellt: der Urlaubsanspruch galt rückwirkend für jedes Jahr', () => {
  // 2025 waren 20 von 25 genommen.
  const posten: UrlaubsPosten[] = [{ von: '2025-07-01', tage: 20 }];

  it('Gegenprobe (der Fehler): 25 → 30 ohne Datum — 2026 stehen 40 statt 35 Tage zur Verfügung', () => {
    expect(urlaubsStand(vollzeit({ yearlyVacationDays: 25 }), 2026, posten).anspruch).toBe(30);
    expect(urlaubsStand(vollzeit({ yearlyVacationDays: 30 }), 2026, posten).anspruch).toBe(40);
  });

  it('mit „ab dem Urlaubsjahr 2026“: 2025 behält 25, 2026 bekommt 30 — zusammen 35', () => {
    const p = vollzeit({ yearlyVacationDays: 30, urlaubsanspruchVerlauf: [{ jahr: 2025, tage: 25 }, { jahr: 2026, tage: 30 }] });
    expect(urlaubsStand(p, 2025, posten).rest).toBe(5);
    expect(urlaubsStand(p, 2026, posten).anspruch).toBe(35);
  });

  it('ab 2027 eingetragen: das laufende Jahr ändert sich nicht', () => {
    const p = vollzeit({ yearlyVacationDays: 25, urlaubsanspruchVerlauf: [{ jahr: 2025, tage: 25 }, { jahr: 2027, tage: 30 }] });
    expect(urlaubsStand(p, 2026, posten)).toEqual(urlaubsStand(vollzeit(), 2026, posten));
    expect(urlaubsStand(p, 2027, posten).anspruch).toBe(30 + 30);
  });
});

/*
  BLEIBT GLEICH: Personen ohne Änderung. Zwei Fassungen jeder Person aus dem
  gewachsenen Bestand — ohne Verlauf (Altdaten) und mit dem Eintrag „gültig
  ab Saldo-Start mit den heutigen Werten“ (nach `arbeitszeit_basis`). Beide
  müssen auf die Nachkommastelle dasselbe rechnen wie vorher.
*/
describe('bleibt gleich: ohne Änderung der Arbeitszeit ändert sich keine Zahl', () => {
  const bestand = zeitkontoBestand(todayStr());
  const mitBasis = (p: BestandPerson): BestandPerson => ({
    ...p,
    arbeitszeitVerlauf: p.appStartDate
      ? [{ ab: p.appStartDate, wochenstunden: p.weeklyTargetHours ?? null, arbeitstage: p.workDays ?? [1, 2, 3, 4, 5], tagessoll: p.tagessoll ?? null }]
      : null,
    urlaubsanspruchVerlauf: p.appStartDate ? [{ jahr: Number(p.appStartDate.slice(0, 4)), tage: p.yearlyVacationDays ?? 25 }] : null,
  });
  const monate = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(2026, 10 - i, 1);
    return [d.getFullYear(), d.getMonth()] as const;
  });

  it('Saldo und Lücken je Person', () => {
    for (const p of bestand.personen) {
      const eigene = bestand.buchungen.filter((e) => e.userId === p.uid);
      expect(calcOverallSaldo(mitBasis(p), eigene, p.halbeTage)).toEqual(calcOverallSaldo(p, eigene, p.halbeTage));
    }
  });

  it('jede Monatsauswertung der letzten 30 Monate, samt Resturlaub', () => {
    for (const p of bestand.personen) {
      const eigene = bestand.buchungen.filter((e) => e.userId === p.uid);
      const verlauf = eigene.filter((e) => e.status === 'Urlaub').map((e) => ({ von: e.date, tage: 1 }));
      for (const [jahr, monat] of monate) {
        const prefix = `${jahr}-${String(monat + 1).padStart(2, '0')}`;
        const imMonat = eigene.filter((e) => e.date.startsWith(prefix));
        const imJahr = eigene.filter((e) => e.date.startsWith(String(jahr)));
        expect(calcMonthStats(mitBasis(p), imMonat, imJahr, jahr, monat, p.halbeTage, { verlauf }))
          .toEqual(calcMonthStats(p, imMonat, imJahr, jahr, monat, p.halbeTage, { verlauf }));
      }
    }
  });

  it('Urlaubsstand je Jahr', () => {
    for (const p of bestand.personen.filter((x) => x.appStartDate)) {
      const posten = bestand.buchungen.filter((e) => e.userId === p.uid && e.status === 'Urlaub').map((e) => ({ von: e.date, tage: 1 }));
      for (let j = Number(p.appStartDate!.slice(0, 4)); j <= 2027; j += 1) {
        expect(urlaubsStand(mitBasis(p), j, posten)).toEqual(urlaubsStand(p, j, posten));
      }
    }
  });

  it('Monats-CSV und Personen-CSV Zeichen für Zeichen', () => {
    for (const [jahr, monat] of monate.slice(0, 14)) {
      const prefix = `${jahr}-${String(monat + 1).padStart(2, '0')}`;
      const zeilen = (q: (p: BestandPerson) => BestandPerson) => bestand.personen.filter((p) => p.halbeTage).map((p) => {
        const monthEntries = bestand.buchungen.filter((e) => e.userId === p.uid && e.date.startsWith(prefix));
        const u = q(p);
        return { user: u, monthEntries, stats: calcMonthStats(u, monthEntries, [], jahr, monat, true) };
      });
      const lohn = { ueberstunden: { modell: 'tagesgrenze', grenze: 'tagessoll', vollzeitStunden: 40, kvMetall: true } } as never;
      expect(buildMonthCsv(zeilen(mitBasis), jahr, monat, true, lohn)).toBe(buildMonthCsv(zeilen((p) => p), jahr, monat, true, lohn));
      for (const z of zeilen((p) => p)) {
        const b = mitBasis(z.user as BestandPerson);
        expect(buildUserCsv(b, z.monthEntries, calcMonthStats(b, z.monthEntries, [], jahr, monat, true), jahr, monat, true, lohn))
          .toBe(buildUserCsv(z.user, z.monthEntries, z.stats, jahr, monat, true, lohn));
      }
    }
  });
});
