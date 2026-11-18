/**
 * EIGENES SCHREIBEN ZEIGT SICH, AUCH OHNE LIVE-MELDUNG (E99, 18.11.2026).
 *
 * Die Live-Listen (`abonnieren`) nahmen eine Änderung nur über den Kanal
 * auf: was die Seite selbst geschrieben hatte, stand erst da, wenn der Server
 * es zurückmeldete. Kam die Meldung nicht — ein Netz, das Websockets sperrt,
 * ein Kanal, der gerade neu aufgebaut wird, ein überlasteter Dienst —, stand
 * die eigene Buchung bis zum Neuladen nicht in der Mitarbeiterübersicht.
 * Gefunden in der CI (`runde4.spec.ts`): Buchung gespeichert (201), die
 * Meldung kam in 20 s nicht, der Tag blieb „ohne Buchung“.
 *
 * Jetzt meldet jeder geglückte eigene Schreibvorgang seine Tabelle hier, und
 * jede Live-Liste dieser Tabelle gleicht gleich ab (Kennung und
 * Änderungszeit, wie beim Nachfassen). Die Meldung des Kanals bleibt der
 * Weg für fremde Änderungen; trifft sie zusätzlich ein, ändert sie nichts
 * mehr.
 *
 * Ein eigenes Modul, damit Datenschicht und Ausgangsfach es ohne
 * Ringverweis erreichen.
 */
const hoerer = new Map<string, Set<() => void>>();

/** Meldet einen Hörer für die Tabelle an; zurück kommt die Abmeldung. */
export function beiEigenerAenderung(tabelle: string, hoeren: () => void): () => void {
  let menge = hoerer.get(tabelle);
  if (!menge) {
    menge = new Set();
    hoerer.set(tabelle, menge);
  }
  menge.add(hoeren);
  return () => {
    menge.delete(hoeren);
    if (menge.size === 0) hoerer.delete(tabelle);
  };
}

/** Nach einem geglückten eigenen Schreibvorgang: alle Live-Listen der Tabelle gleichen ab. */
export function eigeneAenderung(tabelle: string): void {
  for (const hoeren of [...(hoerer.get(tabelle) ?? [])]) {
    try {
      hoeren();
    } catch {
      // Eine Liste, die hier scheitert, darf den Schreibvorgang nicht nachträglich scheitern lassen.
    }
  }
}
