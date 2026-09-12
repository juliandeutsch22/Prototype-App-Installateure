/**
 * Monatsbilanzen — nur die Weiche.
 *
 * Unter Firestore ein nächtlich vorgerechneter Bestand, der unvollständig
 * sein konnte; deshalb der Vollständigkeits-Marker und der Rückfall auf die
 * direkte Rechnung. Unter Postgres eine Sicht über die Zeitbuchungen, die
 * nicht unvollständig sein kann. Die Ansicht merkt den Unterschied nicht —
 * sie fragt in beiden Fällen denselben Marker.
 */
import { nutztPostgres } from './quelle';
import * as fs from './fs/monatsbilanzen';
import * as pg from './pg/monatsbilanzen';

export type { Monatsbilanz } from './fs/monatsbilanzen';
import type { Monatsbilanz } from './fs/monatsbilanzen';

/** 'YYYY-MM' aus einem ISO-Datum. Reine Rechnung, für beide Datenquellen. */
export function monatVon(datum: string): string {
  return datum.slice(0, 7);
}

export function bilanzMarker(
  companyId: string, uid: string,
): Promise<{ vollstaendigAb: string } | null> {
  return nutztPostgres() ? pg.bilanzMarker(companyId, uid) : fs.bilanzMarker(companyId, uid);
}

export function listBilanzen(
  companyId: string, uid: string, abMonat: string,
): Promise<Monatsbilanz[]> {
  return nutztPostgres()
    ? pg.listBilanzen(companyId, uid, abMonat)
    : fs.listBilanzen(companyId, uid, abMonat);
}
