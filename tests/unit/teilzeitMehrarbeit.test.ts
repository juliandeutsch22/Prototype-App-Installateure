import { describe, it, expect } from 'vitest';
import { ueberstundenRegelVon, vollzeitVon } from '@/lib/lohnregeln';
import { ueberstundenNachTagesgrenze } from '@/features/accounting/ueberstunden';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Mehrarbeit in Teilzeit nach § 19d AZG (19.10.2026). Wer weniger als die
 * Vollzeit des Betriebs vereinbart hat, leistet über dem eigenen Soll zuerst
 * Mehrarbeit — bis zur Vollzeit eines Tages (ein Fünftel der Woche) und der
 * Woche —, erst darüber Überstunden. Jede Regel mit Gegenprobe; was für
 * Vollzeit, Gleitzeit und Sonn- und Feiertage gleich bleiben muss, steht
 * eigens.
 */

let n = 0;
const tag = (date: string, startTime: string, endTime: string, breakDuration = 30): TimeEntry =>
  ({
    id: `e${(n += 1)}`, companyId: 'c', userId: 'u', date, status: 'Anwesend',
    startTime, endTime, breakDuration, projectNumber: '2026-001',
  }) as TimeEntry;

type Person = Pick<AppUser, 'weeklyTargetHours' | 'workDays' | 'tagessoll' | 'einstufung'>;
// 20 Std. an fünf Tagen: vier Stunden Tagessoll.
const TEILZEIT_ARBEITER: Person = { weeklyTargetHours: 20, workDays: [1, 2, 3, 4, 5], tagessoll: null, einstufung: 'facharbeiter' };
const TEILZEIT_ANGESTELLT: Person = { ...TEILZEIT_ARBEITER, einstufung: null };
const regel = (over: Partial<ReturnType<typeof ueberstundenRegelVon>> = {}) => ({
  ...ueberstundenRegelVon({ ueberstundenModell: 'tagesgrenze' }), ...over,
});

describe('die Vollzeit des Betriebs', () => {
  it('ab Werk 38,5 Std.; ein gültiger Wert gilt', () => {
    expect(regel().vollzeitStunden).toBe(38.5);
    expect(ueberstundenRegelVon({ vollzeitWochenstunden: 40 }).vollzeitStunden).toBe(40);
  });

  it('Gegenprobe: über 40, null oder Unsinn fällt auf die Vorgabe', () => {
    for (const wert of [40.5, 0, -1, Number.NaN, null, undefined, 'x']) expect(vollzeitVon(wert)).toBe(38.5);
  });
});

describe('Mehrarbeit bis zur Vollzeit eines Tages', () => {
  // Dienstag, 07:00–15:30 mit Pause: 8 Std., 4 über dem Soll. Die Vollzeit
  // eines Tages ist 38,5 / 5 = 7,7 Std.: 3,7 Std. Mehrarbeit, 0,3 Überstunde.
  const achtStunden = [tag('2026-06-02', '07:00', '15:30')];

  it('nach dem KV: 222 Minuten Mehrarbeit, 18 Minuten Überstunde mit 50 %', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, achtStunden, regel(), true))
      .toEqual({ fuenfzigMin: 18, hundertMin: 0, nachtAlsUeberstundeMin: 0, mehrarbeitTeilzeitMin: 222 });
  });

  it('ohne Einstufung und ohne KV genauso — § 19d AZG gilt für alle', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ANGESTELLT, achtStunden, regel(), true))
      .toEqual({ fuenfzigMin: 18, hundertMin: 0, mehrarbeitTeilzeitMin: 222 });
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, achtStunden, regel({ kvMetall: false }), true))
      .toEqual({ fuenfzigMin: 18, hundertMin: 0, mehrarbeitTeilzeitMin: 222 });
  });

  it('die dritte Überstunde zählt erst ab der Vollzeit: 12 Std. am Tag', () => {
    // 06:00–18:30 mit Pause: 12 Std. = 8 über dem Soll; 3,7 Mehrarbeit, 4,3 Überstunden, davon 2,3 mit 100 %.
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, [tag('2026-06-02', '06:00', '18:30')], regel(), true))
      .toEqual({ fuenfzigMin: 120, hundertMin: 138, nachtAlsUeberstundeMin: 0, mehrarbeitTeilzeitMin: 222 });
  });

  it('mit einer Vollzeit von 40 Std. reicht die Mehrarbeit bis 8 Std.', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ANGESTELLT, achtStunden, regel({ vollzeitStunden: 40 }), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 0, mehrarbeitTeilzeitMin: 240 });
  });
});

