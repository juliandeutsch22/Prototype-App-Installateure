/**
 * Muster für die Schreibweise im Sichtbaren (Testbericht 30.09.2026, G1):
 * TT.MM.JJJJ statt ISO-Datum, Dezimalkomma bei Mengen und Stunden, kein
 * doppelter Punkt nach einem Datum. Die Linkprüfung legt sie an den Text
 * jeder Seite je Rolle; `tests/unit/schreibweiseSichtbar.test.ts` hält sie
 * mit einer Gegenprobe scharf.
 */
export const SCHREIBWEISE: Array<[string, RegExp]> = [
  // Dateinamen und Nummern (`…_2026-09-01_…`, `PR-2026-0189`) sind Daten des Betriebs.
  ['ISO-Datum statt TT.MM.JJJJ', /(?<![\w-])20\d{2}-\d{2}-\d{2}(?![\w-])/],
  // „Tage?“ seit Runde 3 (G1): „Vorschlag für …: 5.96 Tage“ beim Anlegen.
  ['Dezimalpunkt statt Komma', /(?<![\d.])\d+\.\d{1,2}\s?(?:h|Std\.?|€|%|m|lfm|Stk|kg|l|Tage?)(?![\wäöü])/],
  ['doppelter Punkt nach einem Datum', /\d{2}\.\d{2}\.(?:\d{4}\.)?\./],
];
