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
/*
 * GESETZT VOM EINSTIEG, NICHT HIER EINGEBAUT (L7, 17.11.2026). Der Wert
 * trägt die Uhrzeit des Baus und ist damit bei jedem Bau ein anderer. Stand
 * er in diesem Modul, änderte sich mit jedem Bau der gemeinsame Baustein —
 * und mit ihm jeder Baustein, der ihn einbindet: gemessen 182 von 230, auch
 * ohne eine einzige geänderte Zeile. `src/main.tsx` (der Einstieg, den
 * niemand einbindet) setzt ihn vor allem anderen; gelesen wird er erst beim
 * Zeichnen oder bei einem Fehler, über die lebendige Bindung des Exports.
 */
export let FASSUNG = 'Entwicklung';

export function fassungSetzen(wert: string | undefined): void {
  if (typeof wert === 'string' && wert !== '') FASSUNG = wert;
}
