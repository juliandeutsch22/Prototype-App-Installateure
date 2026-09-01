import type { AppUser, TimeEntry } from '@/types';
import { shouldShowOvertime } from './permissions';
import { calcWorkMin } from '@shared/arbeitszeit';

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
/**
 * Die Arbeitszeit eines Eintrags in Minuten.
 *
 * Die Formel steht in `shared/arbeitszeit.ts` und wird von den Cloud
 * Functions genauso verwendet — die Monatsbilanzen rechnen serverseitig, die
 * Anzeige hier. Zwei eigene Fassungen ergäben dieselbe Zahl, bis sie es eines
 * Tages nicht mehr täten, und bemerkt würde es an einem Stundensaldo, der auf
 * den Lohnzettel geht.
 *
 * Hier nur durchgereicht, damit die Aufrufer wie bisher aus `lib/time`
 * importieren.
 */
export { calcWorkMin };

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
  /**
   * Werktage seit dem Startdatum, an denen GAR NICHTS erfasst wurde.
   *
   * Jeder dieser Tage geht als volles Soll in den Saldo ein, ohne Ist —
   * er drückt den Saldo also um einen ganzen Arbeitstag. Wer die App im
   * August einführt und als Startdatum den 1. Jänner einträgt, bekommt so
   * auf einen Schlag ein Minus von mehreren hundert Stunden. Rechnerisch
   * richtig, in der Sache Unsinn: es wurde ja gearbeitet, nur eben nicht
   * in dieser App erfasst.
   *
   * Die Zahl wird deshalb mitgegeben, damit die Oberfläche einen solchen
   * Saldo als unvollständig kennzeichnen kann, statt ihn als Tatsache
   * hinzustellen.
   */
  daysWithoutEntry: number;
}

/**
 * Gesamtsaldo Überstunden (docs §4.2).
 * Soll: jeder Kalendertag von appStartDate bis GESTERN, der Arbeitstag und
 * kein Feiertag ist -> dailyH. Ist: Anwesend = gearbeitet, Krank/Urlaub =
 * voller Solltag. saldoH = initial + (Ist − Soll)/60.
 */
export function calcOverallSaldo(user: AppUser, entries: TimeEntry[]): SaldoResult {
  if (!shouldShowOvertime(user.role)) {
    return { saldoH: 0, hasConfig: false, daysWithoutEntry: 0 };
  }

  const initial = Number(user.initialOvertime ?? 0) || 0;
  if (!user.appStartDate) return { saldoH: initial, hasConfig: false, daysWithoutEntry: 0 };

  const weeklyH = Number(user.weeklyTargetHours ?? 40) || 40;
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const dailyH = weeklyH / workDays.length;

  // Ist
  let istMin = 0;
  const bookedDates = new Set<string>();
  for (const e of entries) {
    if (e.date < user.appStartDate) continue;
    bookedDates.add(e.date);
    if (e.status === 'Anwesend') istMin += calcWorkMin(e);
    else if (e.status === 'Krank' || e.status === 'Urlaub') istMin += dailyH * 60;
  }

  /**
   * Soll und Lücken aus derselben Quelle wie überall sonst.
   *
   * Diese Schleife war die dritte Fassung derselben Regel. Sie war die
   * richtige — ab Eintritt, höchstens bis gestern —, aber solange sie hier
   * eigenständig stand, konnte eine der anderen beiden davon abweichen.
   * Genau das war passiert.
   */
  const pflicht = pflichtTage(user, new Date(`${user.appStartDate}T00:00:00`), new Date());
  const sollMin = pflicht.length * dailyH * 60;
  const daysWithoutEntry = pflicht.filter((d) => !bookedDates.has(d)).length;

  const saldoH = Math.round((initial + (istMin - sollMin) / 60) * 100) / 100;
  return { saldoH, hasConfig: true, daysWithoutEntry };
}

/**
 * Derselbe Saldo, gerechnet aus MONATSBILANZEN statt aus Einzelbuchungen.
 *
 * Das Ergebnis muss auf die Minute mit `calcOverallSaldo` übereinstimmen —
 * es ist dieselbe Zahl, nur aus verdichteten Daten. Genau das prüft
 * `tests/unit/monatsbilanz.test.ts` gegen zufällig erzeugte Monate: eine
 * Abweichung wäre ein falscher Stundensaldo, und der geht auf den Lohnzettel.
 *
 * WAS AUS DEN BILANZEN KOMMT, ist ausschließlich das IST: gearbeitete
 * Minuten, gezählte Krank- und Urlaubstage, die gebuchten Daten. Das SOLL
 * wird hier abgeleitet — aus `pflichtTage`, derselben Quelle wie überall
 * sonst. Deshalb wirkt eine geänderte Wochenstundenzahl auch rückwirkend
 * richtig, ohne dass eine einzige Bilanz neu geschrieben werden müsste.
 *
 * Der laufende Monat wird NICHT aus der Bilanz gelesen, sondern aus den
 * echten Einträgen: er ändert sich noch, und der Trigger braucht einen
 * Augenblick. Ein Monteur, der gerade gebucht hat und seinen Saldo unverändert
 * sähe, würde zu Recht an der App zweifeln.
 */
