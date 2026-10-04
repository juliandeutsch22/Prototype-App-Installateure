/**
 * Termine — nur die Weiche, siehe `pg/termine.ts`.
 */
export {
  listTermineImZeitraum,
  listTermineDerBaustelle,
  listTermineDesKunden,
  terminAnlegen,
  terminAendern,
  terminLoeschen,
  nachZeit,
} from './pg/termine';
export type { TerminEingabe } from './pg/termine';
