/**
 * Vorgaben und Eingabeform für ein Benutzerprofil.
 *
 * WARUM EIGENES MODUL UND NICHT ZWEIMAL. Die Zahlen sind Regeln des Betriebs
 * und nicht der Datenbank: `DEFAULT_WEEKLY_HOURS` MUSS mit dem Fallback in
 * `lib/time.ts` (calcOverallSaldo) übereinstimmen — sonst rechnet ein Nutzer
 * ohne gesetzten Wert anders als ein neu angelegter. Stünden sie in `fs/` und
 * in `pg/` nebeneinander, wären es eines Tages zwei verschiedene Zahlen, und
 * das Zeitkonto hinge davon ab, welche Datenquelle gerade läuft.
 */
import type { Role } from '@/types';
import type { Einstufung } from '@/lib/einstufung';

export const DEFAULT_WEEKLY_HOURS = 40;
export const DEFAULT_VACATION_DAYS = 25;
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

/** Felder, die das Benutzerformular bearbeitet. */
export interface UserProfileInput {
  name: string;
  email: string;
  role: Role;
  active: boolean;
  weeklyTargetHours?: number;
  yearlyVacationDays?: number;
  workDays?: number[];
  appStartDate?: string | null;
  /** Echter Eintritt in den Betrieb — getrennt vom Saldo-Start (M6). */
  eintritt?: string | null;
  /** Stunden je Wochentag, `null` = gleichmässig (M5). */
  tagessoll?: Record<string, number> | null;
  initialOvertime?: number;
  /** Resturlaub am Startdatum. `null` = nicht angegeben (voller Jahresanspruch). */
  initialVacationDays?: number | null;
  /** Freigabe „Kunden pflegen“ (Verwaltung, Buchhaltung). */
  kundenPflegen?: boolean;
  katalogEinspielen?: boolean;
  einkaufSehen?: boolean;
  rechnungenLesen?: boolean;
  /** Nur Geschäftsführung: führt ein Zeitkonto. */
  fuehrtZeitkonto?: boolean;
  /** Einstufung (4.1) — `null` heisst nicht festgelegt, zählt wie Facharbeiter. */
  einstufung?: Einstufung | null;
  /** Nur beim Lehrling; sonst `null`. */
  lehrbeginn?: string | null;
  lehrzeitMonate?: number | null;
  /** Nur beim Lehrling bedeutsam: zählen seine Stunden ins Projekt-Budget? */
  stundenInsBudget?: boolean;
}
