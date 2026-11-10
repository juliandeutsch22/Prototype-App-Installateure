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
/**
 * Welche Bausteine lagen, als eine neue Hülle abgelegt wurde? Nur diese sind
 * beim Übernehmen alt (`teileAufraeumen`). Ein Eintrag im Speicher der Hülle,
 * weil der Worker zwischen Ablegen und Übernehmen beendet werden darf und
 * eine Variable das nicht übersteht.
 */
const ALTE_TEILE = '/alte-teile.json';

/* ---------------------------------------------------------------- Push --- */

/*
 * DIE MELDUNG ZEIGT DIESER WORKER SELBST — immer, und er wartet darauf
 * (09.11.2026, E69: „Push-Benachrichtigungen für Nachrichten funktionieren
 * immer noch nicht“).
 *
 * Bis dahin lief jede Meldung durch Firebase, und das ging auf zwei Wegen
 * schief:
 *
 *   1. War irgendein Fenster der App sichtbar, gab Firebase die Meldung an
 *      die Seite weiter und zeigte selbst nichts. Auf dem iPhone ist das eine
 *      „stille“ Meldung — und nach wenigen davon nimmt iOS der Seite das
 *      Recht auf Meldungen. Danach kam auf dem Gerät gar nichts mehr an, bis
 *      man es neu anmeldete. Wer mit offener App schreibt und liest, löste
 *      das also gerade beim Ausprobieren aus.
 *   2. Im Hintergrund zeigte Firebase sie zwar an, aber die Anzeige wurde
 *      nicht abgewartet: der Handler gab das Versprechen nicht zurück. Endet
 *      das Push-Ereignis vor der Anzeige, wertet iOS auch das als still.
 *
 * Jetzt hört dieser Worker als ERSTER auf `push` (angemeldet vor Firebase),
 * zeigt die Meldung in `waitUntil` und lässt Firebase das Ereignis nicht
 * mehr sehen. Kommt etwas, das nicht von uns ist (eine Meldung aus der
 * Firebase-Konsole), bleibt es bei Firebase. Und die Anzeige hängt nicht mehr
 * daran, dass die Firebase-Bibliotheken aus dem Netz geladen werden konnten.
 */
const UA = (self.navigator && self.navigator.userAgent) || '';
/*
 * WebKit (iPhone, iPad, Safari auf dem Mac) verlangt zu JEDER Meldung eine
 * Anzeige. Alle anderen Browser lassen eine aus, wenn man ohnehin im
 * Gespräch steht. Auf dem iPhone sind alle Browser WebKit.
 */
const WEBKIT = /AppleWebKit/.test(UA) && !/Chrome\/|Chromium|Edg\/|Android/.test(UA);

/** Die Felder, die `push-melden` schickt — oder null, wenn die Meldung nicht von uns ist. */
function pushDaten(event) {
  try {
    const roh = event.data ? event.data.json() : null;
    const d = roh && roh.data;
    return d && typeof d === 'object' && typeof d.title === 'string' ? d : null;
  } catch {
    return null;
  }
}

/**
 * Wie die Meldung erscheint. Dieselbe Kennung je Gespräch ersetzt die vorige,
 * statt dass sich zwanzig stapeln — `renotify`, damit sie dabei nicht STILL
 * ersetzt wird: sonst meldete sich die zweite Nachricht im selben Gespräch
 * ohne Ton und Vibration.
 */
function meldungAnzeige(d) {
  return {
    titel: d.title || 'Senklot',
    optionen: {
      body: d.body || '',
      icon: '/marke/icon-192.png',
      badge: '/marke/badge-96.png',
      tag: d.tag || 'perl-allgemein',
      renotify: true,
      data: { link: d.link || '/' },
    },
  };
}

