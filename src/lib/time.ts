import type { AppUser, TimeEntry } from '@/types';
import { shouldShowOvertime } from './permissions';

/**
 * Zeit-, Feiertags- und Saldo-Logik — 1:1 aus der Legacy-App portiert
 * (docs §4.1 / §4.2). Wichtig: KEIN Wochenend-/Feiertagszuschlag — Feiertage
 * reduzieren nur das Soll, sie multiplizieren keine Stunden.
 */

/** 'YYYY-MM-DD' aus lokalen Komponenten (vermeidet UTC-Offset-Bug). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return localDateStr(new Date());
}

/** Osterdatum nach Gauß/Butcher. */
export function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=März, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const FIXED_HOLIDAYS: Record<string, string> = {
  '1-1': 'Neujahr',
  '1-6': 'Heilige Drei Könige',
  '5-1': 'Staatsfeiertag',
  '8-15': 'Mariä Himmelfahrt',
  '10-26': 'Nationalfeiertag',
  '11-1': 'Allerheiligen',
  '12-8': 'Mariä Empfängnis',
  '12-25': 'Christtag',
  '12-26': 'Stefanitag',
};

/** Österreichischer Feiertagsname oder null. */
export function getAustrianHolidayName(date: Date): string | null {
  const key = `${date.getMonth() + 1}-${date.getDate()}`;
  if (FIXED_HOLIDAYS[key]) return FIXED_HOLIDAYS[key];

  const easter = getEasterDate(date.getFullYear());
  const variable: Array<[number, string]> = [
    [1, 'Ostermontag'],
    [39, 'Christi Himmelfahrt'],
    [50, 'Pfingstmontag'],
    [60, 'Fronleichnam'],
  ];
  for (const [offset, name] of variable) {
    const d = new Date(easter);
    d.setDate(easter.getDate() + offset);
    if (d.getMonth() === date.getMonth() && d.getDate() === date.getDate()) return name;
  }
  return null;
}

export const isAustrianHoliday = (date: Date) => getAustrianHolidayName(date) !== null;
export const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

/** Letzter Werktag vor `fromDate` (überspringt Wochenende + Feiertage). */
export function lastWorkday(fromDate: Date): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - 1);
  while (isWeekend(d) || isAustrianHoliday(d)) {
    d.setDate(d.getDate() - 1);
  }
  return localDateStr(d);
}

/** ISO-8601-Kalenderwoche (Donnerstag-Regel). */
export function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

/** ISO-Wochen-Label, z. B. "2026-W26". */
export function isoWeekLabel(date: Date): string {
  const { week, year } = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Gearbeitete Minuten eines Eintrags.
 * - Nur 'Anwesend' liefert Arbeitszeit. Krank/Urlaub sind IMMER 0 — deren
 *   Gutschrift passiert allein in calcOverallSaldo (voller Solltag), sonst
 *   würde ein Krank-Eintrag mit `hours` doppelt zählen.
 * - start+end hat Vorrang: (end − start) − Pause, min. 0 (wie Legacy:2374).
 * - `hours` greift nur, wenn keine Zeitspanne da ist (Sprach-Einträge). So
 *   überschreibt ein später nachgetragenes Von/Bis den KI-Wert.
 * - Wegzeit (travelTime) wird NICHT zu den Arbeitsminuten addiert (wie Legacy).
 */
export function calcWorkMin(entry: Pick<TimeEntry, 'status' | 'startTime' | 'endTime' | 'breakDuration' | 'hours'>): number {
  if (entry.status !== 'Anwesend') return 0;
  if (entry.startTime && entry.endTime) {
    const start = new Date(`1970-01-01T${entry.startTime}`);
    const end = new Date(`1970-01-01T${entry.endTime}`);
    const brk = Number(entry.breakDuration ?? 0) || 0;
    const min = (end.getTime() - start.getTime()) / 60000 - brk;
    return Math.max(0, min);
  }
  if (typeof entry.hours === 'number' && !Number.isNaN(entry.hours)) {
    return Math.max(0, Math.round(entry.hours * 60));
  }
  return 0;
}

/** Minuten -> 'HH:MM'. */
export function fmtMin(m: number): string {
  const sign = m < 0 ? '-' : '';
  const abs = Math.abs(Math.round(m));
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface SaldoResult {
  saldoH: number;
  hasConfig: boolean;
}

/**
 * Gesamtsaldo Überstunden (docs §4.2).
 * Soll: jeder Kalendertag von appStartDate bis GESTERN, der Arbeitstag und
 * kein Feiertag ist -> dailyH. Ist: Anwesend = gearbeitet, Krank/Urlaub =
 * voller Solltag. saldoH = initial + (Ist − Soll)/60.
 */
export function calcOverallSaldo(user: AppUser, entries: TimeEntry[]): SaldoResult {
  if (!shouldShowOvertime(user.role)) return { saldoH: 0, hasConfig: false };

  const initial = Number(user.initialOvertime ?? 0) || 0;
  if (!user.appStartDate) return { saldoH: initial, hasConfig: false };

  const weeklyH = Number(user.weeklyTargetHours ?? 40) || 40;
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const dailyH = weeklyH / workDays.length;

  // Ist
  let istMin = 0;
  for (const e of entries) {
    if (e.date < user.appStartDate) continue;
    if (e.status === 'Anwesend') istMin += calcWorkMin(e);
    else if (e.status === 'Krank' || e.status === 'Urlaub') istMin += dailyH * 60;
  }

  // Soll: appStartDate .. gestern (heute exklusive)
  let sollMin = 0;
  const start = new Date(`${user.appStartDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const d = new Date(start); d < today; d.setDate(d.getDate() + 1)) {
    if (workDays.includes(d.getDay()) && !isAustrianHoliday(d)) {
      sollMin += dailyH * 60;
    }
  }

  const saldoH = Math.round((initial + (istMin - sollMin) / 60) * 100) / 100;
  return { saldoH, hasConfig: true };
}
