import { describe, it, expect } from 'vitest';
import { ueberstundenRegelVon } from '@/lib/lohnregeln';
import { ueberstundenNachTagesgrenze } from '@/features/accounting/ueberstunden';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Überstunden mit 50 und 100 % nach dem Kollektivvertrag Metallgewerbe
 * (Abschnitt XIV Pkt 8–11; nachgeprüft am 18.10.2026,
 * `docs/recherche-fragenkataloge.md`). Jede Regel mit Gegenprobe; was für
 * Personen ohne Einstufung und bei abgeschaltetem KV gleich bleiben muss,
 * steht eigens.
 */

let n = 0;
const tag = (date: string, startTime: string, endTime: string, breakDuration = 30): TimeEntry =>
  ({
    id: `e${(n += 1)}`, companyId: 'c', userId: 'u', date, status: 'Anwesend',
    startTime, endTime, breakDuration, projectNumber: '2026-001',
  }) as TimeEntry;

const ARBEITER = {
  weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], tagessoll: null, einstufung: 'facharbeiter',
} as Pick<AppUser, 'weeklyTargetHours' | 'workDays' | 'tagessoll' | 'einstufung'>;
const ANGESTELLT = { ...ARBEITER, einstufung: null };
const kv = (over: Partial<ReturnType<typeof ueberstundenRegelVon>> = {}) => ({
  ...ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze' }), ...over,
});

