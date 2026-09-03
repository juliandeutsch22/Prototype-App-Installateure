/**
 * Ein fehlgeschlagenes Nachladen einer Ansicht — erkennen und einmal heilen.
 *
 * WARUM DAS EINE EIGENE DATEI IST. Der Fall trifft die App an zwei Stellen:
 * als geworfener Fehler in der Fehlergrenze (`app/ErrorBoundary.tsx`) und als
 * Ereignis `vite:preloadError`, das Vite auslöst, BEVOR React überhaupt etwas
 * zu sehen bekommt. Beide brauchen dieselbe Antwort und vor allem denselben
 * Schleifenschutz — zwei getrennte Merker hießen zwei Neuladeversuche
 * hintereinander.
 */

import { huelleErneuernUndNeuLaden } from './sw';

/** Merker gegen eine Schleife aus Neuladen und Scheitern. */
const NEULADE_MERKER = 'perl:nachladefehler';

/**
 * Wie lange ein Neuladen als „gerade erst versucht" gilt.
 *
 * Ohne diese Frist gäbe es zwei schlechte Auswege: ohne Merker eine
 * Endlosschleife aus Laden und Scheitern, mit dauerhaftem Merker keine
 * Reparatur mehr für den zweiten Deploy derselben Sitzung.
 */
const NEULADE_SPERRE_MS = 10_000;

export function darfNeuLaden(): boolean {
  try {
    const zuletzt = Number(sessionStorage.getItem(NEULADE_MERKER) ?? 0);
    if (Date.now() - zuletzt < NEULADE_SPERRE_MS) return false;
    sessionStorage.setItem(NEULADE_MERKER, String(Date.now()));
    return true;
  } catch {
    // Privates Fenster oder abgeschaltete Website-Daten: dann lieber einmal
    // zu wenig neu laden als in einer Schleife zu landen.
    return false;
  }
}

/**
 * Ist das ein fehlgeschlagenes Nachladen einer Ansicht?
 *
 * DIE LISTE WAR ZU KURZ, und das ist aus dem Betrieb gemeldet worden. Auf dem
 * iPhone stand da:
 *
 *   'text/html' is not a valid JavaScript MIME type.
 *
 * Kein einziges der ursprünglichen Muster passte, also lief die Selbstheilung
 * nicht an, und der Monteur bekam die Tafel mit „Erneut versuchen" — dem
 * Knopf, der hier per Konstruktion nichts ausrichten kann.
 *
 * Der Grund für diese Formulierung: Firebase Hosting leitet jede unbekannte
 * Adresse auf `index.html` um. Der Browser fragt nach JavaScript, bekommt
 * HTML mit Status 200 und lehnt es wegen des Inhaltstyps ab — es gibt gar
 * keinen 404, an dem man es erkennen könnte.
 *
 * Der Service Worker macht daraus inzwischen einen sauberen Fehlschlag (siehe
 * `public/sw.js`). Diese Liste bleibt trotzdem breit: beim allerersten
 * Besuch, im privaten Fenster und überall, wo kein Worker läuft, ist sie die
 * einzige Erkennung.
 */
export function istNachladeFehler(error: { name?: string; message?: string }): boolean {
  const text = `${error.name ?? ''} ${error.message ?? ''}`;
  return (
    /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|Loading chunk \S+ failed|valid JavaScript MIME type|Expected a JavaScript(?: | module )script|disallowed MIME type|failed to fetch dynamically/i.test(
      text,
    ) || istKaputterBaustein(text)
  );
}

/**
 * Ein nachgeladener Baustein, der zwar ANKAM, aber leer ist.
 *
 * AUS DEM BETRIEB GEMELDET, und der Fehler war meiner. Auf dem Telefon stand:
 *
 *   undefined is not an object (evaluating 'e._result.default')
 *
 * `_result` ist Reacts Innenleben für eine nachgeladene Ansicht: dort liegt
 * das fertige Modul, aus dem `default` geholt wird. Ist es `undefined`, hat
 * das Nachladen zwar nicht mit einem Fehler geendet — geliefert wurde aber
 * nichts Brauchbares.
 *
 * Das ist KEIN gewöhnlicher Programmfehler, sondern derselbe Fall wie ein
 * gescheitertes Nachladen, nur in anderer Verkleidung. Und es ist der
 * schlimmste: die Fehlertafel bot „Erneut versuchen" an, während React sich
 * das kaputte Modul gemerkt hatte — der Knopf konnte nichts ausrichten, und
 * die Ansicht war für den Rest der Sitzung unerreichbar. „Neuer Schein" ging
 * damit gar nicht mehr.
 *
 * So erkannt, greift stattdessen das Neuladen, und das holt den Baustein
 * wirklich neu.
 */
function istKaputterBaustein(text: string): boolean {
  return /_result|_payload/.test(text) && /undefined|null|not an object|reading/i.test(text);
}

/**
 * Vites eigene Meldung abfangen, bevor daraus ein Renderfehler wird.
 *
 * `vite:preloadError` kommt, wenn das Vorladen eines Bausteins scheitert —
 * also im selben Fall, nur früher und ohne Umweg über React. Wer hier schon
 * neu lädt, sieht die Fehlertafel gar nicht erst.
 *
 * Geladen wird ERST, nachdem der Worker die Hülle erneuert hat: sonst holt
 * das Neuladen dieselbe alte `index.html` mit demselben fehlenden Baustein.
 */
export function nachladefehlerBeobachten(): void {
  window.addEventListener('vite:preloadError', (e) => {
    // Ohne das wirft Vite die Meldung weiter — der Neuladeversuch käme dann
    // zusätzlich aus der Fehlergrenze, und der Schleifenschutz müsste den
    // zweiten abfangen. Einmal reicht.
    e.preventDefault();
    if (darfNeuLaden()) void huelleErneuernUndNeuLaden();
  });
}

