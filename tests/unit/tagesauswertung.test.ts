import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calcCompleteness,
  calcMonthStats,
  calcWorkMin,
  fmtMin,
  getAustrianHolidayName,
  localDateStr,
  pflichtTage,
  tagesAnteil,
  tagessollStunden,
} from '@/lib/time';
import type { AppUser, TimeEntry } from '@/types';
import {
  montagDerWoche,
  plusTage,
  summeDerTage,
  tageDerWoche,
  tageDesMonats,
  tagesauswertung,
  tippText,
  type TagesZustand,
} from '@/features/accounting/tagesauswertung';
import type { Grenzfall } from '@/features/accounting/arbeitszeitGrenzen';

/**
 * DIE TAGESAUSWERTUNG GEGEN DAS ALTE RASTER (Runde 4, Abnahme 3.7).
 *
 * Bis Runde 4 leitete `MonatsRaster.tsx` je Zelle ab, was an einem Tag war.
 * Der Streifen zeigt dasselbe mit einer Farbe statt mit Klasse und Inhalt.
 * Die Herleitung des Rasters steht hier wörtlich (Stand vor Runde 4) und wird
 * für viele zufällige, aber gültige Monate Tag für Tag gegen die neue
 * Funktion verglichen:
 *
 *   Raster: Bernstein-Rand              → Streifen „fehlt“
 *   Raster: Stunden in der Zelle        → „gebucht“
 *   Raster: Kürzel (K, U, ZA …)         → „abwesend“
 *   Raster: grau, leer                  → „frei“
 *   Raster: weiss, leer                 → „heute/Zukunft“ (bzw. ohne Soll)
 *   Raster: weiss, leer, mit Buchung    → „gebucht“ (eine Buchung ohne Zeit)
 *
 * Dazu das Soll des Tages (der Tooltip des Rasters) und die Summen der Woche
 * gegen `calcMonthStats`.
 */

// ── Das alte Raster, wörtlich aus MonatsRaster.tsx (vor Runde 4) ─────────
const KURZ: Record<Exclude<TimeEntry['status'], 'Anwesend'>, string> = {
  Krank: 'K', Urlaub: 'U', Zeitausgleich: 'ZA', Berufsschule: 'BS', Dienstverhinderung: 'SU', Pflegefreistellung: 'PF', Unbezahlt: 'UU',
};
function kurzeZeitAlt(min: number): string {
  return fmtMin(min).replace(/^0(\d:)/, '$1');
}
function altesRaster(u: AppUser, monthEntries: TimeEntry[], fehlend: readonly string[], jahr: number, monat: number, halbeTage: boolean) {
  const letzterTag = new Date(jahr, monat + 1, 0).getDate();
  const tage = Array.from({ length: letzterTag }, (_, i) => localDateStr(new Date(jahr, monat, i + 1)));
  const erster = new Date(jahr, monat, 1);
  const letzter = new Date(jahr, monat + 1, 0);
  const workDays = u.workDays && u.workDays.length ? u.workDays : [1, 2, 3, 4, 5];
  const pflicht = new Set(pflichtTage(u, erster, letzter));
  const fehlt = new Set(fehlend);
  return tage.map((d) => {
    const datum = new Date(`${d}T00:00:00`);
    const feiertag = getAustrianHolidayName(datum);
    const frei = !workDays.includes(datum.getDay()) || !!feiertag || (!!u.appStartDate && d < u.appStartDate);
    const amTag = monthEntries.filter((e) => e.date === d);
    const ist = amTag.reduce((s, e) => s + calcWorkMin(e), 0);
    const abwesend = amTag.find((e) => e.status !== 'Anwesend');
    const soll = pflicht.has(d) ? Math.round(tagesAnteil(d, halbeTage) * tagessollStunden(u, d) * 60) : null;
    const inhalt = ist > 0 ? kurzeZeitAlt(ist) : abwesend ? KURZ[abwesend.status as keyof typeof KURZ] ?? '' : '';
    const klasse = fehlt.has(d) ? 'zeitraster-fehlt' : frei ? 'zeitraster-frei' : abwesend && ist === 0 ? 'zeitraster-weg' : 'zeitraster-zelle';
    return { tag: d, klasse, inhalt, soll, buchungen: amTag.length };
  });
}

