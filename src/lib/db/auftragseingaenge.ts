/**
 * Auftragseingang (M02b) — nur die Weiche, siehe `pg/auftragseingaenge.ts`.
 */
export {
  EINGANG_SEITE,
  listEingaenge,
  zaehleOffeneEingaenge,
  getEingang,
  getEingangZu,
  listEingaengeDesKunden,
  eingangAnlegen,
  eingangAendern,
  eingangTerminSetzen,
  eingangLoeschen,
  eingangZuBaustelle,
  eingangZuAngebot,
  eingangAblehnen,
  eingangWiederOeffnen,
  eingangKundeAnlegen,
} from './pg/auftragseingaenge';
export type { EingangEingabe, EingangSeite, EingangZeiger } from './pg/auftragseingaenge';
