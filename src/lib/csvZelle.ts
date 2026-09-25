/**
 * Ein Feld für eine CSV-Datei, die jemand in Excel öffnet.
 *
 * Trennzeichen ist das Semikolon (Excel im deutschen Sprachraum); ein Feld
 * mit Semikolon, Anführungszeichen oder Zeilenumbruch wird in
 * Anführungszeichen gesetzt, innere Anführungszeichen verdoppelt.
 *
 * FORMELN WERDEN ENTSCHÄRFT (Prüflauf 25.09.2026, P2-23). Ein Kundenname
 * wie „=HYPERLINK(…)" oder „@SUMME(…)" stand bisher unverändert in der Datei
 * — und Excel führt ihn beim Öffnen als Formel aus, in der Kanzlei, auf deren
 * Rechner. Ein Textfeld, das mit =, +, -, @, Tabulator oder Wagenrücklauf
 * beginnt, bekommt deshalb ein Hochkomma davor; Excel zeigt es als Text.
 *
 * ZAHLEN BLEIBEN, WIE SIE SIND. „-500,00" ist der Betrag einer Gegenbuchung
 * und keine Formel — mit Hochkomma davor wäre er in der Kanzlei Text, und
 * keine Summe ginge mehr auf.
 *
 * Eine Stelle für alle drei Exporte, die bisher je eine eigene Fassung
 * hatten: stünde die Entschärfung nur in zweien, wäre die dritte die Lücke.
 */
const REINE_ZAHL = /^[-+]?\d[\d.,]*$/;
const FORMELANFANG = /^[=+\-@\t\r]/;

export function csvZelle(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (FORMELANFANG.test(s) && !REINE_ZAHL.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
