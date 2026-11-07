/**
 * Termine — nur die Weiche, siehe `pg/termine.ts`.
 */
export {
  listTermineImZeitraum,
  listTermineDerBaustelle,
  listTermineDesKunden,
  getTermin,
  terminAnlegen,
  terminAendern,
  terminLoeschen,
  nachZeit,
} from './pg/termine';
export type { TerminEingabe } from './pg/termine';