describe('Mehrarbeit bis zur Vollzeit der Woche', () => {
  // Montag bis Freitag ohne Feiertag (der 4. Juni ist Fronleichnam) je 7,7 Std. (07:00–15:12): 5 × 3,7 = 18,5 Std. Mehrarbeit — die ganze Spanne bis 38,5.
  const woche = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'].map((d) => tag(d, '07:00', '15:12'));
  // Samstag, frei: 4,5 Std.
  const samstag = tag('2026-06-13', '07:00', '12:00');

  it('am freien Samstag danach ist jede Stunde eine Überstunde', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ANGESTELLT, [...woche, samstag], regel(), true))
      .toEqual({ fuenfzigMin: 270, hundertMin: 0, mehrarbeitTeilzeitMin: 1110 });
  });

  it('Gegenprobe: ohne die volle Woche ist der Samstag Mehrarbeit', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ANGESTELLT, [samstag], regel(), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 0, mehrarbeitTeilzeitMin: 270 });
  });

  it('die Tage vor dem Monatsersten zählen für die Woche mit', () => {
    // 16 Std. an Mittwoch und Donnerstag; Montag und Dienstag frei. Spanne bis zur Vollzeit: 22,5 Std.
    const person: Person = { weeklyTargetHours: 16, workDays: [3, 4], tagessoll: null, einstufung: null };
    const vorlauf = [tag('2026-06-29', '07:00', '15:12'), tag('2026-06-30', '07:00', '15:12')];
    const freitag = [tag('2026-07-03', '07:00', '15:12')];
    // Vorlauf: 2 × 462 Minuten Mehrarbeit, bleiben 426 für den Freitag.
    expect(ueberstundenNachTagesgrenze(person, freitag, regel(), true, vorlauf))
      .toEqual({ fuenfzigMin: 36, hundertMin: 0, mehrarbeitTeilzeitMin: 426 });
    // Gegenprobe: ohne Vorlauf wäre der ganze Freitag Mehrarbeit.
    expect(ueberstundenNachTagesgrenze(person, freitag, regel(), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 0, mehrarbeitTeilzeitMin: 462 });
  });
});

describe('was gleich bleibt', () => {
  it('Vollzeit: keine Mehrarbeit, die Zahlen wie bisher', () => {
    const vollzeit: Person = { ...TEILZEIT_ARBEITER, weeklyTargetHours: 38.5 };
    // 06:00–18:00 mit Pause: 11,5 Std., 3,8 über dem Tagessoll von 7,7.
    expect(ueberstundenNachTagesgrenze(vollzeit, [tag('2026-06-02', '06:00', '18:00')], regel(), true))
      .toEqual({ fuenfzigMin: 120, hundertMin: 108, nachtAlsUeberstundeMin: 0 });
  });

  it('bei der Grenze „über 10 Stunden“ gibt es keine Mehrarbeit', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ANGESTELLT, [tag('2026-06-02', '06:00', '18:00')], regel({ grenze: 'zehn' }), true))
      .toEqual({ fuenfzigMin: 90, hundertMin: 0 });
  });

  it('an Sonn- und Feiertagen bleibt nach dem KV jede Stunde bei 100 %', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, [tag('2026-06-07', '08:00', '12:30')], regel(), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 240, nachtAlsUeberstundeMin: 0, mehrarbeitTeilzeitMin: 0 });
  });

  it('beim Zeitkonto gibt es keine Überstunden und keine Mehrarbeit', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, [tag('2026-06-02', '06:00', '18:00')], ueberstundenRegelVon(null), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 0 });
  });
});

describe('Nachtstunden und Mehrarbeit', () => {
  it('Mehrarbeit in der Nacht ist keine Überstunde und behält die Nachtarbeitszulage', () => {
    // 18:00–02:30 mit Pause: 8 Std., 222 Minuten Mehrarbeit, 18 Minuten Überstunde — die liegt
    // zugunsten des Arbeitnehmers zwischen 20 und 22 Uhr, nimmt also keiner Nachtstunde die Zulage.
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, [tag('2026-06-02', '18:00', '02:30')], regel(), true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 18, nachtAlsUeberstundeMin: 0, mehrarbeitTeilzeitMin: 222 });
  });
});

describe('Lohn-CSV', () => {
  const person = (weeklyTargetHours: number) => ({
    id: 'u1', uid: 'u1', companyId: 'c', name: 'Mia', email: 'm@x.at', role: 'Mitarbeiter',
    weeklyTargetHours, workDays: [1, 2, 3, 4, 5], appStartDate: '2026-01-01', einstufung: 'facharbeiter',
  }) as AppUser;
  const monat = [tag('2026-06-02', '07:00', '15:30')];
  const lohn = { ueberstunden: regel() };

  it('die Mehrarbeit steht ganz hinten und beim einzelnen Mitarbeiter, nicht bei den 50 %', async () => {
    const { buildMonthCsv, buildUserCsv } = await import('@/features/accounting/export');
    const { calcMonthStats } = await import('@/lib/time');
    const mia = person(20);
    const stats = calcMonthStats(mia, monat, monat, 2026, 5, true);
    const zeilen = buildMonthCsv([{ user: mia, monthEntries: monat, stats }], 2026, 5, true, lohn).split('\n');
    const ab = zeilen.indexOf('Mitarbeiter-Zusammenfassung');
    expect(zeilen[ab + 1].endsWith(';davon Nacht als Überstunde(Std);Mehrarbeit Teilzeit(Std)')).toBe(true);
    expect(zeilen[ab + 2].endsWith(';0,00;3,70')).toBe(true);
    const einzeln = buildUserCsv(mia, monat, stats, 2026, 5, true, lohn);
    expect(einzeln).toContain('Überstunden 50 %;0,30 h');
    expect(einzeln).toContain('Mehrarbeit Teilzeit;3,70 h');
  });

  it('Gegenprobe: bei Vollzeit steht die Spalte mit null und beim Mitarbeiter keine Zeile', async () => {
    const { buildMonthCsv, buildUserCsv } = await import('@/features/accounting/export');
    const { calcMonthStats } = await import('@/lib/time');
    const max = person(38.5);
    const stats = calcMonthStats(max, monat, monat, 2026, 5, true);
    const zeilen = buildMonthCsv([{ user: max, monthEntries: monat, stats }], 2026, 5, true, lohn).split('\n');
    expect(zeilen[zeilen.indexOf('Mitarbeiter-Zusammenfassung') + 2].endsWith(';0,00;0,00')).toBe(true);
    expect(buildUserCsv(max, monat, stats, 2026, 5, true, lohn)).not.toContain('Mehrarbeit');
  });
});

