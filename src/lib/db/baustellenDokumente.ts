/**
 * Pläne und Dokumente an der Baustelle — nur die Weiche.
 *
 * Die Ansichten fragen hier, nicht in `pg/`: so bleibt es eine Stelle, an der
 * man sieht, was die App mit diesen Daten tut.
 */
export {
  listDokumente,
  dokumentHochladen,
  dokumentAdresse,
  dokumentBild,
  dokumentLoeschen,
  dokumentNurBueroSetzen,
  dateiPruefen,
  dateiTyp,
  ERLAUBTE_TYPEN,
  HOECHSTENS_BYTES,
  OEFFNEN_SEKUNDEN,
} from './pg/baustellenDokumente';
