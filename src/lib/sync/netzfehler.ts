/**
 * Ein gescheiterter Aufruf, hinter dem fehlendes Netz steht (E49).
 *
 * Eigene Datei, weil zwei Stellen dieselbe Antwort brauchen: der Sender des
 * Ausgangsfachs (liegen lassen oder aufgeben?) und die Maske des Scheins
 * (ohne Netz nicht zu öffnen oder falsche Kennung?). Zwei Fassungen liefen
 * auseinander — genau so fehlte Safari in beiden.
 */

/**
 * Ein Fehler ohne Code und ohne Antwort ist ein Netzfehler.
 *
 * supabase-js reicht einen gescheiterten `fetch` als Fehler ohne `code`
 * durch. Genau daran — und nicht an `navigator.onLine`, das im WLAN ohne
 * Internet fröhlich `true` meldet — hängt die Unterscheidung.
 *
 * JEDER BROWSER SAGT ES ANDERS: Chromium „Failed to fetch“, Firefox
 * „NetworkError when attempting to fetch resource“, Safari „Load failed“,
 * ältere Safari „The Internet connection appears to be offline“ oder
 * „Could not connect to the server“. Ohne die Sätze von Safari galt ein
 * Funkloch im WLAN am iPhone als „unklar“, wurde gezählt und nach fünf
 * Läufen verworfen — gerade auf dem Gerät, mit dem der Monteur im Keller
 * steht (E49, Browserweg WebKit).
 *
 * DESHALB ZÄHLT ZUERST DER STAND, NICHT DER TEXT. Kam überhaupt keine
 * Antwort (`status` 0 — so meldet supabase-js einen gescheiterten `fetch`),
 * ist nichts angekommen, wie auch immer der Browser es nennt.
 */
export function istNetzfehler(fehler: { code?: string; message?: string }, status?: number): boolean {
  if (fehler.code) return false;
  if (status === 0) return true;
  const m = (fehler.message ?? '').toLowerCase();
  return (
    m.includes('fetch') || m.includes('network') || m.includes('failed to') || m.includes('load failed') ||
    m.includes('appears to be offline') || m.includes('could not connect')
  );
}