/*
  DIE VOLLZEIT JE WOCHENTAG (A6, 24.10.2026). Bei vier langen Tagen und einem
  kurzen Freitag (4 × 8,5 + 4,5 = 38,5) ist die Vollzeit am Dienstag 8,5
  Std., nicht 7,7 — und am Freitag 4,5. Ohne Verteilung bleibt es beim
  Fünftel.
*/
describe('Mehrarbeit nach der Verteilung der Vollzeit', () => {
  const VIER_LANGE = { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 4.5 };
  const verteilt = regel({ vollzeitVerteilung: VIER_LANGE });

  it('am langen Dienstag: 8 Std. sind ganz Mehrarbeit, keine Überstunde', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, [tag('2026-06-02', '07:00', '15:30')], verteilt, true))
      .toEqual({ fuenfzigMin: 0, hundertMin: 0, nachtAlsUeberstundeMin: 0, mehrarbeitTeilzeitMin: 240 });
  });

  it('am kurzen Freitag: Mehrarbeit nur bis 4,5 Std., darüber Überstunden', () => {
    // Freitag, 8 Std. bei 4 Std. Soll: 0,5 Std. Mehrarbeit, 3,5 Überstunden (davon 1,5 ab der dritten mit 100 %).
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, [tag('2026-06-05', '07:00', '15:30')], verteilt, true))
      .toEqual({ fuenfzigMin: 120, hundertMin: 90, nachtAlsUeberstundeMin: 0, mehrarbeitTeilzeitMin: 30 });
  });

  it('an einem Tag ohne Vollzeit (Samstag) ist nichts Mehrarbeit', () => {
    const samstag = ueberstundenNachTagesgrenze(TEILZEIT_ANGESTELLT, [tag('2026-06-06', '08:00', '12:00', 0)], verteilt, true);
    expect(samstag.mehrarbeitTeilzeitMin).toBe(0);
    expect(samstag.fuenfzigMin).toBe(240);
  });

  it('über die ganze Woche: je Tag nach der Verteilung, zusammen genau bis zur Vollzeit der Woche', () => {
    // 8. bis 12. Juni 2026, kein Feiertag; jeden Tag 8,5 Std. bei 4 Std. Soll.
    const woche = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'].map((d) => tag(d, '07:00', '16:00'));
    const ue = ueberstundenNachTagesgrenze(TEILZEIT_ANGESTELLT, woche, verteilt, true);
    // Montag bis Donnerstag je 4,5 Std. Mehrarbeit, Freitag nur 0,5 — zusammen 18,5 = 38,5 − 20.
    expect(ue.mehrarbeitTeilzeitMin).toBe(4 * 270 + 30);
    expect(ue.fuenfzigMin).toBe(240);
  });

  it('gleich bleibt: ohne Verteilung ein Fünftel der Woche je Tag', () => {
    expect(ueberstundenNachTagesgrenze(TEILZEIT_ARBEITER, [tag('2026-06-02', '07:00', '15:30')], regel(), true))
      .toEqual({ fuenfzigMin: 18, hundertMin: 0, nachtAlsUeberstundeMin: 0, mehrarbeitTeilzeitMin: 222 });
  });

  it('eine Verteilung, die nicht als Woche aufgeht, gilt als nicht eingestellt', () => {
    expect(ueberstundenRegelVon({ vollzeitWochenstunden: 38.5, vollzeitVerteilung: VIER_LANGE }).vollzeitVerteilung)
      .toEqual(VIER_LANGE);
    for (const falsch of [{ 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 }, { 1: 11, 2: 9, 3: 9, 4: 9, 5: 0.5 }, { 7: 38.5 }, [8.5]]) {
      expect(ueberstundenRegelVon({ vollzeitWochenstunden: 38.5, vollzeitVerteilung: falsch as never }).vollzeitVerteilung)
        .toBeNull();
    }
  });
});
