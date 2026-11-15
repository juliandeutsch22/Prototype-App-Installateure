/**
 * Das Zeitkonto aus der Datenbank — nur die Weiche, siehe `pg/zeitkonto.ts`.
 */
export {
  zeitkontoSalden, zeitkontoSaldo, zeitkontoMonate,
  arbeitszeitAendern, arbeitszeitAenderungEntfernen,
  urlaubsanspruchAendern, urlaubsanspruchAenderungEntfernen,
  austrittFolgen, zeitsitzungBeendenFuer,
  listMonatsabschluesse, monatAbschliessen, monatOeffnen,
} from './pg/zeitkonto';
export type { ZeitkontoMonat, AustrittFolgen, Monatsabschluss } from './pg/zeitkonto';
import type { Monatsabschluss } from './pg/zeitkonto';

/**
 * Der jüngste Eintrag je Monat — der Stand, der gilt (Z6). Reine Rechnung,
 * damit Zeiterfassung und Mitarbeiterübersicht dieselbe Antwort geben.
 */
export function abschlussStand(verlauf: readonly Monatsabschluss[]): Map<string, Monatsabschluss> {
  const stand = new Map<string, Monatsabschluss>();
  for (const e of [...verlauf].sort((a, b) => (a.am < b.am ? 1 : a.am > b.am ? -1 : 0))) {
    if (!stand.has(e.monat)) stand.set(e.monat, e);
  }
  return stand;
}

/** Die abgeschlossenen Monate ('YYYY-MM') — leer, wenn der Betrieb keinen Monatsabschluss führt. */
export function abgeschlosseneMonate(verlauf: readonly Monatsabschluss[], an: boolean): Set<string> {
  if (!an) return new Set();
  return new Set([...abschlussStand(verlauf).values()].filter((e) => e.aktion === 'abgeschlossen').map((e) => e.monat));
}
