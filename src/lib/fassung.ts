/**
 * Welche Fassung der App gerade läuft.
 *
 * Der Wert wird beim BAUEN eingesetzt (siehe `vite.config.ts`) und besteht
 * aus der Commit-Kennung und dem Zeitpunkt des Baus in Wiener Zeit.
 *
 * WOFÜR ES DA IST. Aus dem Betrieb gemeldet: „keine deiner Änderungen ist in
 * der App vorhanden." Der Deploy meldete Erfolg, das Telefon zeigte etwas
 * anderes — und niemand konnte nachsehen, welcher Stand dort tatsächlich
 * lief. Damit war jede Diagnose ein Ratespiel zwischen drei Möglichkeiten:
 * der Deploy kam nicht an, der Zwischenspeicher des Telefons hält eine alte
 * Fassung, oder die Änderung ist an eine Bedingung geknüpft, die gerade
 * nicht gilt. Eine Zeile mit Datum und Uhrzeit beantwortet die erste beiden
 * in einer Sekunde.
 *
 * Im Entwicklungsbetrieb und in den Tests gibt es den Wert nicht — dann
 * steht „Entwicklung" da, statt dass die App an einem fehlenden Bezeichner
 * scheitert.
 */
declare const __FASSUNG__: string | undefined;

export const FASSUNG: string =
  typeof __FASSUNG__ === 'string' && __FASSUNG__ !== '' ? __FASSUNG__ : 'Entwicklung';
