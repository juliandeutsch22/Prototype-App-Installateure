/**
 * Supportzugang — nur die Weiche.
 *
 * Gewähren und widerrufen darf die Spitze des Betriebs, sehen darf ihn jeder
 * im Betrieb. Die Grenzen stehen in der Datenbank, nicht hier.
 */
import * as pg from './pg/support';

export type {
  SupportFreigabe, SupportZugriff, SupportBereich, SupportStufe, OffeneFreigabe,
} from './pg/support';
export const freigaben = pg.freigaben;
export const istOffen = pg.istOffen;
export const freigabeGeben = pg.freigabeGeben;
export const freigabeWiderrufen = pg.freigabeWiderrufen;
export const zugriffe = pg.zugriffe;
export const bereiche = pg.bereiche;
export const offeneFreigaben = pg.offeneFreigaben;
export const notzugang = pg.notzugang;
export const zugriffMelden = pg.zugriffMelden;
