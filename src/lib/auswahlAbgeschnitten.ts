/**
 * WAS EIN AUSWAHLFELD VON SEINER WAHL VERSCHLUCKT (Testbericht Runde 6, G14).
 *
 * Ein `<select>` bricht seinen Text nicht um. Im Seitenfenster des Termins
 * (398 px) und am Handy stand von „CT Bau GmbH (Claude-Test) (PR-2026-0193)“
 * nur „… (PR-2026-019…“ — ausgerechnet die Nummer, die zwei Baustellen eines
 * Kunden unterscheidet. Gemessen wird der Text der gewählten Option in der
 * Schrift des Feldes gegen den Platz zwischen Polster und Pfeil. Passt er
 * nicht, liefert die Funktion ihn, damit ihn der Aufrufer ganz zeigen kann.
 *
 * Ohne Layout (Feld unsichtbar, Prüfumgebung ohne Darstellung) ist nichts
 * abgeschnitten: dann gibt es nichts zu messen, und eine Zeile „auf Verdacht“
 * stünde doppelt unter einem Feld, das alles zeigt.
 */

/** Der native Pfeil eines Auswahlfelds samt Abstand — in Chrome, Firefox und Safari um 20 px. */
const PFEIL_PX = 24;

let leinwand: HTMLCanvasElement | null = null;

export function abgeschnittenerText(feld: HTMLSelectElement | null): string | null {
  if (!feld || !feld.value) return null;
  const text = feld.options[feld.selectedIndex]?.text ?? '';
  if (!text || feld.clientWidth === 0) return null;
  const stil = getComputedStyle(feld);
  leinwand ??= document.createElement('canvas');
  const ctx = leinwand.getContext('2d');
  if (!ctx) return null;
  ctx.font = `${stil.fontWeight} ${stil.fontSize} ${stil.fontFamily}`;
  const frei = feld.clientWidth - parseFloat(stil.paddingLeft || '0') - parseFloat(stil.paddingRight || '0') - PFEIL_PX;
  return ctx.measureText(text).width > frei ? text : null;
}
