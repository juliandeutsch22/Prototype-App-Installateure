/**
 * Der Zustand der nächtlichen Läufe — nur die Weiche.
 *
 * Gelesen wird, geschrieben nicht: eine Überwachung, die der Überwachte
 * selbst beschreiben kann, überwacht nichts. „Nicht da" heisst „von diesem
 * Lauf ist nichts bekannt" und ausdrücklich NICHT „alles in Ordnung".
 */
import type { Lauf, LaufArt } from '@shared/laufStatus';
import { nutztPostgres } from './quelle';
import * as fs from './fs/laeufe';
import * as pg from './pg/laeufe';

export function ladeLauf(companyId: string, art: LaufArt): Promise<Lauf | undefined> {
  return nutztPostgres() ? pg.ladeLauf(companyId, art) : fs.ladeLauf(companyId, art);
}