export function saldoAusBilanzen(
  user: AppUser,
  bilanzen: Array<{ monat: string; anwesendMin: number; krankTage: number; urlaubTage: number; tage: string[] }>,
  laufenderMonat: TimeEntry[],
): SaldoResult {
  if (!shouldShowOvertime(user.role)) {
    return { saldoH: 0, hasConfig: false, daysWithoutEntry: 0 };
  }
  const initial = Number(user.initialOvertime ?? 0) || 0;
  if (!user.appStartDate) return { saldoH: initial, hasConfig: false, daysWithoutEntry: 0 };

  const weeklyH = Number(user.weeklyTargetHours ?? 40) || 40;
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const dailyH = weeklyH / workDays.length;

  const jetzt = new Date();
  const aktuellerMonat = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}`;

  let istMin = 0;
  const gebucht = new Set<string>();

  for (const b of bilanzen) {
    // Der laufende Monat kommt aus den Einträgen, nicht aus der Bilanz.
    if (b.monat >= aktuellerMonat) continue;
    istMin += b.anwesendMin;
    // Krank und Urlaub zählen als Tagessoll — bewertet ERST hier, mit der
    // aktuellen Konfiguration. Gespeichert ist nur die Anzahl.
    istMin += (b.krankTage + b.urlaubTage) * dailyH * 60;
    for (const t of b.tage) {
      if (t >= user.appStartDate) gebucht.add(t);
    }
  }

  for (const e of laufenderMonat) {
    if (e.date < user.appStartDate) continue;
    gebucht.add(e.date);
    if (e.status === 'Anwesend') istMin += calcWorkMin(e);
    else if (e.status === 'Krank' || e.status === 'Urlaub') istMin += dailyH * 60;
  }

  const pflicht = pflichtTage(user, new Date(`${user.appStartDate}T00:00:00`), new Date());
  const sollMin = pflicht.length * dailyH * 60;
  const daysWithoutEntry = pflicht.filter((d) => !gebucht.has(d)).length;

  const saldoH = Math.round((initial + (istMin - sollMin) / 60) * 100) / 100;
  return { saldoH, hasConfig: true, daysWithoutEntry };
}

export interface MonthStats {
  /**
   * Ist für diesen Mitarbeiter überhaupt ein Eintritt hinterlegt?
   *
   * Ohne Eintrittsdatum ist kein Soll berechenbar — die Zahlen sind dann
   * nicht „null Stunden Rückstand", sondern GAR KEINE AUSSAGE. Ohne diesen
   * Unterschied zeigte die Ansicht ein sauberes 00:00 und sah damit aus wie
   * ein gepflegter Datensatz.
   */
  hasConfig: boolean;
  /**
   * Läuft dieser Monat noch?
   *
   * Dann ist das Soll ein Zwischenstand, der jeden Tag wächst — und keine
   * Monatsbilanz. Die Ansicht muss das sagen, sonst wird eine Zahl vom 10.
   * für ein Monatsergebnis gehalten.
   */
  istLaufend: boolean;
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
  user: Pick<AppUser, 'weeklyTargetHours' | 'yearlyVacationDays' | 'workDays' | 'appStartDate'>,
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

  /**
   * Die Solltage kommen jetzt aus `pflichtTage` — derselben Quelle wie im
   * Zeitkonto und in der Lückenprüfung.
   *
   * Hier stand die Rechnung vorher ein zweites Mal, und sie zählte den GANZEN
   * Monat. Für einen abgeschlossenen Monat ist das richtig; für den laufenden
   * stand dadurch „00:00 von 176:00 · −176:00" — das Monatssoll gegen die
   * Stunden von zwei Tagen, als hätte jemand drei Wochen verschlafen, die
   * noch gar nicht stattgefunden haben. Genau so im Betrieb gesehen.
   *
   * `pflichtTage` hört bei gestern auf. Ein vergangener Monat liegt komplett
   * davor und ändert sich damit nicht — das halten die Tests fest.
   */
  const monatsStart = new Date(year, month, 1);
  const monatsEnde = new Date(year, month + 1, 0);
  const workdaysInMonth = pflichtTage(user, monatsStart, monatsEnde).length;
  const holidaysInMonth = feiertageImZeitraum(user, monatsStart, monatsEnde);

  const krankDays = monthEntries.filter((e) => e.status === 'Krank').length;
  const urlaubDays = monthEntries.filter((e) => e.status === 'Urlaub').length;
  const istMin = monthEntries.reduce((s, e) => s + calcWorkMin(e), 0);

  const requiredDays = Math.max(0, workdaysInMonth - krankDays - urlaubDays);
  const sollMin = Math.round(requiredDays * dailyTargetH * 60);

  const yearlyUrlaubDays = yearEntries.filter((e) => e.status === 'Urlaub').length;

  // Laufend heißt: der letzte Tag des Monats liegt noch vor uns.
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const istLaufend = monatsEnde >= heute;

  return {
    hasConfig: !!user.appStartDate,
    istLaufend,
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
/**
 * Die Tage eines Zeitraums, für die tatsächlich eine ARBEITSPFLICHT besteht.
 *
 * Die eine Stelle, an der diese Frage beantwortet wird. Sie stand vorher
 * dreimal im Code — in `calcOverallSaldo`, in `calcMonthStats` und in der
 * Lückenprüfung — und alle drei antworteten unterschiedlich. Genau daraus
 * entstanden zwei Fehler, die im Betrieb zu sehen waren:
 *
 *   „25 Tage ohne Buchung, Di., 25.08., …" bei einem Nutzer OHNE hinterlegtes
 *   Eintrittsdatum. Ohne Eintritt ist nicht bekannt, ab wann jemand
 *   überhaupt zu buchen hat — jeder gemeldete Tag davor ist eine
 *   Unterstellung. `calcOverallSaldo` wusste das seit jeher und rechnete
 *   ohne Startdatum gar nicht; die Lückenprüfung fing einfach am
 *   Fensteranfang an.
 *
 *   „00:00 von 176:00 · −176:00" für den LAUFENDEN Monat. Das Monatssoll
 *   des ganzen Monats gegen die Stunden von zwei Tagen gerechnet — als
 *   hätte jemand drei Wochen verschlafen, die noch gar nicht stattgefunden
 *   haben.
 *
 * Drei Regeln, ab jetzt an einer Stelle:
 *
 *   1. OHNE EINTRITTSDATUM keine Pflicht. Nicht „ab Fensteranfang", nicht
 *      „ab Monatserstem" — gar keine. Eine Pflicht, deren Beginn niemand
 *      kennt, lässt sich nicht behaupten.
 *   2. NIE ÜBER GESTERN HINAUS. Der heutige Tag ist nicht vorbei, künftige
 *      erst recht nicht. Für einen abgeschlossenen Monat ändert das nichts,
 *      für den laufenden alles.
 *   3. Feiertage und freie Wochentage zählen nicht — Teilzeit über
 *      `workDays`, nicht über eine feste Fünf-Tage-Annahme.
 */
export function pflichtTage(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  von: Date,
  bis: Date,
): string[] {
  // Regel 1: ohne Eintritt keine Aussage.
  if (!user.appStartDate) return [];

  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];

  const start = new Date(von);
  start.setHours(0, 0, 0, 0);
  const eintritt = new Date(`${user.appStartDate}T00:00:00`);
  if (eintritt > start) start.setTime(eintritt.getTime());

  // Regel 2: höchstens bis gestern.
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const gestern = new Date(heute);
  gestern.setDate(heute.getDate() - 1);

  const ende = new Date(bis);
  ende.setHours(0, 0, 0, 0);
  const schluss = gestern < ende ? gestern : ende;

  const tage: string[] = [];
  for (const tag = new Date(start); tag <= schluss; tag.setDate(tag.getDate() + 1)) {
    // Regel 3.
    if (workDays.includes(tag.getDay()) && !isAustrianHoliday(tag)) {
      tage.push(localDateStr(tag));
    }
  }
  return tage;
}

/** Die Feiertage, die in denselben Zeitraum fallen — nur zur Anzeige. */
export function feiertageImZeitraum(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  von: Date,
  bis: Date,
): number {
  if (!user.appStartDate) return 0;
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];
  const start = new Date(von);
  start.setHours(0, 0, 0, 0);
  const eintritt = new Date(`${user.appStartDate}T00:00:00`);
  if (eintritt > start) start.setTime(eintritt.getTime());
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const gestern = new Date(heute);
  gestern.setDate(heute.getDate() - 1);
  const ende = new Date(bis);
  ende.setHours(0, 0, 0, 0);
  const schluss = gestern < ende ? gestern : ende;

  let n = 0;
  for (const tag = new Date(start); tag <= schluss; tag.setDate(tag.getDate() + 1)) {
    if (workDays.includes(tag.getDay()) && isAustrianHoliday(tag)) n++;
  }
  return n;
}

/**
 * Welche Pflichttage ohne Buchung geblieben sind.
 *
 * Nur noch die Differenz aus `pflichtTage` und dem Gebuchten — die Regeln
 * darüber, welcher Tag überhaupt zählt, stehen nicht mehr hier.
 */
export function offeneWerktage(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  entries: Pick<TimeEntry, 'date'>[],
  von: Date,
  bis: Date,
): string[] {
  const gebucht = new Set(entries.map((e) => e.date));
  return pflichtTage(user, von, bis).filter((d) => !gebucht.has(d));
}

export function calcCompleteness(
  user: Pick<AppUser, 'workDays' | 'appStartDate'>,
  monthEntries: TimeEntry[],
  year: number,
  month: number,
): CompletenessResult {
  const workDays = user.workDays && user.workDays.length ? user.workDays : [1, 2, 3, 4, 5];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookedDates = new Set(monthEntries.map((e) => e.date));

  // Dieselbe Regel wie ueberall sonst, nur auf den Monat angewandt.
  const missingDates = offeneWerktage(
    user,
    monthEntries,
    new Date(year, month, 1),
    new Date(year, month + 1, 0),
  );

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
