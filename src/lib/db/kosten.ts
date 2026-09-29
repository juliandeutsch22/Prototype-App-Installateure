/**
 * Kostensätze und Einkaufspreise — nur die Weiche.
 *
 * Wer sie lesen darf, entscheidet die Datenbank; siehe `pg/kosten.ts`.
 */
import * as pg from './pg/kosten';

export type { Kostensaetze } from './pg/kosten';
export const kostensaetze = pg.kostensaetze;
export const einkaufspreise = pg.einkaufspreise;
