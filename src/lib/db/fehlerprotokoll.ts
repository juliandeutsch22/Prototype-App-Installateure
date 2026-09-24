/**
 * Fehlerprotokoll — nur die Weiche.
 *
 * Die Ansichten fragen hier, nicht in `pg/`: so bleibt es eine Stelle, an der
 * man sieht, was die App mit diesen Daten tut.
 */
export {
  fehlerEintragen,
  listFehlerprotokoll,
  plattformFehler,
  FEHLER_GRENZE,
} from './pg/fehlerprotokoll';
export type { NeuerFehlerEintrag, PlattformFehler } from './pg/fehlerprotokoll';
