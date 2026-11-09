import type { Quote } from '@/types';

/**
 * DIE RÜCKFRAGE VOR DEM VERWERFEN (M01d) — in der Liste und auf der
 * Angebotsseite derselbe Satz: was passiert und wie man zurückkommt.
 *
 * Bis M01d stand hier „wird entfernt“, und das Angebot war hart gelöscht.
 * Jetzt landet es im Papierkorb; gelöscht wird erst dort, mit eigener
 * Rückfrage.
 */
export function verwerfenFrage(
  q: Pick<Quote, 'quoteNumber' | 'customerName'>,
  /**
   * Der Auftragseingang, aus dem das Angebot entstand (Befund 09.11.2026):
   * er bleibt „übernommen“ und lässt sich danach wieder öffnen — das soll
   * vorher dastehen, damit die Anfrage nicht unbemerkt liegen bleibt.
   */
  eingang?: { nummer: string } | null,
): string {
  return `${q.quoteNumber} für ${q.customerName} kommt in den Papierkorb und verschwindet aus allen Angebotslisten. `
    + 'Unter Einstellungen · Papierkorb lässt es sich wiederherstellen; endgültig gelöscht wird es erst dort.'
    + (eingang
      ? ` Es entstand aus dem Eingang ${eingang.nummer}: Er bleibt übernommen und lässt sich dort wieder öffnen, um daraus ein neues Angebot oder eine Baustelle zu machen.`
      : '');
}

/** Die Meldungen nach Verwerfen und Wiederherstellen — überall dieselben. */
export const VERWORFEN_MELDUNG = 'In den Papierkorb gelegt';
export const WIEDERHERGESTELLT_MELDUNG = 'Wiederhergestellt — wieder ein Entwurf';
