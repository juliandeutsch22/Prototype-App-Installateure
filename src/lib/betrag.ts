/**
 * Geldbeträge, wie die App sie schreibt — an EINER Stelle (offene Punkte B9).
 *
 * VIER NAMEN FÜR VIER FORMEN, und das ist der Kern. Vorher hiess alles
 * `fmtEUR`, in elf Dateien, mal mit vorangestelltem Zeichen und mal ohne.
 * Wer aus der Nachbardatei abschrieb, erwischte die falsche Hälfte, und auf
 * der Mahnlauf-Karte stand „€ 22 104,60 € offen". Jetzt sagt der Name, was
 * herauskommt — `tests/unit/eurozeichen.test.ts` hält die Aufrufer daran.
 */

const ZWEI_STELLEN = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GANZ = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const BIS_VIER = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** „€ 1.234,56" — Betrag mit Zeichen davor, für die Ansichten. */
export function euro(n: number): string {
  return `€ ${ZWEI_STELLEN.format(n)}`;
}

/**
 * „1.234,56" — nur die Zahl. Für Belege und Tabellen, in denen das Zeichen
 * in der Spaltenüberschrift oder dahinter steht („60,00 €/h").
 */
export function euroBetrag(n: number): string {
  return ZWEI_STELLEN.format(n);
}

/** „€ 1.235" — auf ganze Euro gerundet, für Kennzahlen auf der Startseite. */
export function euroGerundet(n: number): string {
  return `€ ${GANZ.format(n)}`;
}

/**
 * „€ 0,4375" — Einzelpreis mit bis zu vier Nachkommastellen. Großhändler
 * rechnen Kleinteile auf Zehntelcent; auf zwei Stellen gerundet sähe der
 * Probelauf eines Katalogs anders aus als die Datei.
 */
export function euroPreis(n: number): string {
  return `€ ${BIS_VIER.format(n)}`;
}
