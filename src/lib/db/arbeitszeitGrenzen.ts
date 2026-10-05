/**
 * Geburtsdatum und Begründungen zu den Arbeitszeitgrenzen — nur die Weiche,
 * siehe `pg/arbeitszeitGrenzen.ts`.
 */
export {
  listGeburtsdaten,
  getGeburtsdatum,
  setGeburtsdatum,
  listBegruendungen,
  setBegruendung,
  removeBegruendung,
} from './pg/arbeitszeitGrenzen';
export type { Begruendung } from './pg/arbeitszeitGrenzen';
