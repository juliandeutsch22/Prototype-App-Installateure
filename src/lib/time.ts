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
    let span = (end.getTime() - start.getTime()) / 60000;
    // Endzeit vor Startzeit heißt: der Einsatz ging über Mitternacht
    // (Bereitschaft, Notdienst). Vorher ergab 22:00–06:00 glatt 0 Stunden —
    // die Nacht war schlicht nicht bezahlt.
    if (span < 0) span += 24 * 60;
    const brk = Number(entry.breakDuration ?? 0) || 0;
    return Math.max(0, span - brk);
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

export interface MonthStats {
  weeklyTarget: number;
  yearlyVacation: number;
  dailyTargetH: number;
  workdaysInMonth: number;
  holidaysInMonth: number;
  requiredDays: number;
  istMin: number;
  sollMin: number;
  saldoMin: number;
  krankDays: number;
  urlaubDays: number;
  yearlyUrlaubDays: number;
  urlaubRest: number;
}

/**
 * Monatsauswertung eines Mitarbeiters (Legacy:3061-3111).
 *
 * Das Tagessoll ist `weeklyTarget / workDays.length` — dieselbe Regel wie im
 * Gesamtsaldo (calcOverallSaldo). Der Prototyp teilte hier fest durch 5; bei
 * Teilzeit wichen Mitarbeiter- und Buchhaltungssicht dadurch voneinander ab.
 *
 * Weiterhin legacy-treu: Krank und Urlaub REDUZIEREN hier das Soll, statt zum
 * Ist zu zählen. Das ist die Darstellung, die die Lohnverrechnung erwartet —
 * der Gesamtsaldo schreibt sie stattdessen als vollen Solltag gut. Beide Wege
 * kommen auf dasselbe Ergebnis, zeigen es nur unterschiedlich auf.
 *
 * @param monthEntries Einträge des Nutzers im gewählten Monat
 * @param yearEntries  Einträge des Nutzers im gewählten Jahr (für den Resturlaub)
 * @param month        0-basiert (0 = Jänner)
 */
export function calcMonthStats(
  user: Pick<AppUser, 'weeklyTargetHours' | 'yearlyVacationDays' | 'workDays'>,
  monthEntries: TimeEntry[],
  yearEntries: TimeEntry[],
  year: number,
  month: number,
): MonthStats {
  const weeklyTarget = Number(user.weeklyTargetHours ?? 40) || 40;
  const yearlyVacation = Number(user.yearlyVacationDays ?? 25) || 25;

  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  // Tagessoll über die tatsächlichen Arbeitstage — identisch zu
  // calcOverallSaldo. Der Prototyp teilte hier fest durch 5; bei einer
  // 4-Tage-Woche (32 h) ergab das 6,4 h/Tag statt 8,0 h/Tag, und Mitarbeiter
  // und Buchhaltung sahen für denselben Monat verschiedene Salden.
  const dailyTargetH = weeklyTarget / workDays.length;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let workdaysInMonth = 0;
  let holidaysInMonth = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    if (workDays.includes(dateObj.getDay())) {
      if (isAustrianHoliday(dateObj)) holidaysInMonth++;
      else workdaysInMonth++;
    }
  }

  const krankDays = monthEntries.filter((e) => e.status === 'Krank').length;
  const urlaubDays = monthEntries.filter((e) => e.status === 'Urlaub').length;
  const istMin = monthEntries.reduce((s, e) => s + calcWorkMin(e), 0);

  const requiredDays = Math.max(0, workdaysInMonth - krankDays - urlaubDays);
  const sollMin = Math.round(requiredDays * dailyTargetH * 60);

  const yearlyUrlaubDays = yearEntries.filter((e) => e.status === 'Urlaub').length;

  return {
    weeklyTarget,
    yearlyVacation,
    dailyTargetH,
    workdaysInMonth,
    holidaysInMonth,
    requiredDays,
    istMin,
    sollMin,
    saldoMin: istMin - sollMin,
    krankDays,
    urlaubDays,
    yearlyUrlaubDays,
    urlaubRest: yearlyVacation - yearlyUrlaubDays,
  };
}

export type CompletenessStatus = 'complete' | 'today_only' | 'missing';

export interface CompletenessResult {
  status: CompletenessStatus;
  missingCount: number;
  missingDates: string[];
}

