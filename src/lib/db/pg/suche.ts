/**
 * Suchbegriffe für PostgREST entschärfen.
 *
 * WARUM DAS EINE EIGENE DATEI IST. Eine Suche über mehrere Spalten geht in
 * PostgREST über `or(...)`, und dessen Syntax ist eine Zeichenkette: Bedingungen
 * durch KOMMAS getrennt, Gruppen in KLAMMERN. Ein Kundenname wie „Huber,
 * Franz" zerreisst diesen Baum — gemessen, nicht vermutet:
 *
 *     failed to parse logic tree ((name.ilike.%Huber,%,address.ilike.%Huber,%))
 *
 * Das ist der gutmütige Ausgang: es kommt ein Fehler. Der andere ist
 * schlimmer — ein Begriff, der den Baum nicht zerreisst, sondern UMBAUT, und
 * dann eine Bedingung mehr oder weniger enthält, als jemand getippt hat.
 *
 * Und ein zweites: `%` und `_` sind in `ilike` Jokerzeichen. Wer nach „50%"
 * sucht, meint das Prozentzeichen und nicht „alles, was mit 50 beginnt".
 */

/**
 * Der Suchbegriff als `ilike`-Muster — mit entschärften Jokerzeichen.
 *
 * Die Reihenfolge zählt: erst der Rückstrich, dann die Joker. Umgekehrt
 * verdoppelte der zweite Durchgang die Rückstriche, die der erste gerade
 * gesetzt hat.
 */
export function ilikeMuster(begriff: string): string {
  const entschaerft = begriff
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, '\\$&');
  return `%${entschaerft}%`;
}

/**
 * Ein Wert, wie ihn `or(...)` verträgt: in Anführungszeichen, mit
 * entschärften Anführungszeichen und Rückstrichen darin.
 *
 * Ohne die Anführungszeichen reicht ein Komma im Namen, um die Suche
 * unbrauchbar zu machen.
 */
export function alsOderWert(muster: string): string {
  return `"${muster.replace(/["\\]/g, '\\$&')}"`;
}

/**
 * Die `or`-Bedingung für eine Suche über mehrere Spalten.
 *
 * Leerer Begriff gibt `null` zurück und nicht etwa `%%`: „nichts gesucht"
 * heisst „alles zeigen", und das ist eine andere Abfrage, keine mit einem
 * Muster, das zufällig auf alles passt.
 */
export function oderUeberSpalten(spalten: string[], begriff: string): string | null {
  const sauber = begriff.trim();
  if (!sauber) return null;
  const wert = alsOderWert(ilikeMuster(sauber));
  return spalten.map((s) => `${s}.ilike.${wert}`).join(',');
}
