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
    aufraeumenFallsUebernommen();
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

/** Wie lange auf eine Antwort des Workers gewartet wird. */
const WORKER_FRIST_MS = 2500;

/** Merker: die neue Fassung läuft, die alten Bausteine dürfen weg. */
const AUFRAEUM_MERKER = 'perl:aufraeumen';

/**
 * Eine Nachricht an den Worker schicken und auf seine Antwort warten.
 *
 * Die Frist ist wichtiger als die Antwort: der Browser darf einen Service
 * Worker jederzeit beenden. Bleibt sie aus, geht es trotzdem weiter — eine
 * App, die auf eine Antwort wartet, die nie kommt, wäre der schlechtere
 * Ausgang.
 */
function workerFragen(frage: string, antwort: string): Promise<void> {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve();
  return new Promise<void>((fertig) => {
    const uhr = setTimeout(fertig, WORKER_FRIST_MS);
    const hoerer = (e: MessageEvent) => {
      if (e.data !== antwort) return;
      clearTimeout(uhr);
      navigator.serviceWorker.removeEventListener('message', hoerer);
      fertig();
    };
    navigator.serviceWorker.addEventListener('message', hoerer);
    worker.postMessage(frage);
  });
}

/**
 * Zur neuen Fassung wechseln.
 *
 * NUR NEU LADEN — das Aufräumen kommt danach.
 *
 * DER FEHLER, DEN DAS BEHEBT, IST AUS DEM BETRIEB GEMELDET WORDEN:
 * „undefined is not an object (evaluating 'e._result.default')".
 *
 * Vorher ließ diese Funktion den Worker ERST die alten Bausteine löschen und
 * wartete auf seine Bestätigung, bevor sie neu lud. In diesen bis zu zwei
 * Sekunden lief die ALTE Seite weiter und wurde bedient. Wer in diesem
 * Fenster auf einen Reiter tippte, forderte einen Baustein an, den es im
 * Speicher gerade nicht mehr und auf dem Server nach dem Deploy nicht mehr
 * gab — genau die Meldung oben.
 *
 * Solange nur jemand bewusst auf „Jetzt laden" tippte, war das ein seltenes
 * Fenster. Mit der stillen Übernahme beim Kaltstart wurde daraus der
 * Regelfall: sie läuft bei jedem Start nach einem Deploy, unsichtbar,
 * während der Monteur schon tippt.
 *
 * Aufgeräumt wird jetzt beim NÄCHSTEN Start, wenn die neue Fassung läuft und
 * niemand mehr etwas Altes anfordern kann.
 */
export async function neueFassungUebernehmen(): Promise<void> {
  try {
    sessionStorage.setItem(AUFRAEUM_MERKER, '1');
  } catch {
    // Ohne Merker bleiben die alten Bausteine eine Fassung länger liegen.
    // Das kostet Speicher und sonst nichts.
  }
  /*
    ERST DIE HUELLE ERNEUERN LASSEN, DANN LADEN — auch hier.
    
    Die Meldung kann aus zwei Quellen kommen: vom Worker (dann hat er die
    neue Hülle schon abgelegt) oder von der App selbst, die beim Server
    nachgefragt hat (`lib/fassungPruefen.ts`). Im zweiten Fall weiß der
    Worker unter Umständen noch von nichts, und ein sofortiges Laden holte
    die alte Hülle. Ein Weg für beide Quellen ist der einzige, der in beiden
    Fällen richtig ist.

    Gelöscht wird dabei NICHTS — deshalb ist es unschädlich, dass die alte
    Seite noch bis zu zwei Sekunden weiterläuft.
  */
  await huelleErneuernUndNeuLaden();
}

/**
 * Die alten Bausteine wegräumen — beim Start, nachdem übernommen wurde.
 *
 * Was die laufende Fassung danach noch nachlädt, liegt auf dem Server;
 * schlimmstenfalls kostet es eine Netzrunde. Vorher, mit der alten Seite im
 * Rücken, kostete es die Ansicht.
 */
function aufraeumenFallsUebernommen(): void {
  let faellig = false;
  try {
    faellig = sessionStorage.getItem(AUFRAEUM_MERKER) !== null;
    if (faellig) sessionStorage.removeItem(AUFRAEUM_MERKER);
  } catch {
    return;
  }
  if (!faellig) return;
  void workerFragen('fassungUebernehmen', 'fassungUebernommen');
}

/**
 * Nach einem gescheiterten Nachladen: erst die Hülle erneuern, dann laden.
 *
 * WARUM NICHT EINFACH NEU LADEN, wie es vorher geschah. Der fehlende
 * Baustein steht in der ALTEN `index.html`, und genau die liegt noch im
 * Speicher des Workers. Ein sofortiges Neuladen holt dieselbe Hülle, findet
 * denselben fehlenden Baustein — und beim zweiten Versuch greift der
 * Schleifenschutz. Übrig bleibt die Fehlertafel, obwohl die neue Fassung
 * längst auf dem Server liegt.
 *
 * Der Worker legt die neue Hülle ab und meldet sich; erst dann wird geladen.
 * Kommt er nicht durch, wird nach der Frist trotzdem geladen — ohne Netz
 * hilft ohnehin nichts, und stehenbleiben ist der schlechtere Ausgang.
 */
export async function huelleErneuernUndNeuLaden(): Promise<void> {
  await workerFragen('aufNeueFassungPruefen', 'fassungGeprueft');
  window.location.reload();
}