/*
 * WO STEHT DAS FENSTER GERADE? Die App wechselt Seiten ohne Neuladen; die
 * Adresse, die der Worker vom Fenster kennt, bleibt dabei die vom Laden
 * (gemessen in Chromium). Deshalb wird das Fenster gefragt; es antwortet mit
 * seinem Pfad (`PushAnmeldung`). Antwortet es nicht rechtzeitig — noch nicht
 * angemeldet, eine ältere Fassung —, gilt die bekannte Adresse.
 */
function ortFragen(fenster) {
  return new Promise((fertig) => {
    const bekannt = () => {
      try {
        return new URL(fenster.url).pathname;
      } catch {
        return null;
      }
    };
    if (typeof MessageChannel === 'undefined') return fertig(bekannt());
    const kanal = new MessageChannel();
    const frist = setTimeout(() => fertig(bekannt()), 500);
    kanal.port1.onmessage = (e) => {
      clearTimeout(frist);
      fertig(typeof e.data === 'string' ? e.data : bekannt());
    };
    try {
      fenster.postMessage('ortGefragt', [kanal.port2]);
    } catch {
      clearTimeout(frist);
      fertig(bekannt());
    }
  });
}

/*
 * Steht jemand sichtbar genau dort, wohin die Meldung führt (im Gespräch, in
 * dem die Nachricht gerade erscheint), braucht es keine Meldung — außer auf
 * WebKit, das sie verlangt: dort erscheint sie ohne Ton und ersetzt nur die
 * vorige desselben Gesprächs.
 */
async function meldungZeigen(d) {
  const link = d.link || '/';
  const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const sichtbar = fenster.filter((f) => f.visibilityState === 'visible');
  const orte = await Promise.all(sichtbar.map(ortFragen));
  const dort = orte.includes(link);
  if (dort && !WEBKIT) return undefined;
  const { titel, optionen } = meldungAnzeige(d);
  return self.registration.showNotification(
    titel,
    dort ? { ...optionen, renotify: false, silent: true } : optionen,
  );
}

self.addEventListener('push', (event) => {
  const daten = pushDaten(event);
  if (!daten) return;
  event.stopImmediatePropagation();
  event.waitUntil(meldungZeigen(daten));
});

