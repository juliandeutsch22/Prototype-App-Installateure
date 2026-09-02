/*
 * Service Worker: App-Hülle vorhalten UND Push zustellen.
 *
 * WARUM BEIDES IN EINER DATEI. Ein Service Worker beansprucht einen Bereich
 * („scope"), und für denselben Bereich kann nur einer zuständig sein. Zwei
 * Registrierungen auf „/" verdrängen sich gegenseitig — mal gewinnt der
 * Push-Worker, mal der Zwischenspeicher, je nach Reihenfolge. Deshalb einer,
 * der beides tut.
 *
 * WOFÜR ÜBERHAUPT. Ohne ihn lud die Startbildschirm-App auf dem iPhone bei
 * jedem Start ihr JavaScript neu. iOS gibt einer solchen App einen eigenen
 * Speicherbereich und räumt den beherzt auf, also war praktisch jeder Start
 * ein Kaltstart — bei schlechtem Empfang minutenlang oder gar nicht.
 *
 * Der Firestore-Zwischenspeicher half dagegen nichts: er hält DATEN vor. Wenn
 * die App selbst nicht lädt, ist das gleichgültig.
 *
 * DIE GEFAHR, DIE MAN DAFÜR EINKAUFT. Ein Service Worker ist zäh. Liefert er
 * einmal eine alte Fassung aus, sähe der Benutzer sie auch nach einem Deploy
 * weiter. Drei Vorkehrungen dagegen:
 *
 *   1. `index.html` wird bei JEDEM Seitenaufruf zusätzlich im Hintergrund
 *      geholt und mit dem gespeicherten Stand VERGLICHEN. Unterscheiden sie
 *      sich, gab es einen Deploy — dann bekommt die App eine Nachricht und
 *      bietet „Jetzt laden" an.
 *   2. Beim Wechsel fliegen die alten Bausteine raus. Es kann also nichts aus
 *      zwei Fassungen vermischt werden.
 *   3. Anfragen an Firestore, Auth und Google werden NICHT angefasst. Ein
 *      zwischengespeicherter Datenbankzugriff wäre ein falscher Kontostand.
 *
 * WARUM DIE FASSUNG NICHT IN DER ADRESSE DES WORKERS STEHT. Das war der erste
 * Entwurf und er funktioniert nicht: die Nummer käme aus dem gerade laufenden
 * JavaScript — also aus der ALTEN Fassung. Der Worker meldete sich damit
 * unter seiner alten Adresse an und erneuerte sich nie. Die einzige
 * verlässliche Quelle dafür, dass es etwas Neues gibt, ist der Server.
 */

const HUELLE = 'perl-huelle';
const TEILE = 'perl-teile';
const SEITE = '/index.html';

/* ---------------------------------------------------------------- Push --- */

/*
 * Die Firebase-Bibliotheken kommen aus dem Netz. Schlägt das fehl — kein
 * Empfang beim allerersten Start —, darf der Worker trotzdem nicht scheitern:
 * ohne ihn gäbe es auch keine vorgehaltene App-Hülle, und die ist der
 * wichtigere Teil. Push fehlt dann eben bis zum nächsten Mal.
 */
let pushBereit = false;
try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

  const p = new URLSearchParams(self.location.search);
  if (p.get('apiKey') && p.get('messagingSenderId')) {
    firebase.initializeApp({
      apiKey: p.get('apiKey'),
      projectId: p.get('projectId'),
      messagingSenderId: p.get('messagingSenderId'),
      appId: p.get('appId'),
    });

    firebase.messaging().onBackgroundMessage((payload) => {
      const { title, body, link } = payload.data ?? {};
      self.registration.showNotification(title || 'Perl Zeiterfassung', {
        body: body || '',
        icon: '/icon-192.png',
        badge: '/favicon-64.png',
        // Gleiche Kennung = die neue Meldung ersetzt die alte. Fünf
        // Anforderungen hintereinander sollen nicht fünf Einträge im
        // Sperrbildschirm sein.
        tag: payload.data?.tag || 'perl-allgemein',
        data: { link: link || '/' },
      });
    });
    pushBereit = true;
  }
} catch {
  pushBereit = false;
}

// Tippen öffnet die App an der passenden Stelle — und holt ein bereits
// offenes Fenster nach vorn, statt ein zweites zu öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});

/* ------------------------------------------------------------ App-Hülle --- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(HUELLE)
      .then((c) => c.add(new Request(SEITE, { cache: 'reload' })))
      // Kein Netz beim ersten Besuch: dann eben ohne vorgehaltene Hülle.
      // Scheitern würde bedeuten, dass der Worker gar nicht erst installiert.
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Fremde Zwischenspeicher aus früheren Bauweisen aufräumen.
      const namen = await caches.keys();
      await Promise.all(
        namen.filter((n) => n !== HUELLE && n !== TEILE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Gehört diese Adresse zu uns und darf sie vorgehalten werden? */
