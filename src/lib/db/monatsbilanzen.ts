/**
 * Monatsbilanzen.
 *
 * FRÜHER EIN VORGERECHNETER BESTAND, HEUTE EINE SICHT. Der alte Weg legte je
 * Mitarbeiter und Monat ein Dokument ab, und eine fehlende Bilanz war von
 * einem Monat ohne Buchungen nicht zu unterscheiden — deshalb der
 * Vollständigkeits-Marker und der Rückfall auf die direkte Rechnung.
 *
 * `monthly_stats` rechnet bei jeder Abfrage neu und kann nicht unvollständig
 * sein. Der Marker steht trotzdem noch im Vertrag mit der Ansicht: sie fragt
 * ihn, er antwortet immer „vollständig", und der Rückfallweg bleibt damit
 * eine Zeile, die niemand mehr braucht und niemandem schadet.
 */
import * as pg from './pg/monatsbilanzen';

export type { Monatsbilanz } from './pg/monatsbilanzen';
import type { Monatsbilanz } from './pg/monatsbilanzen';

/** 'YYYY-MM' aus einem ISO-Datum. Reine Rechnung. */
export function monatVon(datum: string): string {
  return datum.slice(0, 7);
}

export function bilanzMarker(
  companyId: string, uid: string,
): Promise<{ vollstaendigAb: string } | null> {
  return pg.bilanzMarker(companyId, uid);
}

export function listBilanzen(
  companyId: string, uid: string, abMonat: string,
): Promise<Monatsbilanz[]> {
  return pg.listBilanzen(companyId, uid, abMonat);
}
