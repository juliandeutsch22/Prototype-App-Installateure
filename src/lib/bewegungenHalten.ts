import { zeilenflussHalten } from './zeilenfluss';
import { unterlinieHalten } from './unterlinie';
import { platzhalterHalten } from './platzhalter';
import { aufklappenHalten } from './aufklappen';
import { feldfehlerHalten } from './feldfehler';

// Die untere Leiste liegt außerhalb der Inhaltsspalte; Layout und Plattform halten ihren Beobachter selbst (E95).
export { untenGleitenHalten } from './untenGleiten';

/**
 * DIE BEOBACHTER DER BEWEGUNGEN, ZUSAMMEN (Plan 15.11.2026, Abschnitt 4).
 *
 * Zeilen gehen und kommen (B2, B3), die Unterlinie gleitet (B5), Platzhalter
 * gehen in Inhalt über (B8), Aufklappen gleitet (B10), Fehler am Feld (B11) —
 * je ein Beobachter über der Inhaltsspalte, für jede Seite, ohne dass eine
 * Seite davon wissen muss.
 *
 * NACH DEM ERSTEN BILD GELADEN (`Layout`, dynamischer Import): keiner davon
 * wird gebraucht, bevor die Seite steht. Fest eingebunden kosteten sie vor
 * dem ersten Bild 3,6 KB mehr (Bauprotokoll, Leistungswächter L11: 273,2 statt
 * 269,6 KB).
 */
export function bewegungenHalten(main: HTMLElement): () => void {
  const abmelden = [
    zeilenflussHalten(main),
    unterlinieHalten(main),
    platzhalterHalten(main),
    aufklappenHalten(main),
    feldfehlerHalten(main),
  ];
  return () => { for (const ab of abmelden) ab(); };
}
