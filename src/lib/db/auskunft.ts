/**
 * Datenauskunft je Person — nur die Weiche.
 *
 * Was hineingehört und wer sie bekommt, entscheidet die Datenbank; siehe
 * `pg/auskunft.ts`.
 */
import * as pg from './pg/auskunft';

export type { Auskunft, AuskunftArt, LoeschBericht } from './pg/auskunft';
export const personAuskunft = pg.personAuskunft;
export const personLoeschen = pg.personLoeschen;