/** Was das alte Raster sichtbar zeigte, als Zustand des Streifens. */
function erwartet(z: ReturnType<typeof altesRaster>[number]): TagesZustand {
  if (z.klasse === 'zeitraster-fehlt') return 'fehlt';
  if (/^\d+:\d\d$/.test(z.inhalt)) return 'ok';
  if (z.inhalt !== '') return 'weg';
  if (z.buchungen > 0) return 'ok';
  if (z.klasse === 'zeitraster-frei') return 'frei';
  return 'zukunft';
}

// ── Zufällige, gültige Monate ──────────────────────────────────────────────
function wuerfel(saat: number) {
  let x = saat;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

function baueMonat(saat: number, jahr: number, monat: number) {
  const r = wuerfel(saat);
  const arbeitstage = r() < 0.3 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  const eigenesSoll = r() < 0.3;
  const user: AppUser = {
    id: 'u1', companyId: 'perl', uid: 'u1', name: 'Prüffall', email: 'p@perl.at', role: 'Mitarbeiter', active: true,
    weeklyTargetHours: arbeitstage.length === 4 ? 30 : r() < 0.5 ? 38.5 : 40,
    yearlyVacationDays: 25,
    workDays: arbeitstage,
    // Mal Eintritt mitten im Monat, mal lange davor, mal gar keiner.
    appStartDate: r() < 0.15 ? undefined : r() < 0.3 ? localDateStr(new Date(jahr, monat, 1 + Math.floor(r() * 20))) : '2024-01-01',
    ...(eigenesSoll ? { tagessoll: { 1: 8.5, 2: 8.5, 3: 8.5, 4: 8.5, 5: 4 } } : {}),
  } as AppUser;
  const eintraege: TimeEntry[] = [];
  const pflicht = new Set(pflichtTage(user, new Date(jahr, monat, 1), new Date(jahr, monat + 1, 0)));
  for (const d of tageDesMonats(jahr, monat)) {
    const w = r();
    const neu = (status: TimeEntry['status'], x: Partial<TimeEntry> = {}) =>
      eintraege.push({ companyId: 'perl', userId: 'u1', userName: 'Prüffall', date: d, status, ...x } as TimeEntry);
    if (pflicht.has(d) || (d >= localDateStr(new Date()) && r() < 0.3)) {
      if (w < 0.12) continue; // Lücke
      if (w < 0.18) neu('Krank');
      else if (w < 0.24) neu('Urlaub');
      else if (w < 0.28) neu('Zeitausgleich');
      else if (w < 0.32) neu('Berufsschule');
      else if (w < 0.35) neu('Pflegefreistellung', { startTime: '08:00', endTime: '10:00' });
      else if (w < 0.38) {
        neu('Anwesend', { startTime: '07:00', endTime: '11:30', breakDuration: 0 });
        neu('Anwesend', { startTime: '12:00', endTime: '15:30', breakDuration: 0 });
      } else neu('Anwesend', { startTime: '07:00', endTime: '15:30', breakDuration: 30 });
    } else if (w < 0.08) {
      neu('Anwesend', { startTime: '08:00', endTime: '12:00', breakDuration: 0 }); // Notdienst am freien Tag
    }
  }
  return { user, eintraege };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0, 0)); // Mittwoch, 14.10.2026
});
afterEach(() => vi.useRealTimers());

const MONATE: Array<[number, number, boolean]> = [
  [2026, 9, false], // laufender Monat
  [2026, 8, false],
  [2026, 3, false], // April mit Ostermontag
  [2025, 11, true], // Dezember mit halben Tagen am 24. und 31.
  [2026, 1, false], // Februar
];

