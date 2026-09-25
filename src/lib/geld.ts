/**
 * BETRÄGE — EIN ORT, DREI NAMEN.
 *
 * Bis zum 25.09.2026 hatte jede Ansicht und jeder Beleg ein eigenes
 * `fmtEUR`, elf Kopien: fünf mit vorangestelltem „€“, fünf ohne, eine
 * ganzzahlige. Zwei gleichnamige Funktionen mit verschiedenem Verhalten
 * waren eine Falle — wer aus der Nachbardatei abschrieb, hängte ein zweites
 * Eurozeichen an („€ 22 104,60 €“, gesehen auf einer Mahnlauf-Karte).
 *
 * Jetzt sagt der Name, was herauskommt. Die Rechnung dahinter ist dieselbe
 * wie in jeder Kopie vorher (`Intl.NumberFormat('de-AT', …)`); Belege und
 * Anzeige ändern sich dadurch um kein Zeichen.
 */

const ZWEI_STELLEN = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const GANZ = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });

/** „8 904,00“ — ohne Zeichen: für Belege und Tabellen, die „€“ selbst setzen. */
export function betrag(n: number): string {
  return ZWEI_STELLEN.format(n);
}

/** „€ 8 904,00“ — mit dem Zeichen VORN, wie überall in der Oberfläche. */
export function euro(n: number): string {
  return `€ ${ZWEI_STELLEN.format(n)}`;
}

/** „€ 8 904“ — auf ganze Euro gerundet, für die Kennzahlen der Startseite. */
export function euroGanz(n: number): string {
  return `€ ${GANZ.format(n)}`;
}
