/**
 * Den Service Worker anmelden — und melden, wenn es eine neue Fassung gibt.
 *
 * Der Worker hält die App-Hülle vor, damit die Startbildschirm-App auf dem
 * Telefon nicht bei jedem Start ihr JavaScript neu lädt. Was er tut und
 * wogegen er abgesichert ist, steht in `public/sw.js`.
 *
 * Die Anmeldung passiert bei JEDEM Start, nicht erst wenn jemand Push
 * einschaltet. Vorher war es umgekehrt — wer keine Meldungen wollte, hatte
 * gar keinen Worker und damit auch nichts Vorgehaltenes.
 */

/**
 * Die Adresse bleibt über Deploys hinweg GLEICH.
 *
 * Der erste Entwurf hängte eine Fassungsnummer an, damit sich der Worker nach
 * einem Deploy erneuert. Das funktioniert nicht: die Nummer käme aus dem
 * gerade laufenden JavaScript — also aus der alten Fassung. Der Worker
 * meldete sich unter seiner alten Adresse an und erneuerte sich nie.
 *
 * Ob es etwas Neues gibt, weiß nur der Server. Deshalb vergleicht der Worker
 * die ausgelieferte `index.html` mit der gespeicherten und meldet sich von
 * selbst — siehe `public/sw.js`.
 *
 * Die Zugangsdaten in der Adresse sind nicht geheim (dieselben Werte stehen
 * im ausgelieferten JavaScript) und ändern sich nicht. Der Worker läuft
 * außerhalb der App und kennt die Build-Variablen nicht, deshalb bekommt er
 * sie so.
 */
function workerAdresse(): string {
  const p = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  });
  return `/sw.js?${p.toString()}`;
}

/**
 * Anmelden und bei einer neuen Fassung `beiNeuerFassung` rufen.
 *
 * WARUM NICHT VON SELBST NEU LADEN. Weil der Monteur mitten in einem Formular
 * stehen kann. Ein selbsttätiger Neustart wirft ihm die halb erfasste Zeit
 * weg — und zwar ohne erkennbaren Zusammenhang, denn ausgelöst hat es jemand
 * anderes mit einem Deploy.
 */
export function serviceWorkerAnmelden(beiNeuerFassung: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  // Im Entwicklungsbetrieb stört er nur: er hielte den alten Stand vor,
  // während man gerade am Code arbeitet.
  if (import.meta.env.DEV) return;

  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data === 'neueFassung') beiNeuerFassung();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(workerAdresse()).catch(() => {
      // Privates Fenster, abgeschaltete Website-Daten, unsichere Verbindung:
      // dann läuft die App wie bisher, nur ohne Vorhalten.
    });
  });
}

/**
 * Zur neuen Fassung wechseln.
 *
 * Ein einfaches Neuladen genügt: die neue `index.html` liegt bereits im
 * Speicher (der Worker hat sie beim Vergleich abgelegt), und die alten
 * Bausteine sind weg. Der Neustart holt also genau die neue Fassung.
 */
export function neueFassungUebernehmen(): void {
  window.location.reload();
}