describe('Der Streifen zeigt Tag für Tag, was das Raster zeigte (Abnahme 3.7)', () => {
  it.each(MONATE)('%i-%i (halbe Tage: %s), 40 zufällige Personen', (jahr, monat, halbeTage) => {
    for (let saat = 1; saat <= 40; saat++) {
      const { user, eintraege } = baueMonat(saat * 7 + monat, jahr, monat);
      const vollst = calcCompleteness(user, eintraege, jahr, monat);
      const alt = altesRaster(user, eintraege, vollst.missingDates, jahr, monat, halbeTage);
      const neu = tagesauswertung({
        user, eintraege, tage: tageDesMonats(jahr, monat), fehlend: vollst.missingDates, halbeTage, heute: '2026-10-14',
      });
      expect(neu.map((t) => t.tag)).toEqual(alt.map((z) => z.tag));
      expect(neu.map((t) => `${t.tag} ${t.zustand}`)).toEqual(alt.map((z) => `${z.tag} ${erwartet(z)}`));
      // Das Soll im Tooltip ist das des Rasters.
      expect(neu.map((t) => t.sollMin)).toEqual(alt.map((z) => z.soll));
      // „N Tage ohne Buchung“ ist die Zahl der Bernstein-Felder.
      expect(neu.filter((t) => t.zustand === 'fehlt')).toHaveLength(vollst.missingCount);
    }
  });

  it('Gegenprobe: ein fehlender Tag mehr in der Vollständigkeit ändert genau dieses Feld', () => {
    const { user, eintraege } = baueMonat(3, 2026, 8);
    const vollst = calcCompleteness(user, eintraege, 2026, 8);
    const basis = { user, eintraege, tage: tageDesMonats(2026, 8), halbeTage: false, heute: '2026-10-14' };
    const vorher = tagesauswertung({ ...basis, fehlend: vollst.missingDates });
    const tag = vorher.find((t) => t.zustand === 'ok')!.tag;
    const nachher = tagesauswertung({ ...basis, fehlend: [...vollst.missingDates, tag] });
    expect(nachher.filter((t, i) => t.zustand !== vorher[i].zustand).map((t) => t.tag)).toEqual([tag]);
  });
});

describe('Die Summen aus den Tageswerten sind die der Monatsauswertung', () => {
  /*
    „Soll bisher“ der Woche ist die Summe der Tage. Damit Woche und Monat
    nicht auseinanderlaufen, muss dieselbe Summe über den ganzen Monat
    `stats.sollMin` ergeben — mit Krank, Urlaub, Berufsschule (ziehen vom
    Soll ab), Zeitausgleich (zieht nicht ab), stundenweiser Freistellung,
    eigenem Tagessoll und den halben Tagen im Dezember.
  */
  it.each(MONATE)('%i-%i (halbe Tage: %s)', (jahr, monat, halbeTage) => {
    for (let saat = 1; saat <= 40; saat++) {
      const { user, eintraege } = baueMonat(saat * 11 + monat, jahr, monat);
      const stats = calcMonthStats(user, eintraege, eintraege, jahr, monat, halbeTage);
      const vollst = calcCompleteness(user, eintraege, jahr, monat);
      const werte = tagesauswertung({
        user, eintraege, tage: tageDesMonats(jahr, monat), fehlend: vollst.missingDates, halbeTage, heute: '2026-10-14',
      });
      const summe = summeDerTage(werte);
      expect(summe.istMin).toBe(stats.istMin);
      expect(summe.sollMin).toBe(stats.sollMin);
      expect(summe.saldoMin).toBe(stats.saldoMin);
    }
  });

  it('die Wochen eines Monats ergeben zusammen den Monat', () => {
    const { user, eintraege } = baueMonat(5, 2026, 8);
    const stats = calcMonthStats(user, eintraege, eintraege, 2026, 8, false);
    let ist = 0;
    let sollRoh = 0;
    for (let montag = montagDerWoche('2026-09-01'); montag <= '2026-09-30'; montag = plusTage(montag, 7)) {
      const tage = tageDerWoche(montag).filter((t) => t.startsWith('2026-09'));
      const werte = tagesauswertung({ user, eintraege, tage, fehlend: [], halbeTage: false, heute: '2026-10-14' });
      ist += werte.reduce((s, t) => s + t.istMin, 0);
      sollRoh += werte.reduce((s, t) => s + t.sollImSaldoMin, 0);
    }
    expect(ist).toBe(stats.istMin);
    expect(Math.round(sollRoh)).toBe(stats.sollMin);
  });

  it('Gegenprobe: das Soll des Tooltips über den Monat ist NICHT das „Soll bisher“, sobald jemand krank war', () => {
    // Darum trägt jeder Tag beide Werte: der Tooltip nennt das Tagessoll, der Saldo zieht den Krankentag ab.
    const user = { uid: 'u1', workDays: [1, 2, 3, 4, 5], weeklyTargetHours: 40, appStartDate: '2024-01-01' } as AppUser;
    const eintraege = [{ date: '2026-09-01', status: 'Krank', userId: 'u1' } as TimeEntry];
    const werte = tagesauswertung({ user, eintraege, tage: tageDesMonats(2026, 8), fehlend: [], halbeTage: false, heute: '2026-10-14' });
    const tooltip = werte.reduce((s, t) => s + (t.sollMin ?? 0), 0);
    expect(summeDerTage(werte).sollMin).toBe(tooltip - 480);
  });
});