function istEigenerBaustein(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      url.pathname === '/manifest.webmanifest' ||
      /\.(png|svg|ico|woff2?)$/.test(url.pathname))
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /*
   * ALLES FREMDE UNANGETASTET. Firestore, Auth, die Cloud Functions und
   * Google gehen unberührt durch. Ein zwischengespeicherter Zeiteintrag wäre
   * ein falscher Kontostand — und der Firestore-Client hat seinen eigenen,
   * richtigen Zwischenspeicher.
   */
  if (url.origin !== self.location.origin) return;

  // Seitenaufruf: sofort die vorgehaltene Hülle, parallel die neue holen.
  if (request.mode === 'navigate') {
    event.respondWith(huelleAusliefern(event));
    return;
  }

  // Bausteine tragen einen Fingerabdruck im Namen. Was einmal unter diesem
  // Namen geladen wurde, ändert sich nie — also erst schauen, dann holen.
  if (istEigenerBaustein(url)) {
    event.respondWith(erstSpeicherDannNetz(request));
  }
});

/**
 * Die Seite ausliefern: sofort aus dem Speicher, im Hintergrund vergleichen.
 *
 * Das Vergleichen ist der Punkt, an dem ein Deploy überhaupt auffällt.
 * `index.html` ist die einzige Datei, deren Name sich nie ändert — alle
 * anderen tragen einen Fingerabdruck. Ändert sich ihr INHALT, zeigt sie auf
 * neue Bausteine, und es gab einen Deploy.
 */
async function huelleAusliefern(event) {
  const c = await caches.open(HUELLE);
  const vorrat = await c.match(SEITE);

  const nachziehen = fetch(new Request(SEITE, { cache: 'reload' }))
    .then(async (res) => {
      if (!res.ok) return res;
      const neuerText = await res.clone().text();
      const alterText = vorrat ? await vorrat.clone().text() : null;
      await c.put(SEITE, res.clone());

      if (alterText !== null && alterText !== neuerText) {
        /*
         * HIER WIRD NICHTS WEGGEWORFEN — und das ist der Punkt.
         *
         * Vorher flogen an dieser Stelle die alten Bausteine raus. Der
         * Gedanke war richtig (sonst wächst der Speicher mit jedem Deploy),
         * der Zeitpunkt war es nicht: die Seite, die GERADE geladen wird, ist
         * noch die alte. Sie fordert ihre Bausteine mit den alten Namen an —
         * und die lagen nach dem Löschen weder im Speicher noch auf dem
         * Server, denn Hosting kennt nach einem Deploy nur die neuen Namen.
         *
         * Auf dem Telefon fällt das doppelt ins Gewicht: seit dem
         * Code-Splitting lädt JEDE Ansicht erst beim Öffnen nach. Wer auf
         * „Später" getippt hat und danach den Schein aufmacht, bekam eine
         * Fehlermeldung statt der Ansicht — ausgelöst von der Vorkehrung,
         * die den Deploy sicherer machen sollte.
         *
         * Aufgeräumt wird jetzt beim Übernehmen (`fassungUebernehmen`
         * weiter unten). Bis dahin liegen zwei Fassungen nebeneinander; das
         * kostet ein paar hundert Kilobyte und ist der Preis dafür, dass die
         * laufende App heil bleibt.
         */
        await allenFensternSagen('neueFassung');
      }
      return res;
    })
    .catch(() => null);

  if (vorrat) {
    /*
     * Der Benutzer wartet NICHT auf den Vergleich — er bekommt sofort, was
     * da ist. Das ist der ganze Zweck der Übung.
     *
     * `waitUntil` ist trotzdem nötig: der Browser darf einen Service Worker
     * beenden, sobald er geantwortet hat. Ohne diese Zusage würde die
     * Hintergrundprüfung mitten im Laden abgebrochen — auf dem Telefon, wo
     * das Netz langsam ist, also fast immer. Der Deploy fiele nie auf.
     */
    event.waitUntil(nachziehen);
    return vorrat;
  }

  // Erster Besuch: es gibt noch nichts vorzuhalten.
  const res = await nachziehen;
  return res ?? new Response('Offline und noch nichts gespeichert.', { status: 503 });
}

async function allenFensternSagen(nachricht) {
  const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const f of fenster) f.postMessage(nachricht);
}

async function erstSpeicherDannNetz(request) {
  const c = await caches.open(TEILE);
  const treffer = await c.match(request);
  if (treffer) return treffer;
  const res = await fetch(request);
  // Nur vollständige Antworten aufheben. Ein abgebrochener Download als
  // „gespeichert" wäre eine kaputte Datei, die nie wieder erneuert würde.
  if (res.ok && res.status === 200) await c.put(request, res.clone());
  return res;
}

/* --------------------------------------------------------- Verständigung --- */

self.addEventListener('message', (event) => {
  if (event.data === 'pushBereit?') event.source?.postMessage({ pushBereit });

  /*
   * Die App lädt gleich neu — JETZT dürfen die alten Bausteine weg.
   *
   * Nach dem Neuladen zeigt die gespeicherte `index.html` auf die neuen
   * Namen; was unter den alten liegt, braucht niemand mehr. Die Antwort
   * zurück ist nicht Höflichkeit: der Aufrufer wartet darauf, damit das
   * Neuladen nicht mitten ins Löschen fällt.
   */
  if (event.data === 'fassungUebernehmen') {
    event.waitUntil(
      caches.delete(TEILE).then(() => event.source?.postMessage('fassungUebernommen')),
    );
  }
});
