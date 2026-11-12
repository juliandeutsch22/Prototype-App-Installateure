/**
 * Der Auftragsumfang, wie die Akte ihn zeigt.
 *
 * WARUM DIE HERKUNFT HERAUSFÄLLT (E82, 12.11.2026): Wird eine Baustelle aus
 * einem Eingang angelegt, hängt die Datenbank „Aus Eingang EG-…“ an die
 * Beschreibung (`eingang_baustelle_anlegen`) — für jeden, der den Text
 * später ohne Akte liest, etwa im Export. In der Akte steht dieselbe Angabe
 * schon als Verweis darunter; zweimal untereinander war das Rauschen.
 *
 * Nur die Anzeige ändert sich, gespeichert bleibt der Text, wie er ist
 * (die Produktion wird nicht umgeschrieben). Entfernt wird ausschließlich
 * genau dieser Anhang am Ende und nur, wenn der Verweis auch wirklich
 * gezeigt wird — wer den Satz selbst mitten in den Text schreibt, behält ihn.
 */
export function auftragsumfangZeigen(beschreibung: string | null | undefined, eingangNummer: string | null): string {
  const text = beschreibung ?? '';
  if (!eingangNummer) return text.trim();
  const anhang = `Aus Eingang ${eingangNummer}`;
  const ohne = text.trimEnd();
  const davor = ohne.slice(0, ohne.length - anhang.length);
  // Der Anhang steht in einer eigenen Zeile; „… Aus Eingang EG-1“ am Ende eines Satzes bleibt.
  if (!ohne.endsWith(anhang) || (davor !== '' && !davor.endsWith('\n'))) return text.trim();
  return davor.trim();
}