/*
 * Firebase bleibt geladen, aber nur noch für eines: erneuert der Browser das
 * Abonnement von sich aus (`pushsubscriptionchange`), meldet Firebase das
 * neue Zeichen bei Google an. Ob der Server es kennt, gleicht die App beim
 * nächsten Start ab (`pushAbgleichen` in `src/lib/push.ts`).
 *
 * Die Bibliotheken kommen aus dem Netz. Schlägt das fehl — kein Empfang beim
 * allerersten Start —, darf der Worker trotzdem nicht scheitern: ohne ihn
 * gäbe es weder die vorgehaltene App-Hülle noch die Anzeige oben.
 */
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
    firebase.messaging();
  }
} catch {
  /* Ohne Firebase: angezeigt wird trotzdem, siehe oben. */
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
    event.respondWith(erstSpeicherDannNetz(event, request, url));
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
/**
 * Nachsehen, ob es eine neue Fassung gibt — und das Ergebnis melden.
 *
 * WARUM DAS EINE EIGENE FUNKTION IST. Diese Prüfung hing ausschliesslich an
 * einem SEITENAUFRUF. Auf dem Schreibtisch ist das dasselbe, auf dem Telefon
 * nicht: eine Startbildschirm-App wird beim Öffnen FORTGESETZT, nicht neu
 * geladen. Es gibt also gar keinen Seitenaufruf, die Prüfung lief nie, und
 * der Betrieb blieb auf einer Fassung stehen, bis jemand die App vom
 * Startbildschirm löschte und neu hinzufügte. Genau so wurde es gemeldet.
 *
 * Jetzt kann die App sie ausserdem auf Zuruf anstossen — sie tut das, sobald
 * sie wieder in den Vordergrund kommt.
 *
 * Gemeldet wird eine neue Fassung nur zusammen mit dem Ablegen ihrer
 * `index.html` (`huelleAblegen`). Das ist kein Detail: ohne sie fände die
 * nächste Prüfung denselben Unterschied noch einmal, und wer still übernimmt,
 * liefe in eine Schleife aus Melden und Neuladen.
 *
 * Das Ergebnis sagt, ob danach die Hülle liegt, die der Server gerade
 * ausliefert — nur dann führt ein Neuladen auf sie (`fassungWechseln`).
 */
async function aufNeueFassungPruefen() {
  await ablageAbwarten();
  const c = await caches.open(HUELLE);
  const vorrat = await c.match(SEITE);
  const alterText = vorrat ? await vorrat.text() : null;
  const startbereit = alterText !== null && (await huelleStartbereit(alterText));
  const res = await fetch(new Request(SEITE, { cache: 'reload' })).catch(() => null);

  // Ohne Netz oder mit einer Fehlerantwort weiß der Worker nicht, was der Server ausliefert.
  if (!res || !res.ok) return false;
  // Scheitert das Ablegen (voller Speicher), bleibt es bei der alten Hülle.
  return huelleAblegen(c, alterText, startbereit, res, () => allenFensternSagen('neueFassung')).catch(() => false);
}

/**
 * Wie viele ausdrücklich angestossene Wechsel gerade laufen (`fassungWechseln`).
 * Solange einer läuft, wartet ein Seitenaufruf die Ablage ganz ab — er ist
 * dann das Neuladen, auf das der Wechsel zielt.
 */
let angestosseneWechsel = 0;

/*
 * DIE BAUSTEINE, MIT DENEN EINE HUELLE STARTET (09.11.2026: „bleibt beim
 * ersten Aufrufen weiß, man muss noch einmal aktualisieren“).
 *
 * `index.html` nennt ihren Einstieg (`<script type="module" src=…>`), ihr
 * Stylesheet und die vorgeladenen Teile mit Namen. Fehlt einer davon, startet
 * die Hülle nicht: der Einstieg scheitert, bevor überhaupt JavaScript läuft,
 * und nichts in der App kann sich mehr melden — die Seite bleibt weiß.
 */
function huellenBausteine(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
}

/** Liegt alles, womit diese Hülle startet, im Speicher? */
async function huelleStartbereit(html) {
  const teile = await caches.open(TEILE);
  for (const pfad of huellenBausteine(html)) {
    if (!(await teile.match(pfad))) return false;
  }
  return true;
}

/*
 * EINE HUELLE, DIE STARTEN KANN, WIRD NUR DURCH EINE ERSETZT, DIE ES AUCH
 * KANN (09.11.2026: nach einer gesehenen neuen Fassung ohne Netz geöffnet —
 * weiße Seite).
 *
 * Bis dahin landete die neue `index.html` sofort im Speicher, ihre Bausteine
 * aber erst, wenn eine Seite sie anforderte. Wer die App nach dem Vergleich
 * ohne Empfang öffnete, bekam die neue Hülle (die alte war ersetzt), ihr
 * Einstieg lag nirgends, und der Start scheiterte vor jedem JavaScript.
 *
 * Jetzt holt der Worker zuerst alles, womit die neue Hülle startet. Erst wenn
 * alles da ist, ersetzt sie die alte, und erst dann wird die neue Fassung
 * gemeldet — beides zusammen, damit kein „Jetzt laden“ auf eine Hülle führt,
 * die nicht liegt. Scheitert das Holen, bleibt die alte, vollständige Hülle
 * stehen und es wird nichts gemeldet; die nächste Prüfung versucht es neu.
 * Unverändert, beim ersten Besuch oder wenn schon die vorgehaltene Hülle
 * nicht starten kann, wird wie bisher sofort abgelegt: dann gibt es nichts
 * Vollständiges zu schützen, und die Seite, die die frische Hülle bekommt,
 * lädt deren Bausteine gerade selbst.
 */
async function bausteineVorhalten(html) {
  const teile = await caches.open(TEILE);
  try {
    await Promise.all(
      huellenBausteine(html).map(async (pfad) => {
        if (await teile.match(pfad)) return;
        const anfrage = new Request(pfad);
        const res = await holenBisStillstand(anfrage);
        if (!res.ok || res.status !== 200 || istStartseiteStattBaustein(new URL(anfrage.url), res)) {
          throw new Error(`Baustein ${pfad} nicht erhalten`);
        }
        // `put` liest den Rumpf ganz; bleibt er stehen, scheitert es — nichts Halbes.
        await teile.put(anfrage, res);
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Die gerade laufende Ablage einer neuen Hülle, falls eine läuft.
 *
 * WARUM SICH SEITENAUFRUFE DANACH RICHTEN. Kann die App die Antwort auf
 * „Wechseln“ nicht abwarten (`lib/sw.ts`), lädt sie trotzdem neu. Holt der
 * Worker die Bausteine noch, fände der Seitenaufruf sonst die alte Hülle und
 * bliebe auf der alten Fassung. Er wartet deshalb, bis die Ablage durch ist —
 * und bekommt die neue Hülle aus dem Speicher, oder, wenn das Holen
 * scheiterte, die alte, die vollständig ist.
 *
 * ABER NUR DANN GANZ (09.11.2026). Jeder andere Seitenaufruf — der
 * Kaltstart, ein Neuladen, das Tippen auf eine Benachrichtigung — wartet
 * höchstens `KURZ_WARTEN_MS` und bekommt dann die vorgehaltene Hülle: ohne
 * diese Grenze wartete er auf einer zähen Verbindung bis zum Stillstand
 * eines Bausteins (20 s) oder, solange es tröpfelt, ohne Ende — und die
 * vorgehaltene Hülle ist gerade dafür da, dass niemand auf das Netz wartet.
 * Dass es eine neue Fassung gibt, meldet die Ablage, sobald sie liegt.
 */
let laufendeAblage = null;
const KURZ_WARTEN_MS = 2500;

/** Die laufende Ablage abwarten — ganz, oder höchstens `hoechstens` ms. */
async function ablageAbwarten(hoechstens) {
  if (!laufendeAblage) return;
  if (hoechstens === undefined) {
    await laufendeAblage;
    return;
  }
  let uhr;
  await Promise.race([laufendeAblage, new Promise((weiter) => { uhr = setTimeout(weiter, hoechstens); })]);
  clearTimeout(uhr);
}

/**
 * Was beim Ablegen einer neuen Hülle schon im Speicher der Bausteine liegt,
 * ist ab dann alt — und nur das darf beim Übernehmen weg (`teileAufraeumen`).
 * Was die neue Fassung danach holt, etwa den Baustein ihrer Startansicht,
 * gehört zu ihr. Liegt schon eine Liste (ein Wechsel, der noch nicht
 * übernommen ist), enthält die neue sie: gelöscht wurde seitdem nichts.
 */
async function alteTeileMerken(c) {
  try {
    const teile = await caches.open(TEILE);
    const pfade = (await teile.keys()).map((req) => new URL(req.url).pathname);
    await c.put(ALTE_TEILE, new Response(JSON.stringify(pfade), { headers: { 'content-type': 'application/json' } }));
  } catch {
    // Ohne Liste wird beim Übernehmen nichts gelöscht: eine Fassung länger liegen kostet Speicher, sonst nichts.
  }
}

/**
 * Ablegen, was die Prüfung geholt hat — und melden, wenn es eine neue Fassung ist.
 * `alterText` ist die vorgehaltene Hülle, `null` beim ersten Besuch;
 * `alteStartbereit`, ob mit ihr alles im Speicher liegt. Ergibt, ob die
 * geholte Hülle danach im Speicher liegt.
 */
function huelleAblegen(c, alterText, alteStartbereit, res, melden) {
  // Den Rumpf sofort teilen: die Antwort selbst geht unter Umständen an die Seite.
  const zumAblegen = res.clone();
  const zumLesen = res.clone();
  const ablage = (async () => {
    const neuerText = await zumLesen.text();
    if (alterText === null || alterText === neuerText) {
      await c.put(SEITE, zumAblegen);
      return true;
    }
    if (alteStartbereit && !(await bausteineVorhalten(neuerText))) return false;
    await alteTeileMerken(c);
    await c.put(SEITE, zumAblegen);
    try {
      await melden();
    } catch {
      // Die Hülle liegt; ein Fenster, das die Meldung nicht annimmt, ändert daran nichts.
    }
    return true;
  })();
  const gemerkt = ablage.catch(() => undefined).then(() => {
    if (laufendeAblage === gemerkt) laufendeAblage = null;
  });
  laufendeAblage = gemerkt;
  return ablage;
}

async function huelleAusliefern(event) {
  await ablageAbwarten(angestosseneWechsel > 0 ? undefined : KURZ_WARTEN_MS);
  const c = await caches.open(HUELLE);
  const vorrat = await c.match(SEITE);
  /*
   * Den Text JETZT lesen, nicht erst nach dem Abruf im Hintergrund: die
   * vorgehaltene Antwort geht unten an die Seite, und danach lässt sie sich
   * nicht mehr lesen (`clone` wirft, der Rumpf ist vergeben). Der Vergleich
   * scheiterte dann still, und ein Deploy fiel beim Seitenaufruf nie auf.
   */
  const alterText = vorrat ? await vorrat.clone().text() : null;
  const startbereit = alterText !== null ? await huelleStartbereit(alterText) : false;

  /*
   * LÄUFT DIE ABLAGE NACH DEM KURZEN HALT NOCH, kein zweiter Vergleich: er
   * holte über dieselbe zähe Verbindung dieselben Bausteine noch einmal. Die
   * laufende Ablage meldet die neue Fassung, sobald sie liegt.
   */
  if (vorrat && startbereit && laufendeAblage) {
    event.waitUntil(laufendeAblage);
    return vorrat;
  }

  const holen = fetch(new Request(SEITE, { cache: 'reload' })).catch(() => null);
  const nachziehen = holen
    .then(async (res) => {
      if (!res || !res.ok) return;
      await huelleAblegen(c, alterText, startbereit, res, async () => {
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
        /*
         * Die Seite, die gerade lädt, bekommt die frische Hülle, wenn die
         * vorgehaltene nicht starten kann (unten) — ihr eine „neue Fassung“
         * zu melden, hiesse ein überflüssiges „Jetzt laden“.
         */
        await allenFensternSagen('neueFassung', vorrat && !startbereit ? event.resultingClientId : undefined);
      });
    })
    .catch(() => undefined);

  /*
   * EINE HUELLE, DIE NICHT STARTEN KANN, NICHT AUSLIEFERN.
   *
   * Fehlt ein Baustein, mit dem die vorgehaltene Hülle startet, holt der
   * Browser ihn übers Netz. Nach einem Deploy gibt es ihn dort nicht mehr —
   * Hosting antwortet mit der neuen Startseite, der Worker macht daraus einen
   * Fehlschlag, und der Einstieg der Seite scheitert: weiß, bis jemand neu
   * lädt. Dann wird auf die frische Seite gewartet. Ohne Netz bleibt es bei
   * der vorgehaltenen — sie ist dann die einzige Chance, und der HTTP-Speicher
   * des Browsers hat den Baustein vielleicht noch.
   */
  if (vorrat && !startbereit) {
    const frisch = await holen;
    await nachziehen;
    if (frisch && frisch.ok) return frisch;
    return vorrat;
  }

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
  const res = await holen;
  await nachziehen;
  return res ?? new Response('Offline und noch nichts gespeichert.', { status: 503 });
}

async function allenFensternSagen(nachricht, ausser) {
  const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const f of fenster) if (!ausser || f.id !== ausser) f.postMessage(nachricht);
}

/*
 * Ist das die Antwort auf DIESE Frage — oder die Startseite?
 *
 * DER FEHLER, DEN DAS VERHINDERT, IST AUS DEM BETRIEB GEMELDET WORDEN:
 * „'text/html' is not a valid JavaScript MIME type."
 *
 * Firebase Hosting leitet mit `"source": "**"` JEDE unbekannte Adresse auf
 * `index.html` um — mit Status 200 und `text/html`. Eine Bausteindatei, die
 * es nach einem Deploy nicht mehr gibt, sieht damit nicht wie ein Fehler aus,
 * sondern wie ein Erfolg. Die Prüfung `res.ok && res.status === 200` hat
 * genau das durchgewinkt: die Startseite landete im Speicher UNTER DEM NAMEN
 * DER JAVASCRIPT-DATEI. Danach lieferte der Worker sie von dort aus, ohne das
 * Netz überhaupt noch zu fragen — der Fehler blieb also stehen.
 *
 * Der Deploy selbst ist nicht die Ursache: gefragt wird nach der Datei nur
 * dann, wenn eine Ansicht ERSTMALS geöffnet wird, während die Seite noch die
 * alte Fassung ist. Wer eine Ansicht schon offen hatte, bekommt sie weiter
 * aus dem Speicher.
 */
function istStartseiteStattBaustein(url, res) {
  const typ = res.headers.get('content-type') || '';
  return /\.(js|mjs|css)$/.test(url.pathname) && typ.includes('text/html');
}

/*
 * EIN BAUSTEIN, DESSEN ABRUF STILLSTEHT, ENDET (01.11.2026: „lädt beim
 * Seitenwechsel manchmal gar nicht mehr“). Ohne Frist wartete der Abruf auf
 * einer halb toten Verbindung, bis der Browser aufgab — am Telefon Minuten
 * oder nie, und die Seite blieb so lange auf der alten stehen. Abgebrochen
 * wird nur bei STILLSTAND: keine Antwort binnen der Frist, oder mitten im
 * Rumpf keine Daten mehr. Was fließt, darf dauern. Der Abbruch ist für die
 * Seite ein gescheitertes Nachladen, und das heilt sie durch Neuladen.
 */
const BAUSTEIN_STILLSTAND_MS = 20000;

async function holenBisStillstand(request) {
  const steuer = new AbortController();
  let uhr = setTimeout(() => steuer.abort(), BAUSTEIN_STILLSTAND_MS);
  let res;
  try {
    res = await fetch(request, { signal: steuer.signal });
  } finally {
    clearTimeout(uhr);
  }
  if (!res.body) return res;
  const leser = res.body.getReader();
  let zu = false;
  const rumpf = new ReadableStream({
    pull(ziel) {
      return new Promise((fertig) => {
        uhr = setTimeout(() => {
          if (zu) return;
          zu = true;
          steuer.abort();
          leser.cancel().catch(() => undefined);
          ziel.error(new TypeError('Failed to fetch — der Baustein stand still'));
          fertig();
        }, BAUSTEIN_STILLSTAND_MS);
        leser.read().then(
          ({ done, value }) => {
            clearTimeout(uhr);
            if (!zu) {
              if (done) {
                zu = true;
                ziel.close();
              } else {
                ziel.enqueue(value);
              }
            }
            fertig();
          },
          (fehler) => {
            clearTimeout(uhr);
            if (!zu) {
              zu = true;
              ziel.error(fehler);
            }
            fertig();
          },
        );
      });
    },
    cancel(grund) {
      zu = true;
      clearTimeout(uhr);
      return leser.cancel(grund);
    },
  });
  return new Response(rumpf, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function erstSpeicherDannNetz(event, request, url) {
  const c = await caches.open(TEILE);
  const treffer = await c.match(request);
  if (treffer) return treffer;
  const res = await holenBisStillstand(request);

  if (istStartseiteStattBaustein(url, res)) {
    /*
     * NICHT aufheben — und einen erkennbaren Fehler daraus machen.
     *
     * Die MIME-Meldung des Browsers lautet je nach Browser anders und ist
     * schwer sicher zu erkennen. Ein sauberer Fehlschlag ergibt dagegen
     * überall dieselbe Meldung („Failed to fetch dynamically imported
     * module"), auf die sich die Fehlergrenze verlassen kann. Der Grund steht
     * im Statustext, damit er beim Nachsehen nicht verlorengeht.
     */
    /*
     * UND SOFORT DIE HUELLE ERNEUERN.
     *
     * Ein Baustein, den es auf dem Server nicht mehr gibt, ist der
     * verlässlichste Hinweis auf einen Deploy, den dieser Worker je bekommt —
     * verlässlicher als der Textvergleich, denn hier ist der Beweis schon da.
     * Ohne das lud die Seite gleich darauf in DIESELBE alte Hülle zurück und
     * scheiterte am selben Baustein; beim zweiten Mal griff der
     * Schleifenschutz, und übrig blieb die Fehlertafel.
     */
    event.waitUntil(aufNeueFassungPruefen());

    return new Response('', {
      status: 504,
      statusText: 'Veralteter Baustein nach einem Deploy',
    });
  }

  // Nur vollständige Antworten aufheben. Ein abgebrochener Download als
  // „gespeichert" wäre eine kaputte Datei, die nie wieder erneuert würde —
  // `put` liest den Rumpf ganz und legt bei einem Abbruch nichts ab.
  // NEBENHER, nicht davor: die Seite bekommt ihren Baustein, sobald er
  // fließt, und ein volles Speicherkontingent (iOS) lässt den Abruf nicht
  // mehr scheitern, sondern nur das Vorhalten.
  if (res.ok && res.status === 200) event.waitUntil(c.put(request, res.clone()).catch(() => undefined));
  return res;
}

/*
 * NACH DEM UEBERNEHMEN AUFRAEUMEN — ABER NICHT DIE LAUFENDE HUELLE.
 *
 * Bis 09.11.2026 flog hier der ganze Speicher der Bausteine weg, auch der
 * Einstieg der Fassung, die gerade lief. Er lag danach nur noch im
 * HTTP-Speicher des Browsers, und den räumen gerade Telefone gern. Beim
 * nächsten Deploy lieferte der Worker die vorgehaltene Hülle aus, deren
 * Einstieg es weder im Speicher noch auf dem Server mehr gab: weiße Seite.
 * Jetzt bleibt, was die vorgehaltene `index.html` zum Start braucht.
 *
 * UND WAS DIE NEUE FASSUNG SCHON GEHOLT HAT. Aufgeräumt wird beim `load`
 * der neuen Seite; bis dahin hat sie den Baustein ihrer Startansicht schon
 * geholt (`startansichtVorladen`) und holt ihn in dieser Sitzung nie wieder.
 * Flog er hier mit weg, fehlte beim nächsten Start ohne Netz genau die
 * Ansicht, die man zuletzt offen hatte. Deshalb geht nur, was beim Ablegen
 * der neuen Hülle schon lag (`alteTeileMerken`): die alten Fassungen und
 * ihre nachgeladenen Ansichten.
 */
async function teileAufraeumen() {
  const huelle = await caches.open(HUELLE);
  const liste = await huelle.match(ALTE_TEILE);
  if (!liste) return;
  const alt = new Set(await liste.json().catch(() => []));
  const vorrat = await huelle.match(SEITE);
  const behalten = new Set(vorrat ? huellenBausteine(await vorrat.text()) : []);
  const teile = await caches.open(TEILE);
  for (const req of await teile.keys()) {
    const pfad = new URL(req.url).pathname;
    if (alt.has(pfad) && !behalten.has(pfad)) await teile.delete(req);
  }
  await huelle.delete(ALTE_TEILE);
}

/* --------------------------------------------------------- Verständigung --- */

self.addEventListener('message', (event) => {
  /*
   * „Schau nach, ob es etwas Neues gibt." Die App ruft das, wenn sie wieder
   * in den Vordergrund kommt — der einzige Zeitpunkt, an dem eine
   * Startbildschirm-App auf dem Telefon verlässlich etwas tut.
   */
  if (event.data === 'aufNeueFassungPruefen') {
    /*
     * IMMER antworten, auch ohne Netz und auch ohne Unterschied.
     *
     * Ältere Fassungen der App warten darauf, BEVOR sie neu laden: lädt eine
     * zu früh, bekommt sie dieselbe alte Hülle noch einmal, scheitert am
     * selben fehlenden Baustein — und der Schleifenschutz hält sie beim
     * zweiten Mal davon ab. Bliebe die Antwort bei einem Fehlschlag aus,
     * wartete sie ins Leere.
     */
    event.waitUntil(
      aufNeueFassungPruefen()
        .catch(() => false)
        .then(() => event.source?.postMessage('fassungGeprueft')),
    );
  }

  /*
   * „Ich will auf die neue Fassung wechseln — liegt sie?“ (09.11.2026)
   *
   * Bis dahin lud die App nach der Prüfung in jedem Fall neu. Scheiterte das
   * Holen der Bausteine (schwaches Netz), lag weiter die alte Hülle, das
   * Neuladen landete auf derselben Fassung — und der nächste Start hielt das
   * für einen kaputten Wechsel und räumte mit der Notbremse alles weg
   * (`lib/erneuerung.ts`): über schwaches Netz eine weiße Seite, ohne Netz
   * gar nichts mehr. Jetzt sagt der Worker, wie es steht, und die App lädt
   * nur, wenn die neue Hülle liegt.
   *
   * `wechselLaeuft` sofort: daran erkennt die App, dass der Worker lebt und
   * arbeitet, und wartet länger als auf einen, der nicht antwortet.
   */
  if (event.data === 'fassungWechseln') {
    event.source?.postMessage('wechselLaeuft');
    angestosseneWechsel += 1;
    event.waitUntil(
      aufNeueFassungPruefen()
        .catch(() => false)
        .then((liegt) => {
          angestosseneWechsel -= 1;
          event.source?.postMessage(liegt ? 'wechselBereit' : 'wechselAusstehend');
        }),
    );
  }

  /*
   * Die App LAEUFT SCHON auf der neuen Fassung — jetzt dürfen die alten
   * Bausteine weg.
   *
   * DER ZEITPUNKT WAR VORHER FALSCH, und das hat im Betrieb zugeschlagen.
   * Aufgeräumt wurde VOR dem Neuladen, während die alte Seite noch lief und
   * bedient wurde. Wer in diesem Fenster auf einen Reiter tippte, forderte
   * einen Baustein an, den es im Speicher gerade nicht mehr und auf dem
   * Server nach dem Deploy nicht mehr gab: „undefined is not an object
   * (evaluating 'e._result.default')".
   *
   * Jetzt ruft die NEUE Seite das nach ihrem Start. Was sie danach noch
   * nachlädt, liegt auf dem Server — schlimmstenfalls kostet es eine
   * Netzrunde, nie eine Fehlertafel.
   *
   * Die Antwort zurück bleibt: der Aufrufer quittiert damit, dass das
   * Aufräumen wirklich gelaufen ist.
   */
  if (event.data === 'fassungUebernehmen') {
    event.waitUntil(
      teileAufraeumen().then(() => event.source?.postMessage('fassungUebernommen')),
    );
  }
});
