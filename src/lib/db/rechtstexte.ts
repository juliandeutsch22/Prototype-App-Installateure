/**
 * Rechtstexte — nur die Weiche, siehe `pg/rechtstexte.ts`.
 */
export {
  rechtstexteAktuell, rechtstextVerlauf, rechtstextEntwurfSpeichern, rechtstextEntwurfVerwerfen,
  rechtstextVeroeffentlichen, verarbeiterAenderungen, verarbeiterZurKenntnisNehmen,
} from './pg/rechtstexte';
export type { RechtstextZeile, VerarbeiterAenderung } from './pg/rechtstexte';
