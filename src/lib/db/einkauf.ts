/**
 * Lager und Einkauf — nur die Weiche.
 *
 * Die Ansichten fragen hier, nicht in `pg/`: so bleibt es eine Stelle, an der
 * man sieht, was die App mit diesen Daten tut.
 */
export {
  listGrosshaendler,
  grosshaendlerSpeichern,
  ausLager,
  aufEinkaufsliste,
  vonEinkaufslisteNehmen,
  grosshaendlerZuordnen,
  alsBestelltMarkieren,
  geliefert,
  katalogFuer,
  lieferantVorschlag,
} from './pg/einkauf';
export type { Grosshaendler, GrosshaendlerDaten } from './pg/einkauf';
