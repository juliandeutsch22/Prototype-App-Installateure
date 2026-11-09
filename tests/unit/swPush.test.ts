import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

/*
 * DIE PUSH-MELDUNG IM SERVICE WORKER (E69, 09.11.2026: „Push-Benachrichtigungen
 * für Nachrichten funktionieren immer noch nicht“). Geprüft am echten
 * `public/sw.js`, mit einem Push-Ereignis, wie der Browser es auslöst.
 *
 * Vorher lief jede Meldung durch Firebase: bei sichtbarer App gab es sie an
 * die Seite weiter und zeigte nichts, und im Hintergrund wurde die Anzeige
 * nicht abgewartet. Auf dem iPhone sind beides „stille“ Meldungen — nach
 * wenigen davon entzieht iOS das Abonnement.
 *
 * Gegenprobe: mit dem Worker vor E69 gibt es keinen eigenen `push`-Zuhörer —
 * jede Prüfung unten, die eine Anzeige erwartet, ist rot.
 */
const QUELLE = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

/** Ein Fenster der App. `antwort`: was es auf „ortGefragt“ sagt — ohne bleibt es stumm (ältere Fassung). */
interface Fenster { url: string; visibilityState: 'visible' | 'hidden'; antwort?: string }

function alsClient(f: Fenster) {
  return {
    url: f.url,
    visibilityState: f.visibilityState,
    postMessage: (frage: unknown, ports: MessagePort[]) => {
      if (frage === 'ortGefragt' && f.antwort !== undefined) ports[0].postMessage(f.antwort);
    },
  };
}

