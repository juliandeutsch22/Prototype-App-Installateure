/**
 * Liegenschaften, Tops und Beteiligte (M02c, A09) — nur die Weiche, siehe `pg/liegenschaften.ts`.
 */
export {
  AKTE_GRENZE,
  LIEGENSCHAFT_SEITE,
  beteiligterAendern,
  beteiligterAnlegen,
  beteiligterEntfernen,
  beteiligterZuKunde,
  getLiegenschaft,
  liegenschaftAendern,
  liegenschaftAnlegen,
  liegenschaftLoeschen,
  listBaustellenDerLiegenschaft,
  listBeteiligte,
  listBeteiligungenDesKunden,
  listLiegenschaften,
  listLiegenschaftenByIds,
  listTops,
  listWartungenDerLiegenschaft,
  topAendern,
  topAnlegen,
  topLoeschen,
} from './pg/liegenschaften';
export type {
  BeteiligterEingabe,
  LiegenschaftEingabe,
  LiegenschaftSeite,
  LiegenschaftZeiger,
  TopEingabe,
} from './pg/liegenschaften';
