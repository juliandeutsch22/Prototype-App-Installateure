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
  lieferantVorschlagGrund,
  listLagerPosten,
  lagerPostenAnlegen,
  lagerPostenLoeschen,
  lagerPostenZuordnen,
  lagerPostenBestellt,
  lieferterminSetzen,
  artikelSuchen,
} from './pg/einkauf';
export type { Grosshaendler, GrosshaendlerDaten, NeuerLagerPosten, VorschlagGrund } from './pg/einkauf';
/** Die Nummern der Großhändler für die Bestellung (M03a) — siehe `pg/lieferantenartikel.ts`. */
export { lieferantenNummern } from './pg/lieferantenartikel';
