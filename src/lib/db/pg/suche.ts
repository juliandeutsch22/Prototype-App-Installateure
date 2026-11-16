/**
 * Suchbegriffe entschärfen.
 *
 * `%` und `_` sind in `ilike` Jokerzeichen. Wer nach „50%" sucht, meint das
 * Prozentzeichen und nicht „alles, was mit 50 beginnt".
 *
 * SEIT DER NACHARBEIT ZU L3 (Durchsicht 15.11.2026) baut die App keine
 * `or(…ilike…)`-Bedingung für PostgREST mehr: mit Zeilenschutz wertete
 * Postgres sie nie über einen Index aus. Gesucht wird über die Funktionen
 * `katalog_suchen` und `suche_<tabelle>`; sie entschärfen den Begriff selbst,
 * nach derselben Regel. Hier bleibt das Entschärfen für die fertigen Muster,
 * die die App schickt (`katalogNachNamen`, `kundenNachNamen`).
 */

/**
 * Der Begriff mit entschärften Jokerzeichen, ohne umgebende `%`.
 *
 * Die Reihenfolge zählt: erst der Rückstrich, dann die Joker. Umgekehrt
 * verdoppelte der zweite Durchgang die Rückstriche, die der erste gerade
 * gesetzt hat.
 */
export function ohneJoker(begriff: string): string {
  return begriff
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, '\\$&');
}