describe('Grenzfälle und Tooltip', () => {
  const user = { uid: 'u1', name: 'Lena', workDays: [1, 2, 3, 4, 5], weeklyTargetHours: 40, appStartDate: '2024-01-01' } as AppUser;
  const eintraege = [
    { date: '2026-10-06', status: 'Anwesend', startTime: '07:00', endTime: '11:30', userId: 'u1' },
    { date: '2026-10-06', status: 'Anwesend', startTime: '12:00', endTime: '15:30', userId: 'u1' },
    { date: '2026-10-07', status: 'Krank', userId: 'u1' },
  ] as TimeEntry[];
  const fall: Grenzfall = { art: 'tag', bezug: '2026-10-06', jugendlich: true, ist: 480, grenze: 420 };
  const woche: Grenzfall = { art: 'woche', bezug: '2026-10-05', jugendlich: true, ist: 2500, grenze: 2400 };
  const tage = tageDerWoche('2026-10-05');

  it('ein Tagesfall färbt das gebuchte Feld, ein Wochenfall nicht', () => {
    const mit = tagesauswertung({ user, eintraege, tage, fehlend: [], halbeTage: false, heute: '2026-10-14', grenzen: [fall, woche] });
    expect(mit.find((t) => t.tag === '2026-10-06')!.zustand).toBe('grenze');
    expect(mit.find((t) => t.tag === '2026-10-05')!.zustand).toBe('zukunft'); // keine Buchung, kein Fall am Montag
    const ohne = tagesauswertung({ user, eintraege, tage, fehlend: [], halbeTage: false, heute: '2026-10-14' });
    expect(ohne.find((t) => t.tag === '2026-10-06')!.zustand).toBe('ok');
  });

  it('der Tooltip nennt Tag, Zeiten, Stunden, Soll und den Fall — die Art als Wort', () => {
    const [, di, mi, , , sa] = tagesauswertung({ user, eintraege, tage, fehlend: [], halbeTage: false, heute: '2026-10-14', grenzen: [fall] });
    expect(tippText(di)).toBe('Di 06.10. · 07:00–11:30, 12:00–15:30 · 8:00 Std. · Soll 8:00 · 8:00 Std. am 06.10. — höchstens 7 Std.');
    expect(tippText(mi)).toBe('Mi 07.10. · Krank · Soll 8:00');
    expect(tippText(sa)).toBe('Sa 10.10. · frei');
  });
});
