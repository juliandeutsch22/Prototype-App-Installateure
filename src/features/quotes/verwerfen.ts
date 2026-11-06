import type { Quote } from '@/types';

/**
 * DIE RÜCKFRAGE VOR DEM VERWERFEN (M01d) — in der Liste und auf der
 * Angebotsseite derselbe Satz: was passiert und wie man zurückkommt.
 *
 * Bis M01d stand hier „wird entfernt“, und das Angebot war hart gelöscht.
 * Jetzt landet es im Papierkorb; gelöscht wird erst dort, mit eigener
 * Rückfrage.
 */
export function verwerfenFrage(q: Pick<Quote, 'quoteNumber' | 'customerName'>): string {
  return `${q.quoteNumber} für ${q.customerName} kommt in den Papierkorb und verschwindet aus allen Angebotslisten. `
    + 'Unter Einstellungen · Papierkorb lässt es sich wiederherstellen; endgültig gelöscht wird es erst dort.';
}

/** Die Meldungen nach Verwerfen und Wiederherstellen — überall dieselben. */
export const VERWORFEN_MELDUNG = 'In den Papierkorb gelegt';
export const WIEDERHERGESTELLT_MELDUNG = 'Wiederhergestellt — wieder ein Entwurf';
