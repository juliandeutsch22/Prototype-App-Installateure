/**
 * Sonderurlaub, Pflegefreistellung, unbezahlter Urlaub — nur die Weiche,
 * siehe `pg/freistellungen.ts`.
 */
export {
  listEigeneFreistellungen,
  listOffeneFreistellungen,
  listFreistellungenVon,
  listBestaetigteFreistellungenAb,
  freistellungBeantragen,
  nachweisPruefen,
  nachweisHochladen,
  nachweisAdresse,
  nachweisEntfernen,
  freistellungZurueckziehen,
  freistellungEntscheiden,
  nachweiseAufraeumen,
  NACHWEIS_HOECHSTENS_BYTES,
} from './pg/freistellungen';
export type { FreistellungAntrag, FreistellungErgebnis } from './pg/freistellungen';