function worker(opt: { ua?: string; fenster?: Fenster[]; firebaseLaedt?: boolean } = {}) {
  const hoeren = new Map<string, ((e: unknown) => void)[]>();
  const gezeigt: { titel: string; optionen: Record<string, unknown> }[] = [];
  const firebaseGezeigt: unknown[] = [];
  const self_ = {
    location: { origin: 'https://app.test', search: '?apiKey=k&messagingSenderId=s&projectId=p&appId=a' },
    navigator: { userAgent: opt.ua ?? 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' },
    addEventListener: (name: string, fn: (e: unknown) => void) => hoeren.set(name, [...(hoeren.get(name) ?? []), fn]),
    skipWaiting: () => undefined,
    registration: {
      showNotification: async (titel: string, optionen: Record<string, unknown>) => {
        await Promise.resolve();
        gezeigt.push({ titel, optionen });
      },
    },
    clients: { claim: async () => undefined, matchAll: async () => (opt.fenster ?? []).map(alsClient), openWindow: async () => undefined },
  };
  // Firebase meldet seinen eigenen `push`-Zuhörer an — wie im Browser, nach unserem.
  const firebase = {
    initializeApp: () => undefined,
    messaging: () => {
      self_.addEventListener('push', (e) => firebaseGezeigt.push(e));
      return {};
    },
  };
  const importScripts = () => {
    if (opt.firebaseLaedt === false) throw new Error('kein Netz');
  };
  vm.runInNewContext(QUELLE, {
    self: self_, importScripts, firebase, URLSearchParams, URL, caches: {}, Response, Request, Promise, console,
    MessageChannel, setTimeout, clearTimeout,
  });

  /** Ein Push-Ereignis auslösen und abwarten, was der Worker in `waitUntil` gibt. */
  async function push(inhalt: unknown) {
    const warten: Promise<unknown>[] = [];
    let angehalten = false;
    const ereignis = {
      data: { json: () => inhalt },
      waitUntil: (p: Promise<unknown>) => warten.push(p),
      stopImmediatePropagation: () => { angehalten = true; },
    };
    for (const fn of hoeren.get('push') ?? []) {
      if (angehalten) break;
      fn(ereignis);
    }
    const vorAbwarten = gezeigt.length;
    await Promise.all(warten);
    return { vorAbwarten, gewartet: warten.length };
  }
  return { push, gezeigt, firebaseGezeigt };
}

const NACHRICHT = { data: { title: 'Max Monteur', body: 'Neue Nachricht', link: '/nachrichten/k1', tag: 'nachricht-k1' } };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

describe('Push im Service Worker', () => {
  it('zeigt die Meldung selbst und hält das Ereignis offen, bis sie steht', async () => {
    const w = worker();
    const r = await w.push(NACHRICHT);
    expect(r.gewartet).toBe(1);
    expect(r.vorAbwarten).toBe(0);
    expect(w.gezeigt).toHaveLength(1);
    expect(w.gezeigt[0].titel).toBe('Max Monteur');
    expect(w.gezeigt[0].optionen).toMatchObject({
      body: 'Neue Nachricht', tag: 'nachricht-k1', renotify: true, data: { link: '/nachrichten/k1' },
      icon: '/marke/icon-192.png', badge: '/marke/badge-96.png',
    });
    // Firebase sieht die eigene Meldung nicht mehr — sonst gäbe es sie bei offener App an die Seite.
    expect(w.firebaseGezeigt).toHaveLength(0);
  });

  it('zeigt sie auch bei offener App, wenn man woanders steht', async () => {
    const w = worker({ fenster: [{ url: 'https://app.test/', visibilityState: 'visible' }] });
    await w.push(NACHRICHT);
    expect(w.gezeigt).toHaveLength(1);
  });

  it('im Gespräch selbst keine Meldung — außer auf dem iPhone, dort ohne Ton', async () => {
    const dort: Fenster[] = [{ url: 'https://app.test/nachrichten/k1', visibilityState: 'visible', antwort: '/nachrichten/k1' }];
    const android = worker({ fenster: dort });
    await android.push(NACHRICHT);
    expect(android.gezeigt).toHaveLength(0);

    const iphone = worker({ fenster: dort, ua: IPHONE });
    await iphone.push(NACHRICHT);
    expect(iphone.gezeigt).toHaveLength(1);
    expect(iphone.gezeigt[0].optionen).toMatchObject({ silent: true, renotify: false, tag: 'nachricht-k1' });

    // Im Hintergrund offen zählt nicht als „dort“.
    const versteckt = worker({ fenster: [{ url: 'https://app.test/nachrichten/k1', visibilityState: 'hidden' }] });
    await versteckt.push(NACHRICHT);
    expect(versteckt.gezeigt[0].optionen).toMatchObject({ renotify: true });
  });

  it('fragt das Fenster, wo es steht — die App wechselt Seiten ohne Neuladen', async () => {
    // Geladen auf der Startseite, inzwischen im Gespräch: die bekannte Adresse ist veraltet.
    const ins = worker({ fenster: [{ url: 'https://app.test/', visibilityState: 'visible', antwort: '/nachrichten/k1' }] });
    await ins.push(NACHRICHT);
    expect(ins.gezeigt).toHaveLength(0);
    // Umgekehrt: geladen im Gespräch, inzwischen woanders.
    const raus = worker({ fenster: [{ url: 'https://app.test/nachrichten/k1', visibilityState: 'visible', antwort: '/' }] });
    await raus.push(NACHRICHT);
    expect(raus.gezeigt).toHaveLength(1);
  });

  it('antwortet das Fenster nicht, gilt die bekannte Adresse', async () => {
    const stumm = worker({ fenster: [{ url: 'https://app.test/nachrichten/k1', visibilityState: 'visible' }] });
    await stumm.push(NACHRICHT);
    expect(stumm.gezeigt).toHaveLength(0);
    const woanders = worker({ fenster: [{ url: 'https://app.test/', visibilityState: 'visible' }] });
    await woanders.push(NACHRICHT);
    expect(woanders.gezeigt).toHaveLength(1);
  });

  it('zeigt auch, wenn die Firebase-Bibliotheken nicht geladen werden konnten', async () => {
    const w = worker({ firebaseLaedt: false });
    await w.push(NACHRICHT);
    expect(w.gezeigt).toHaveLength(1);
  });

  it('lässt fremde Meldungen (ohne unsere Felder) bei Firebase', async () => {
    const w = worker();
    await w.push({ notification: { title: 'Aus der Konsole' } });
    expect(w.gezeigt).toHaveLength(0);
    expect(w.firebaseGezeigt).toHaveLength(1);
  });

  it('ohne Angaben dieselben Rückfälle', async () => {
    const w = worker();
    await w.push({ data: { title: '' } });
    expect(w.gezeigt[0]).toMatchObject({ titel: 'Senklot', optionen: { body: '', tag: 'perl-allgemein', data: { link: '/' } } });
  });
});
