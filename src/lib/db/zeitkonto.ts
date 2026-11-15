/**
 * Das Zeitkonto aus der Datenbank — nur die Weiche, siehe `pg/zeitkonto.ts`.
 */
export {
  zeitkontoSalden, zeitkontoSaldo, zeitkontoMonate,
  arbeitszeitAendern, arbeitszeitAenderungEntfernen,
  urlaubsanspruchAendern, urlaubsanspruchAenderungEntfernen,
} from './pg/zeitkonto';
export type { ZeitkontoMonat } from './pg/zeitkonto';
