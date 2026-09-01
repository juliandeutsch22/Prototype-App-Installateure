/**
 * Österreichische Feiertage und die Frage, welche Tage Arbeitstage sind.
 *
 * WARUM IN `shared/` UND NICHT IN `src/lib/time.ts`: dieselbe Rechnung läuft
 * inzwischen auf beiden Seiten. Der Browser zeigt dem Mitarbeiter beim
 * Urlaubsantrag, wie viele Arbeitstage der Zeitraum kostet; die Cloud Function
 * schreibt bei der Genehmigung genau diese Tage ins Zeitkonto. Zwei eigene
 * Fassungen ergäben dieselbe Zahl, bis sie es eines Tages nicht mehr täten —
 * und bemerkt würde es an einem Urlaubskonto, das nicht aufgeht.
 *
 * Die Datei importiert bewusst NICHTS: sie wird beim Build unverändert in die
 * Functions kopiert (siehe `functions/scripts/shared-uebernehmen.mjs`).
 *
 * Kein Wochenend- oder Feiertagszuschlag: Feiertage reduzieren nur das Soll,
 * sie multiplizieren keine Stunden.
 */

/** 'YYYY-MM-DD' aus lokalen Komponenten (vermeidet UTC-Offset-Fehler). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

/**
 * Die Arbeitstage in einem Zeitraum — Wochenende und Feiertage heraus.
 *
 * Die gemeinsame Grundlage von zwei Rechnungen, die dieselbe Frage stellen und
 * sie deshalb gleich beantworten müssen: „welche Tage zählen?"
 *
 *  - `pflichtTage` fragt es rückwärts: an welchen Tagen hätte gebucht werden
 *    müssen.
 *  - Der Urlaubsantrag fragt es vorwärts: wie viele Urlaubstage verbraucht ein
 *    Zeitraum.
 *
 * Liefen beide auseinander, bekäme ein Monteur für eine Woche mit Feiertag
 * fünf Tage abgezogen und hätte trotzdem einen Tag als „nicht gebucht" offen.
 */
export function werktageImZeitraum(workDays: number[], von: Date, bis: Date): string[] {
  const tage: string[] = [];
  const start = new Date(von);
  start.setHours(0, 0, 0, 0);
  const ende = new Date(bis);
  ende.setHours(0, 0, 0, 0);
  for (const tag = new Date(start); tag <= ende; tag.setDate(tag.getDate() + 1)) {
    if (workDays.includes(tag.getDay()) && !isAustrianHoliday(tag)) {
      tage.push(localDateStr(tag));
    }
  }
  return tage;
}

/**
 * Arbeitstage zwischen zwei ISO-Daten — die Form, in der Antrag und
 * Genehmigung fragen.
 *
 * Ein verdrehter Zeitraum liefert nichts: das ist ein Tippfehler, kein Urlaub
 * rückwärts.
 */
export function urlaubsTage(
  workDays: number[] | undefined,
  vonIso: string,
  bisIso: string,
): string[] {
  if (!vonIso || !bisIso) return [];
  const von = new Date(`${vonIso}T00:00:00`);
  const bis = new Date(`${bisIso}T00:00:00`);
  if (Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime()) || bis < von) return [];
  return werktageImZeitraum(workDays && workDays.length ? workDays : [1, 2, 3, 4, 5], von, bis);
}