/**
 * Vollständigkeitskontrolle je Mitarbeiter (Legacy:3139-3197). Da es keinen
 * Freigabe-Workflow gibt, ist das die faktische Kontrollinstanz der
 * Geschäftsführung: welcher Arbeitstag wurde nicht gebucht?
 *
 * Geprüft wird von Monatsanfang (bzw. appStartDate, falls später) bis GESTERN
 * — heute zählt nicht als Versäumnis. Feiertage brauchen keinen Eintrag.
 */
export function calcCompleteness(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  monthEntries: TimeEntry[],
  year: number,
  month: number,
): CompletenessResult {
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];

  let checkStart = new Date(year, month, 1);
  if (user.appStartDate) {
    const sd = new Date(`${user.appStartDate}T00:00:00`);
    if (sd > checkStart) checkStart = sd;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const monthEnd = new Date(year, month + 1, 0);
  const checkEnd = yesterday < monthEnd ? yesterday : monthEnd;

  const bookedDates = new Set(monthEntries.map((e) => e.date));

  const missingDates: string[] = [];
  for (const cursor = new Date(checkStart); cursor <= checkEnd; cursor.setDate(cursor.getDate() + 1)) {
    const ds = localDateStr(cursor);
    if (workDays.includes(cursor.getDay()) && !isAustrianHoliday(cursor) && !bookedDates.has(ds)) {
      missingDates.push(ds);
    }
  }

  if (missingDates.length > 0) {
    return { status: 'missing', missingCount: missingDates.length, missingDates };
  }

  // Alles Vergangene gedeckt — steht heute noch aus?
  const todayOpen =
    workDays.includes(today.getDay()) &&
    !bookedDates.has(localDateStr(today)) &&
    !isAustrianHoliday(today) &&
    today.getFullYear() === year &&
    today.getMonth() === month;

  return { status: todayOpen ? 'today_only' : 'complete', missingCount: 0, missingDates: [] };
}

export interface ProjectHours {
  projectNumber: string;
  /** Facharbeiterminuten — nur diese zählen gegen das Budget. */
  fachMin: number;
  /** Helferminuten — kostenneutral für das Budget (Legacy:3684). */
  helperMin: number;
  entries: TimeEntry[];
}

/**
 * Vergleichsschlüssel für Projektnummern: gleicht ein historisch gewachsenes
 * `PR-`-Präfix an, damit `2025-001` und `PR-2025-001` dasselbe Projekt sind.
 */
export function normProjectNumber(nr?: string): string {
  return (nr ?? '').trim().replace(/^PR-/i, '');
}

/**
 * Gruppiert Zeiteinträge nach Baustelle und trennt Fach- von Helferzeit
 * (Legacy:3510-3549). Nur Anwesenheit mit Projektbezug zählt.
 */
export function groupProjectHours(entries: TimeEntry[]): ProjectHours[] {
  const map = new Map<string, ProjectHours>();
  for (const e of entries) {
    if (e.status !== 'Anwesend' || !e.projectNumber) continue;
    const min = calcWorkMin(e);
    if (min <= 0) continue;
    const key = normProjectNumber(e.projectNumber);
    const cur = map.get(key) ?? { projectNumber: key, fachMin: 0, helperMin: 0, entries: [] };
    if (e.isHelper) cur.helperMin += min;
    else cur.fachMin += min;
    cur.entries.push(e);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.projectNumber.localeCompare(b.projectNumber));
}

export interface BudgetState {
  /** Ausschöpfung in Prozent, auf 100 gedeckelt; null ohne hinterlegtes Budget. */
  pct: number | null;
  /** true, sobald die Fachzeit das Budget ECHT überschreitet. */
  over: boolean;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}

/**
 * Budget-Ampel einer Baustelle (Legacy:3597-3601).
 * Genau 100 % gilt noch NICHT als Überschreitung — erst darüber wird es rot.
 * Ohne hinterlegtes Budget gibt es bewusst keine Ampel statt einer falschen.
 */
export function calcBudgetState(fachMin: number, estimatedHours?: number): BudgetState {
  if (!estimatedHours || estimatedHours <= 0) {
    return { pct: null, over: false, tone: 'neutral' };
  }
  const usedH = fachMin / 60;
  const raw = (usedH / estimatedHours) * 100;
  const over = usedH > estimatedHours;
  return {
    pct: Math.min(Math.round(raw), 100),
    over,
    tone: over ? 'danger' : raw >= 80 ? 'warning' : 'success',
  };
}
