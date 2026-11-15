/**
 * Datenauskunft je Person — nur die Weiche.
 *
 * Was hineingehört und wer sie bekommt, entscheidet die Datenbank; siehe
 * `pg/auskunft.ts`.
 */
import * as pg from './pg/auskunft';
import { personAuskunftDatei as inTeilen } from './pg/auszugTeile';

export type { Auskunft, AuskunftArt, LoeschBericht } from './pg/auskunft';
export type { AuszugDatei, Fortschritt } from './pg/auszugTeile';
/** In Teilen abgeholt (K4) — ohne die Grenze des Abrufs in einem Stück. */
export const personAuskunftDatei = inTeilen;
export const personLoeschen = pg.personLoeschen;
