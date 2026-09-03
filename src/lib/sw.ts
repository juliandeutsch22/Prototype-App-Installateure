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

  /**
   * BEIM ZURUECKKOMMEN NACHSEHEN — der eigentliche Fix.
   *
   * Die Prüfung auf eine neue Fassung hing ausschliesslich an einem
   * SEITENAUFRUF. Auf dem Telefon gibt es den praktisch nie: eine
   * Startbildschirm-App wird beim Öffnen FORTGESETZT, nicht neu geladen. Die
   * Prüfung lief also nicht, und der Betrieb blieb auf einer alten Fassung
   * stehen, bis jemand die App vom Startbildschirm löschte und neu
   * hinzufügte. Genau so wurde es gemeldet.
   *
   * Zwei Dinge auf einmal, weil zwei Dinge veralten können:
   *   `update()`   — holt einen geänderten Worker selbst.
   *   die Nachricht — lässt den laufenden Worker die `index.html` vergleichen.
   */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void navigator.serviceWorker.getRegistration().then((reg) => {
      void reg?.update().catch(() => undefined);
    });
    navigator.serviceWorker.controller?.postMessage('aufNeueFassungPruefen');
  });
}

/**
 * Wie lange nach dem Start eine Übernahme noch als „kalt" gilt.
 *
 * Der Vergleich mit dem Server braucht eine Netzrunde; auf einer zähen
 * Verbindung kommt die Antwort erst nach ein paar Sekunden. Wäre das Fenster
 * zu knapp, käme im Keller wieder die Leiste statt der stillen Übernahme.
 */
const KALTSTART_FENSTER_MS = 12_000;

/** Merker gegen eine Schleife aus stillem Übernehmen und Neuladen. */
const STILL_MERKER = 'perl:stillUebernommen';

/**
 * Darf JETZT noch still übernommen werden?
 *
 * Zwei Bedingungen, und beide müssen gelten: es ist kurz nach dem Start, UND
 * der Benutzer hat noch nichts angefasst. Die zweite ist die wichtigere — wer
 * schon tippt, soll nicht mitten im Satz neu geladen werden, auch nicht in
 * der zweiten Sekunde.
 */
export function darfStillUebernehmen(gestartet: number, angefasst: boolean): boolean {
  if (angefasst) return false;
  if (Date.now() - gestartet > KALTSTART_FENSTER_MS) return false;
  try {
    if (sessionStorage.getItem(STILL_MERKER)) return false;
    sessionStorage.setItem(STILL_MERKER, '1');
  } catch {
    // Privates Fenster: dann lieber fragen als eine Schleife riskieren.
    return false;
  }
  return true;
}

/** Wie lange auf die Bestätigung des Workers gewartet wird. */
const UEBERNAHME_FRIST_MS = 2000;

/**
 * Zur neuen Fassung wechseln.
 *
 * Die neue `index.html` liegt bereits im Speicher — der Worker hat sie beim
 * Vergleich abgelegt. Vorher genügte deshalb ein Neuladen.
 *
 * WARUM JETZT NOCH EIN SCHRITT DAZWISCHEN. Der Worker wirft die alten
 * Bausteine nicht mehr weg, sobald er einen Deploy bemerkt — das brach die
 * gerade laufende Seite, die ihre alten Bausteine noch braucht (siehe
 * `public/sw.js`). Aufgeräumt wird stattdessen hier, unmittelbar vor dem
 * Neuladen, wenn niemand sie mehr anfordert.
 *
 * Die Frist ist wichtiger als die Bestätigung: Antwortet der Worker nicht —
 * er kann zwischendurch beendet worden sein —, wird trotzdem neu geladen.
 * Ein Benutzer, der auf „Jetzt laden" tippt und bei dem nichts passiert,
 * wäre der schlechtere Ausgang als ein Speicher, der eine Fassung länger
 * mitläuft.
 */
export async function neueFassungUebernehmen(): Promise<void> {
  const worker = navigator.serviceWorker?.controller;
  if (worker) {
    await new Promise<void>((fertig) => {
      const uhr = setTimeout(fertig, UEBERNAHME_FRIST_MS);
      const hoerer = (e: MessageEvent) => {
        if (e.data !== 'fassungUebernommen') return;
        clearTimeout(uhr);
        navigator.serviceWorker.removeEventListener('message', hoerer);
        fertig();
      };
      navigator.serviceWorker.addEventListener('message', hoerer);
      worker.postMessage('fassungUebernehmen');
    });
  }
  window.location.reload();
}
