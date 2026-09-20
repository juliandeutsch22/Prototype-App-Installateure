/**
 * Kontenrahmen — nur die Weiche.
 *
 * Wer ihn pflegen darf, sagt die Datenbank: Administrator,
 * Geschäftsführung und Buchhaltung. Die Buchhaltung ist hier ausdrücklich
 * dabei, obwohl sie sonst keine Betriebseinstellungen ändert — sie ist die
 * Rolle, die mit der Kanzlei spricht.
 */
import * as pg from './pg/konten';

export type { Buchungskonto } from './pg/konten';
export const buchungskonten = pg.buchungskonten;
export const kontoAnlegen = pg.kontoAnlegen;
export const kontoAendern = pg.kontoAendern;
export const kontoLoeschen = pg.kontoLoeschen;
