/**
 * Der Entwurf eines Benutzerprofils — aus dem Datensatz in die Eingabefelder
 * und wieder zurück.
 *
 * WARUM EIN EIGENES MODUL. Zwei Masken bearbeiten dieselben Felder: die Liste
 * legt an, die Akte ändert. Stünden die Umrechnungen zweimal da, wären es
 * eines Tages zwei Auslegungen von „leer" — und genau daran hängen
 * Wochenstunden, Urlaubsanspruch und Startsaldo, also der Lohnzettel.
 */
import type { AppUser, Role } from '@/types';
import {
  DEFAULT_WEEKLY_HOURS,
  DEFAULT_VACATION_DAYS,
  DEFAULT_WORK_DAYS,
  type UserProfileInput,
} from '@/lib/db/benutzerVorgaben';
import { todayStr } from '@/lib/time';

/**
 * Die Wochentage, in der Reihenfolge, in der sie im Betrieb genannt werden —
 * Montag zuerst, Sonntag zuletzt. `Date.getDay()` zählt ab Sonntag; die
 * Werte folgen dem, die Reihenfolge nicht.
 *
 * Stand vorher in `UserMgmtView`. Die Akte braucht dieselbe Tabelle, und
 * zwei Kopien wären zwei Wochen.
 */
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'So' },
];

/**
 * Ein leeres Feld nimmt die Vorgabe, eine eingetippte 0 NICHT.
 *
 * `Number('')` ist `0` und endlich — ohne die ausdrückliche Prüfung auf die
 * leere Eingabe käme aus einem leeren Feld eine Null, und aus einer
 * eingetippten Null die Vorgabe. Beide Felder erlauben ausdrücklich `min="0"`:
 * wer null Wochenstunden einträgt (geringfügig, ruhendes Dienstverhältnis, die
 * Chefin selbst), bekam stillschweigend vierzig. Jeder Monat produziert danach
 * rund 170 Minusstunden, und die Zahl steht auf dem Lohnzettel.
 */
export function zahlOderVorgabe(eingabe: string, vorgabe: number): number {
  const n = Number(eingabe);
  return eingabe.trim() !== '' && Number.isFinite(n) ? n : vorgabe;
}

/** Leeres Feld heisst „nicht angegeben" — und das ist nicht dasselbe wie 0. */
export function zahlOderNull(eingabe: string): number | null {
  const n = Number(eingabe);
  return eingabe.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** Was das Formular hält: alles als Zeichenkette, so wie ein `<input>` liefert. */
export interface BenutzerEntwurf {
  name: string;
  email: string;
  role: Role;
  active: boolean;
  weeklyTargetHours: string;
  yearlyVacationDays: string;
  appStartDate: string;
  initialOvertime: string;
  initialVacationDays: string;
  workDays: number[];
}

export function leererEntwurf(): BenutzerEntwurf {
  return {
    name: '',
    email: '',
    role: 'Mitarbeiter',
    active: true,
    weeklyTargetHours: String(DEFAULT_WEEKLY_HOURS),
    yearlyVacationDays: String(DEFAULT_VACATION_DAYS),
    // Ohne Startdatum bliebe der Saldo dauerhaft „nicht konfiguriert".
    appStartDate: todayStr(),
    initialOvertime: '0',
    /*
      LEER UND NICHT VORBELEGT. Beim Überstundensaldo ist 0 die richtige
      Vorgabe — wer nichts angibt, bringt nichts mit. Beim Urlaub wäre 0 die
      Behauptung „hat dieses Jahr keinen Tag mehr" und würde jeden Antrag
      rechnerisch ins Minus schicken.
    */
    initialVacationDays: '',
    workDays: DEFAULT_WORK_DAYS,
  };
}

export function alsEntwurf(u: AppUser): BenutzerEntwurf {
  return {
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active !== false,
    weeklyTargetHours: String(u.weeklyTargetHours ?? DEFAULT_WEEKLY_HOURS),
    yearlyVacationDays: String(u.yearlyVacationDays ?? DEFAULT_VACATION_DAYS),
    appStartDate: u.appStartDate ?? todayStr(),
    initialOvertime: String(u.initialOvertime ?? 0),
    initialVacationDays:
      u.initialVacationDays === null || u.initialVacationDays === undefined
        ? ''
        : String(u.initialVacationDays),
    workDays: u.workDays ?? DEFAULT_WORK_DAYS,
  };
}

/** Aus dem Entwurf wird das, was in die Datenbank geht. */
export function alsProfil(e: BenutzerEntwurf): UserProfileInput {
  return {
    name: e.name,
    email: e.email,
    role: e.role,
    active: e.active,
    weeklyTargetHours: zahlOderVorgabe(e.weeklyTargetHours, DEFAULT_WEEKLY_HOURS),
    yearlyVacationDays: zahlOderVorgabe(e.yearlyVacationDays, DEFAULT_VACATION_DAYS),
    appStartDate: e.appStartDate || null,
    initialOvertime: zahlOderVorgabe(e.initialOvertime, 0),
    initialVacationDays: zahlOderNull(e.initialVacationDays),
    // Eine leere Auswahl wäre ein Tagessoll von „Wochenstunden durch null".
    workDays: e.workDays.length ? e.workDays : DEFAULT_WORK_DAYS,
  };
}

/**
 * Hat sich wirklich etwas geändert?
 *
 * Feldweise statt über `JSON.stringify` — die Schlüsselreihenfolge eines
 * Objekts ist kein Vertrag. Die Arbeitstage werden als MENGE verglichen: wer
 * einen Tag abwählt und wieder anwählt, hat nichts geändert.
 */
export function gleich(a: BenutzerEntwurf, b: BenutzerEntwurf): boolean {
  return (Object.keys(a) as (keyof BenutzerEntwurf)[]).every((f) => {
    const x = a[f];
    const y = b[f];
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) return false;
      const links = [...x].sort();
      const rechts = [...y].sort();
      return links.every((w, i) => w === rechts[i]);
    }
    return x === y;
  });
}
