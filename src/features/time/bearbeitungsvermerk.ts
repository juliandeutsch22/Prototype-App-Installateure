import type { TimeEntry } from '@/types';

/**
 * Der Vermerk, den ein Eintrag bekommt, wenn ihn nicht sein Eigentümer
 * schreibt — die Buchhaltung erfasst für einen Kranken, die Chefin korrigiert
 * einen Vertipper.
 *
 * EINE STELLE, WEIL ES ZWEI GIBT, DIE IHN SCHREIBEN (Anlegen und Ändern in
 * `TimeForm`), und weil die Datenbankprüfung genau diesen Vermerk durch die
 * echte Datenschicht schickt. Bis zum 23.09.2026 stand hier zusätzlich
 * `lastEditedAt` — ein Feld aus der Firestore-Zeit, zu dem es in Postgres
 * keine Spalte gibt. Jede Fremdbuchung wurde damit abgewiesen, und das
 * Ausgangsfach hielt die Abweisung für fehlendes Netz: „gespeichert, wird
 * gesendet", und dann nichts. Wann geändert wurde, steht in `updated_at`.
 */
export function bearbeitungsvermerk(
  bearbeiter: { uid: string; name: string },
): Pick<TimeEntry, 'lastEditedBy' | 'lastEditedByUid'> {
  return { lastEditedBy: bearbeiter.name, lastEditedByUid: bearbeiter.uid };
}
