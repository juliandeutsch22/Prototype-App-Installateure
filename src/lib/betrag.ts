/**
 * Geldbeträge, wie die App sie schreibt — an EINER Stelle (offene Punkte B9).
 *
 * VIER NAMEN FÜR VIER FORMEN, und das ist der Kern. Vorher hiess alles
 * `fmtEUR`, in elf Dateien, mal mit vorangestelltem Zeichen und mal ohne.
 * Wer aus der Nachbardatei abschrieb, erwischte die falsche Hälfte, und auf
 * der Mahnlauf-Karte stand „€ 22 104,60 € offen". Jetzt sagt der Name, was
 * herauskommt — `tests/unit/eurozeichen.test.ts` hält die Aufrufer daran.
 */

/**
 * Kaufmännisch auf `stellen` Nachkommastellen — wie Postgres
 * `round(numeric, stellen)` (Durchsicht 15.11.2026, G7).
 *
 * GERUNDET WIRD DER DEZIMALWERT, nicht die Gleitkommazahl. 4,25 × 72,30 ist
 * 307,275; im Speicher steht 307,27499999999998 — `Math.round(n * 100)`
 * machte daraus 307,27, die Datenbank 307,28. Deshalb zuerst auf 15 gültige
 * Stellen: so viele trägt eine Gleitkommazahl sicher, und genau so wandelt
 * Postgres `float8` in `numeric`. Danach halbe Einheiten weg von der Null
 * (−2,675 → −2,68), mit ganzen Zahlen gerechnet — ohne erneuten
 * Gleitkommafehler.
 *
 * DIE GRENZE: ein Ergebnis, das wirklich mehr als 15 gültige Stellen hat
 * (Zinsen über Tage durch 365), wird auf 15 Stellen gelesen. Dort gibt es
 * keinen exakten Dezimalwert, auf den man sich berufen könnte; Postgres
 * rechnete mit mehr Stellen und läge höchstens an einem solchen Rand anders.
 */
export function aufStellen(wert: number, stellen: number): number {
  /*
    Wie die alte Rundung mit Rechenzeichen gewandelt: ein fehlender Wert
    (undefined) wird NaN, null wird 0. Ein durchgereichtes `undefined` ließe
    `.toFixed()` dahinter abstürzen (gemessen in der E-Rechnung, 15.11.2026).
  */
  const n = +wert;
  if (!Number.isFinite(n)) return n;
  if (n === 0) return 0;
  const [ziffern, hoch] = Math.abs(n).toExponential(14).split('e');
  // Wert × 10^stellen = Mantisse (15 Ziffern, ganzzahlig) × 10^verschiebung.
  const verschiebung = Number(hoch) - 14 + stellen;
  if (verschiebung >= 0) return Math.sign(n) * Number(`${ziffern}e${hoch}`);
  const k = -verschiebung;
  // Die Mantisse ist kleiner als 10^15: ab 16 Stellen Abstand bleibt weniger als ein Zehntel.
  if (k > 15) return 0;
  const mantisse = Number(ziffern.replace('.', ''));
  const teiler = 10 ** k;
  const rest = mantisse % teiler;
  let ganz = (mantisse - rest) / teiler;
  if (rest * 2 >= teiler) ganz += 1;
  const betrag = ganz / 10 ** stellen;
  // Kein „−0“: in einer Summe oder einem Export stünde sonst „-0,00“.
  return n < 0 ? -betrag || 0 : betrag;
}

/**
 * Auf den Cent — DIE Rundung für Geld in der ganzen App. Zeile, Rabatt,
 * Umsatzsteuer, Skonto, Rücklass, Zinsen, Zahlstand, Nachkalkulation: alle
 * gehen hierüber, damit App, PDF und Datenbank denselben Cent nennen.
 * `tests/unit/geldRundungEinmal.test.ts` hält die Geldstellen davon ab,
 * wieder eigene Rundungen zu schreiben.
 */
export function cent(n: number): number {
  return aufStellen(n, 2);
}

const ZWEI_STELLEN = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BIS_VIER = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/*
  ZEICHEN UND ZAHL BLEIBEN ZUSAMMEN (09.11.2026, E72): zwischen „€“ und
  Betrag steht ein geschütztes Leerzeichen. Mit dem gewöhnlichen brach der
  Zahlungsdialog bei 834 px zu „offen €“ am Zeilenende und „22 104,60“ in
  der nächsten Zeile. Nur die Ansichten nutzen diese Formen; Belege und
  Exporte schreiben `euroBetrag`.
*/
const ZEICHEN = '€\u00a0';

/** „€ 1.234,56" — Betrag mit Zeichen davor, für die Ansichten. */
export function euro(n: number): string {
  return `${ZEICHEN}${ZWEI_STELLEN.format(n)}`;
}

/**
 * „1.234,56" — nur die Zahl. Für Belege und Tabellen, in denen das Zeichen
 * in der Spaltenüberschrift oder dahinter steht („60,00 €/h").
 */
export function euroBetrag(n: number): string {
  return ZWEI_STELLEN.format(n);
}

/**
 * „€ 0,4375" — Einzelpreis mit bis zu vier Nachkommastellen. Großhändler
 * rechnen Kleinteile auf Zehntelcent; auf zwei Stellen gerundet sähe der
 * Probelauf eines Katalogs anders aus als die Datei.
 */
export function euroPreis(n: number): string {
  return `${ZEICHEN}${BIS_VIER.format(n)}`;
}
