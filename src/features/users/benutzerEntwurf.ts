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
import { todayStr, urlaubsJahrVon, JAHRESBEGINN_VORGABE } from '@/lib/time';

/**
 * Was für ein Zugang hier entsteht — und es sind zwei verschiedene Dinge.
 *
 * `bestand`: die Person arbeitet schon im Betrieb, die App kommt dazu. Was
 * sie mitbringt (Resturlaub, Überstundensaldo), weiss nur das Büro; die App
 * kann es nicht ausrechnen und muss danach fragen.
 *
 * `neu`: die Person tritt ein. Sie bringt nichts mit — und genau hier sass
 * die Falle: wer das Feld „Resturlaub" leer liess, was naheliegt, weil ja
 * nichts mitzubringen ist, bekam den VOLLEN Jahresanspruch ab Tag eins. Wer
 * am 1. Oktober anfängt, hatte damit 25 Tage statt rund sechs. Das stand
 * nirgends und fiel erst auf, wenn jemand Urlaub einreicht, den er nicht hat.
 */
export type Eintrittsart = 'bestand' | 'neu';

/** Der Vorschlag für ein angebrochenes erstes Urlaubsjahr. */
export interface AliquoterAnspruch {
  /** Tage, auf zwei Stellen gerundet. */
  tage: number;
  /** Wie viele Monate des Urlaubsjahres noch übrig sind (1–12). */
  monate: number;
}

/**
 * Der aliquote Urlaubsanspruch für ein angebrochenes erstes Urlaubsjahr.
 *
 * WARUM DAS EIN VORSCHLAG IST UND KEINE REGEL. § 2 Abs 2 UrlG rechnet im
 * ersten ARBEITSJAHR aliquot und lässt den Anspruch nach sechs Monaten auf
 * das volle Ausmass springen. Ist das Urlaubsjahr durch Kollektivvertrag auf
 * das Kalenderjahr umgestellt, ist die übliche Praxis die Aliquotierung des
 * angebrochenen Jahres. Welche Variante im Einzelfall gilt, entscheidet der
 * Kollektivvertrag und nicht die Software. Eine erzwungene Zahl wäre eine
 * Rechtsauskunft, die diese App nicht geben kann — ein Vorschlag mit
 * offengelegter Rechnung ist ehrlich und im Zweifel zu korrigieren.
 *
 * GEZÄHLT WIRD IN GANZEN MONATEN, und der Eintrittsmonat zählt voll mit. Das
 * ist die für den Mitarbeiter günstige Lesart und die in Kollektivverträgen
 * übliche. Beginnt das Urlaubsjahr nicht am Monatsersten, wird die Zählung
 * dadurch grob — auch deshalb bleibt die Zahl änderbar.
 */
export function aliquoterAnspruch(
  jahresanspruch: number,
  eintritt: string,
  jahresbeginn: string = JAHRESBEGINN_VORGABE,
): AliquoterAnspruch {
  const jahr = urlaubsJahrVon(eintritt, jahresbeginn);
  const beginnMonat = Number(jahresbeginn.slice(0, 2));
  const vergangen = (Number(eintritt.slice(0, 4)) - jahr) * 12
    + (Number(eintritt.slice(5, 7)) - beginnMonat);
  const monate = Math.max(0, Math.min(12, 12 - vergangen));
  return { monate, tage: Math.round((jahresanspruch * monate) / 12 * 100) / 100 };
}

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
  /** Freigabe „Kunden pflegen“ — nur für Verwaltung und Buchhaltung angeboten. */
  kundenPflegen: boolean;
  /** Nur für die Geschäftsführung angeboten. */
  fuehrtZeitkonto: boolean;
}

/** Für welche Rollen der Haken „Kunden pflegen“ etwas bedeutet. */
export const mitKundenFreigabe = (r: Role) => r === 'Verwaltung' || r === 'Buchhaltung';
/** Für welche Rolle das Zeitkonto wählbar ist — die anderen legt die Rolle fest. */
export const mitZeitkontoWahl = (r: Role) => r === 'Geschäftsführung';

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
    kundenPflegen: false,
    fuehrtZeitkonto: false,
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
    kundenPflegen: u.kundenPflegen === true,
    fuehrtZeitkonto: u.fuehrtZeitkonto === true,
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
    /*
      NUR, WO DIE ROLLE ES ZULÄSST. Wird aus der Bürokraft ein Monteur, fällt
      die Freigabe mit — sonst lebte sie unsichtbar weiter und wäre nach einem
      Wechsel zurück plötzlich wieder da, ohne dass jemand sie erteilt hätte.
    */
    kundenPflegen: mitKundenFreigabe(e.role) && e.kundenPflegen,
    fuehrtZeitkonto: mitZeitkontoWahl(e.role) && e.fuehrtZeitkonto,
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
