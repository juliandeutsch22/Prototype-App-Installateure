/**
 * Lieferantenartikel, Preisvergleich und Preisverlauf (M03a) — nur die
 * Weiche, siehe `pg/lieferantenartikel.ts`.
 */
export {
  artikelVergleich,
  preisverlauf,
  offeneLieferantenartikel,
  zuordnen,
  alsNeuerArtikel,
  loesen,
  lieferantenNummern,
} from './pg/lieferantenartikel';
export type {
  Zuordnung,
  VerifiziertDurch,
  VergleichZeile,
  Vergleich,
  VerlaufZeile,
  Vorschlag,
  OffenerLieferantenartikel,
} from './pg/lieferantenartikel';
