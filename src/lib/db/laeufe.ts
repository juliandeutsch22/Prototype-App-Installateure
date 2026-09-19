/**
 * Der Zustand der nächtlichen Läufe — nur die Weiche.
 *
 * Gelesen wird, geschrieben nicht: eine Überwachung, die der Überwachte
 * selbst beschreiben kann, überwacht nichts. „Nicht da" heisst „von diesem
 * Lauf ist nichts bekannt" und ausdrücklich NICHT „alles in Ordnung".
 */
import type { Lauf, LaufArt } from '@shared/laufStatus';
import * as pg from './pg/laeufe';

export function ladeLauf<A extends LaufArt>(
  companyId: string, art: A,
): Promise<Lauf<A> | undefined> {
  return pg.ladeLauf(companyId, art);
}

/**
 * Die Sicherung sofort erstellen.
 *
 * Dieselbe Edge Function, die nachts läuft — zwei Wege hinein, weil es zwei
 * Fragen sind: der Zeitplan ruft mit dem Dienstschlüssel und nimmt alle
 * Betriebe, der Knopf mit dem Token eines Menschen und nimmt nur dessen
 * eigenen. Zwei getrennte Fassungen wären zwei Gelegenheiten, dass die eine
 * ausleitet, was die andere auslässt.
 */
export function ausleitungJetzt(): Promise<pg.AusleitungsBilanz> {
  return pg.ausleitungJetzt();
}

export type { AusleitungsBilanz } from './pg/laeufe';