describe('der Schalter', () => {
  it('ist ab Werk an; nur false schaltet ab', () => {
    expect(ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze' }).kvMetall).toBe(true);
    expect(ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze', ueberstundenKvMetall: false }).kvMetall).toBe(false);
  });

  it('bleibt gleich: beim Zeitkonto gibt es keine Überstunden', () => {
    expect(ueberstundenNachTagesgrenze(ARBEITER, [tag('2026-06-02', '06:00', '18:00')], ueberstundenRegelVon(null), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 0 });
  });
});

describe('ab der dritten Überstunde am Tag', () => {
  // 06:00–18:00 mit Pause: 11,5 Std., 3,5 über dem Tagessoll von 8.
  const langerTag = [tag('2026-06-02', '06:00', '18:00')];

  it('zwei Stunden mit 50 %, der Rest mit 100 %', () => {
    expect(ueberstundenNachTagesgrenze(ARBEITER, langerTag, kv(), true)).toEqual({ fuenfzigMin: 120, hundertMin: 90 });
  });

  it('bleibt gleich: ohne Einstufung (Angestellte) und mit abgeschaltetem KV alles 50 %', () => {
    expect(ueberstundenNachTagesgrenze(ANGESTELLT, langerTag, kv(), true)).toEqual({ fuenfzigMin: 210, hundertMin: 0 });
    expect(ueberstundenNachTagesgrenze(ARBEITER, langerTag, kv({ kvMetall: false }), true)).toEqual({ fuenfzigMin: 210, hundertMin: 0 });
  });

  it('Gegenprobe: bis zwei Überstunden bleibt alles bei 50 %', () => {
    expect(ueberstundenNachTagesgrenze(ARBEITER, [tag('2026-06-02', '07:00', '17:30')], kv(), true))
      .toEqual({ fuenfzigMin: 120, hundertMin: 0 });
  });
});

describe('Überstunden zwischen 20 und 6 Uhr', () => {
  it('am Abend: die Überstunde liegt in der Nacht und trägt 100 %', () => {
    // 14:00–23:30 mit Pause: 9 Std., eine über dem Soll; 3,5 Std. ab 20 Uhr.
    expect(ueberstundenNachTagesgrenze(ARBEITER, [tag('2026-06-02', '14:00', '23:30')], kv(), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 60 });
  });

  it('am frühen Morgen: zugunsten des Arbeitnehmers zählen die Stunden vor 6 zuerst', () => {
    // 04:00–14:00 mit Pause: 9,5 Std., 1,5 über dem Soll; zwei Stunden vor 6 Uhr.
    expect(ueberstundenNachTagesgrenze(ARBEITER, [tag('2026-06-02', '04:00', '14:00')], kv(), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 90 });
  });

  it('Gegenprobe: Überstunden am Tag bleiben bei 50 %', () => {
    expect(ueberstundenNachTagesgrenze(ARBEITER, [tag('2026-06-02', '07:00', '17:00')], kv(), true))
      .toEqual({ fuenfzigMin: 90, hundertMin: 0 });
  });
});

describe('am sonst arbeitsfreien Tag erst ab der 11. Stunde', () => {
  it('Samstag 08:00–20:00 mit Pause: zehn Stunden 50 %, anderthalb 100 %', () => {
    expect(ueberstundenNachTagesgrenze(ARBEITER, [tag('2026-06-06', '08:00', '20:00')], kv(), true))
      .toEqual({ fuenfzigMin: 600, hundertMin: 90 });
  });

  it('Gegenprobe: vier Stunden am Samstag sind alle 50 % — nicht ab der dritten', () => {
    expect(ueberstundenNachTagesgrenze(ARBEITER, [tag('2026-06-06', '08:00', '12:00', 0)], kv(), true))
      .toEqual({ fuenfzigMin: 240, hundertMin: 0 });
  });
});

describe('Sonn- und Feiertage', () => {
  const sonntag = tag('2026-06-07', '08:00', '12:00', 0);
  const fronleichnam = tag('2026-06-04', '08:00', '10:00', 0);

  it('jede Stunde 100 %, auch ohne den Schalter für Sonn- und Feiertage', () => {
    expect(ueberstundenNachTagesgrenze(ARBEITER, [sonntag, fronleichnam], kv(), true)).toEqual({ fuenfzigMin: 0, hundertMin: 360 });
  });

  it('bleibt gleich: ohne Einstufung entscheidet weiter der Schalter', () => {
    expect(ueberstundenNachTagesgrenze(ANGESTELLT, [sonntag, fronleichnam], kv(), true)).toEqual({ fuenfzigMin: 360, hundertMin: 0 });
    expect(ueberstundenNachTagesgrenze(ANGESTELLT, [sonntag, fronleichnam], kv({ hundertSonnFeiertag: true }), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 360 });
  });
});

describe('ab der 51. Stunde der Woche', () => {
  // Mo–Do je 06:00–18:30 mit Pause: 12 Std., 4 über dem Soll — 48 Std. bis Donnerstag.
  const montagBisDonnerstag = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11'].map((d) => tag(d, '06:00', '18:30'));
  const freitag = tag('2026-06-12', '06:00', '18:30');

  it('am Freitag liegt jede Überstunde über der 50. Stunde: alle vier mit 100 %', () => {
    // Mo–Do je 2 × 50 % + 2 × 100 %, Freitag 4 × 100 %.
    expect(ueberstundenNachTagesgrenze(ARBEITER, [...montagBisDonnerstag, freitag], kv(), true))
      .toEqual({ fuenfzigMin: 4 * 120, hundertMin: 4 * 120 + 240 });
  });

  it('Gegenprobe: bei Gleitzeit (Grenze zehn Stunden) gilt die Wochenregel nicht', () => {
    // Je Tag zwei Stunden über zehn — beide 50 %, auch am Freitag.
    expect(ueberstundenNachTagesgrenze(ARBEITER, [...montagBisDonnerstag, freitag], kv({ grenze: 'zehn' }), true))
      .toEqual({ fuenfzigMin: 5 * 120, hundertMin: 0 });
  });

  it('die Tage vor dem Monatsersten in derselben Woche zählen mit (Vorlauf)', () => {
    // Do 01.10.2026 und Fr 02.10.2026 im Monat; Mo–Mi davor je 12 Std. im Vorlauf.
    const vorlauf = ['2026-09-28', '2026-09-29', '2026-09-30'].map((d) => tag(d, '06:00', '18:30'));
    const monat = [tag('2026-10-01', '06:00', '18:30'), tag('2026-10-02', '06:00', '18:30')];
    expect(ueberstundenNachTagesgrenze(ARBEITER, monat, kv(), true, vorlauf))
      .toEqual({ fuenfzigMin: 120, hundertMin: 120 + 240 });
    // Gegenprobe ohne Vorlauf: die Woche begänne am Ersten bei null.
    expect(ueberstundenNachTagesgrenze(ARBEITER, monat, kv(), true))
      .toEqual({ fuenfzigMin: 240, hundertMin: 240 });
  });
});

describe('24. und 31. Dezember', () => {
  // Do 24.12.2026, 07:00–16:00 mit Pause: 8,5 Std. bei halbem Soll von 4 —
  // 4,5 Überstunden, 3,5 Std. davon nach 12 Uhr (Pause am Nachmittag).
  const heiligAbend = [tag('2026-12-24', '07:00', '16:00')];

  it('jede Überstunde 100 % — ohne den Nachmittag, der in „ab 12 Uhr“ schon zählt', () => {
    expect(ueberstundenNachTagesgrenze(ARBEITER, heiligAbend, kv(), true)).toEqual({ fuenfzigMin: 0, hundertMin: 60 });
  });

  it('bleibt gleich: ohne Einstufung wie bisher 50 %', () => {
    expect(ueberstundenNachTagesgrenze(ANGESTELLT, heiligAbend, kv(), true)).toEqual({ fuenfzigMin: 270, hundertMin: 0 });
  });
});

describe('in der Lohn-CSV', () => {
  const mitarbeiter = {
    id: 'u1', uid: 'u1', companyId: 'c', name: 'Max', email: 'm@x.at', role: 'Mitarbeiter',
    weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-01-01', einstufung: 'facharbeiter',
  } as AppUser;

  it('stehen 50 und 100 % je Spalte — samt Vorlauf aus der Vorwoche', async () => {
    const { buildMonthCsv, buildUserCsv } = await import('@/features/accounting/export');
    const { calcMonthStats } = await import('@/lib/time');
    const vorlauf = ['2026-09-28', '2026-09-29', '2026-09-30'].map((d) => tag(d, '06:00', '18:30'));
    const monat = [tag('2026-10-01', '06:00', '18:30'), tag('2026-10-02', '06:00', '18:30')];
    const stats = calcMonthStats(mitarbeiter, monat, monat, 2026, 9, true);
    const lohn = { ueberstunden: ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze' }) };
    const csv = buildMonthCsv([{ user: mitarbeiter, monthEntries: monat, stats, vorlauf }], 2026, 9, true, lohn);
    const zeilen = csv.split('\n');
    const kopf = zeilen[zeilen.indexOf('Mitarbeiter-Zusammenfassung') + 1].split(';');
    const werte = zeilen[zeilen.indexOf('Mitarbeiter-Zusammenfassung') + 2].split(';');
    expect(werte[kopf.indexOf('Überstunden 50 %(Std)')]).toBe('2,00');
    expect(werte[kopf.indexOf('Überstunden 100 %(Std)')]).toBe('6,00');
    const einzeln = buildUserCsv(mitarbeiter, monat, stats, 2026, 9, true, lohn, vorlauf);
    expect(einzeln).toContain('Überstunden 50 %;2,00 h');
    expect(einzeln).toContain('Überstunden 100 %;6,00 h');
  });
});
