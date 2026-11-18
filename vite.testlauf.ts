import type { Plugin } from 'vite';

/**
 * OHNE ZWISCHENSPEICHER IM TESTLAUF (18.11.2026, Auftrag: „die Meldung
 * ERR_INSUFFICIENT_RESOURCES kam jetzt jedes Mal … kannst du das nicht
 * generell einmal fixen?“).
 *
 * Lange Browserwege brachen mit `net::ERR_INSUFFICIENT_RESOURCES` ab oder
 * zeigten eine weiße Seite („page crashed“) — immer erst nach einigen
 * Seitenaufrufen, nie an einer bestimmten Stelle. Gemessen: der
 * Entwicklungsserver liefert die App in rund 750 Einzeldateien je Aufruf, jede
 * mit eingebetteter Quellkarte. Ein Playwright-Kontext hält seinen
 * HTTP-Zwischenspeicher im Arbeitsspeicher; nach rund 5.000 Antworten (acht
 * bis zehn Aufrufe) ist er voll, und Chromium verweigert jede weitere Anfrage.
 * Mit abgeschaltetem Zwischenspeicher liefen 40 Aufrufe mit 30.703 Anfragen
 * ohne einen Fehler; `--disable-http-cache` und ein abgeschalteter
 * Zurück-Speicher ändern nichts.
 *
 * Deshalb antwortet der Server im Testlauf mit `Cache-Control: no-store` —
 * was nicht gespeichert wird, füllt nichts. Gesetzt wird beim Setzen selbst:
 * Vite schreibt seinen eigenen Kopf (`no-cache`) erst beim Senden und
 * überschriebe `server.headers`. Nur wenn die Testkonfiguration den Server
 * startet (`ZWISCHENSPEICHER_AUS=1`); beim Entwickeln bleibt alles, wie es ist.
 * Ein schon laufender Entwicklungsserver ohne den Schalter wird von Playwright
 * mitbenutzt (`reuseExistingServer`) — dann gilt der alte Zustand.
 */
export function ohneZwischenspeicherImTestlauf(): Plugin {
  return {
    name: 'ohne-zwischenspeicher-im-testlauf',
    configureServer(server) {
      if (process.env.ZWISCHENSPEICHER_AUS !== '1') return;
      server.middlewares.use((_req, res, weiter) => {
        const setzen = res.setHeader.bind(res);
        res.setHeader = (name, wert) => setzen(name, name.toLowerCase() === 'cache-control' ? 'no-store' : wert);
        res.setHeader('Cache-Control', 'no-store');
        weiter();
      });
    },
  };
}
