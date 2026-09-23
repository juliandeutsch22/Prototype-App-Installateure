/**
 * Krankmeldungen und Betriebsurlaub — nur die Weiche.
 *
 * Beide schreiben Tage ins Zeitkonto und tun das serverseitig, siehe
 * `pg/abwesenheiten.ts`.
 */
export {
  listEigeneKrankmeldungen,
  listKrankmeldungenAb,
  krankmeldungSpeichern,
  krankmeldungLoeschen,
  listBetriebsurlaubeAb,
  listBetriebsurlaubeImZeitraum,
  betriebsurlaubAnlegen,
  betriebsurlaubLoeschen,
} from './pg/abwesenheiten';
export type { KrankmeldungErgebnis, BetriebsurlaubErgebnis } from './pg/abwesenheiten';
