import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

/**
 * Der Service Worker — mit dem ECHTEN Quelltext geprüft, nicht nachgebaut.
 *
 * WARUM DER AUFWAND. Er ist das gefährlichste neue Stück der App. Ein Service
 * Worker ist zäh: was er einmal falsch macht, macht er weiter, auch nach
 * einem Deploy, und der Benutzer kommt nicht dagegen an. Zwei Fehler wären
 * schwerwiegend:
 *
 *   1. Er hält eine Firestore-Antwort vor. Dann sieht jemand einen
 *      Kontostand, den es nicht mehr gibt — und glaubt ihm.
 *   2. Er merkt einen Deploy nicht. Dann arbeitet der Betrieb auf einer
 *      Fassung, die längst ersetzt ist.
 *
 * Beides steht hier. Die Datei wird dafür in eine Sandbox geladen, in der
 * `caches`, `fetch` und `self` nachgebildet sind — so läuft genau der Code,
 * der später ausgeliefert wird.
 */

const QUELLE = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

/** Ein Zwischenspeicher im Arbeitsspeicher — genug für das, was der SW tut. */
class TestCache {
  eintraege = new Map<string, Response>();
  async match(req: Request | string) {
    return this.eintraege.get(typeof req === 'string' ? req : req.url.replace(/^https?:\/\/[^/]+/, ''));
  }
  async put(req: Request | string, res: Response) {
    this.eintraege.set(typeof req === 'string' ? req : req.url.replace(/^https?:\/\/[^/]+/, ''), res);
  }
  async add(req: Request) {
    const res = await (globalThis as unknown as { fetch: typeof fetch }).fetch(req);
    await this.put(req, res);
  }
}

interface SwUmgebung {
  hoeren: Map<string, ((e: unknown) => void)[]>;
  speicher: Map<string, TestCache>;
  geholt: string[];
  gesagt: string[];
  antwort: (url: string) => Response;
  /** Schickt dem Worker eine Nachricht aus einem Fenster und wartet sie ab. */
  nachricht: (data: unknown) => Promise<void>;
}

/** Lädt sw.js in eine Sandbox und gibt die Umgebung zurück. */
function ladeWorker(): SwUmgebung {
  const hoeren = new Map<string, ((e: unknown) => void)[]>();
  const speicher = new Map<string, TestCache>();
  const geholt: string[] = [];
  const gesagt: string[] = [];
  const umgebung: SwUmgebung = {
    hoeren,
    speicher,
    geholt,
    gesagt,
    antwort: () => new Response('erste Fassung', { status: 200 }),
    nachricht: async () => undefined,
  };

  const fenster = { postMessage: (m: unknown) => gesagt.push(String(m)) };

  umgebung.nachricht = async (data: unknown) => {
    // `waitUntil` ist hier kein Beiwerk: der Worker raeumt darin auf, und
    // ohne das Abwarten prueft der Test einen Zwischenstand.
    const warten: Promise<unknown>[] = [];
    const ereignis = {
      data,
      source: fenster,
      waitUntil: (pr: Promise<unknown>) => warten.push(pr),
    };
    hoeren.get('message')?.forEach((fn) => fn(ereignis));
    await Promise.all(warten);
  };

  const self_ = {
    location: { origin: 'https://app.test', search: '?apiKey=k&messagingSenderId=s' },
    addEventListener: (name: string, fn: (e: unknown) => void) => {
      hoeren.set(name, [...(hoeren.get(name) ?? []), fn]);
    },
    skipWaiting: () => undefined,
    registration: { showNotification: () => undefined },
    clients: {
      claim: async () => undefined,
      matchAll: async () => [fenster],
      openWindow: async () => undefined,
    },
  };

  const sandbox = {
    self: self_,
    // Die Firebase-Bibliotheken kommen im Betrieb aus dem Netz. Hier schlägt
    // das absichtlich fehl — und der Worker muss trotzdem laufen, sonst gäbe
    // es bei schlechtem Empfang gar keine vorgehaltene App.
    importScripts: () => {
      throw new Error('kein Netz');
    },
    caches: {
      open: async (name: string) => {
        if (!speicher.has(name)) speicher.set(name, new TestCache());
        return speicher.get(name)!;
      },
      keys: async () => [...speicher.keys()],
      delete: async (name: string) => speicher.delete(name),
    },
    fetch: async (req: Request | string) => {
      const url = typeof req === 'string' ? req : req.url;
      geholt.push(url);
      return umgebung.antwort(url);
    },
    URL,
    URLSearchParams,
    /**
     * Im Browser löst ein Service Worker `/index.html` gegen seine eigene
     * Adresse auf. Node kann das nicht und wirft. Das ist ein Unterschied der
     * Umgebung, kein Fehler im Worker — also hier nachgebildet, statt den
     * Quelltext für den Test zu verbiegen.
     */
    Request: class extends Request {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(
          typeof input === 'string' && input.startsWith('/')
            ? `https://app.test${input}`
            : input,
          init,
        );
      }
    },
    Response,
    Promise,
    console,
  };

  vm.runInNewContext(QUELLE, sandbox);
  return umgebung;
}

/** Löst das fetch-Ereignis aus und gibt zurück, ob der SW geantwortet hat. */
async function anfrage(u: SwUmgebung, url: string, mode = 'no-cors', method = 'GET') {
  let antwort: Promise<Response> | null = null;
  const ereignis = {
    request: new Request(url, { method }),
    respondWith: (p: Promise<Response>) => {
      antwort = p;
    },
    // Der Browser haelt den Worker damit am Leben, bis die Hintergrundpruefung
    // fertig ist. Hier nur entgegennehmen — der Test wartet ueber `waitFor`.
    waitUntil: (p: Promise<unknown>) => void p.catch(() => undefined),
  };
  // `mode` lässt sich an einem Request nicht setzen — der SW liest ihn, also
  // hier überschreiben.
  Object.defineProperty(ereignis.request, 'mode', { value: mode });
  u.hoeren.get('fetch')?.forEach((fn) => fn(ereignis));
  return antwort ? await (antwort as Promise<Response>) : null;
}

let u: SwUmgebung;
beforeEach(() => {
  u = ladeWorker();
});

describe('Service Worker — was er anfasst', () => {
  it('laesst Firestore in Ruhe', async () => {
    /**
     * DER SCHWERWIEGENDE FEHLER. Eine vorgehaltene Datenbankantwort wäre ein
     * falscher Kontostand, ein falscher Lagerbestand, eine Rechnung mit einer
     * Nummer, die es schon gibt. Der Firestore-Client hat seinen eigenen,
     * richtigen Zwischenspeicher — der hier hat davon die Finger zu lassen.
     */
    expect(
      await anfrage(u, 'https://firestore.googleapis.com/v1/projects/x/databases/(default)'),
    ).toBeNull();
    expect(await anfrage(u, 'https://identitytoolkit.googleapis.com/v1/accounts')).toBeNull();
    expect(
      await anfrage(u, 'https://europe-west3-x.cloudfunctions.net/urlaubEntscheiden'),
    ).toBeNull();
  });

  it('laesst Schreibvorgaenge in Ruhe', async () => {
    // Ein vorgehaltenes POST ergäbe keinen Sinn und wäre gefährlich.
    expect(await anfrage(u, 'https://app.test/assets/x.js', 'no-cors', 'POST')).toBeNull();
  });

  it('haelt die eigenen Bausteine vor', async () => {
    const erste = await anfrage(u, 'https://app.test/assets/index-abc123.js');
    expect(erste).not.toBeNull();
    expect(u.geholt).toContain('https://app.test/assets/index-abc123.js');

    // Beim zweiten Mal aus dem Speicher — kein weiterer Netzzugriff. Genau
    // das ist der Unterschied zwischen „lädt ewig" und „ist sofort da".
    u.geholt.length = 0;
    await anfrage(u, 'https://app.test/assets/index-abc123.js');
    expect(u.geholt).toEqual([]);
  });

  it('haelt eine unvollstaendige Antwort NICHT vor', async () => {
    /**
     * Ein abgebrochener Download als „gespeichert" wäre eine kaputte Datei,
     * die nie wieder erneuert würde — der schlimmste Zustand überhaupt, weil
     * kein Neuladen ihn behebt.
     */
    u.antwort = () => new Response('', { status: 504 });
    await anfrage(u, 'https://app.test/assets/kaputt.js');
    u.geholt.length = 0;
    await anfrage(u, 'https://app.test/assets/kaputt.js');
    expect(u.geholt).toEqual(['https://app.test/assets/kaputt.js']);
  });
});

describe('Service Worker — neue Fassung erkennen', () => {
  it('liefert beim zweiten Aufruf sofort aus dem Speicher', async () => {
    await anfrage(u, 'https://app.test/', 'navigate');
    const zweite = await anfrage(u, 'https://app.test/zeit', 'navigate');
    expect(await zweite!.text()).toBe('erste Fassung');
  });

  it('meldet einen Deploy, weil sich index.html geaendert hat', async () => {
    /**
     * `index.html` ist die einzige Datei, deren Name gleich bleibt — alle
     * anderen tragen einen Fingerabdruck. Ändert sich ihr INHALT, zeigt sie
     * auf neue Bausteine, und es gab einen Deploy. Etwas anderes weiß der
     * Worker nicht darüber.
     */
    await anfrage(u, 'https://app.test/', 'navigate');
    u.antwort = () => new Response('zweite Fassung', { status: 200 });

    await anfrage(u, 'https://app.test/', 'navigate');
    // Der Vergleich läuft im Hintergrund weiter, nachdem geantwortet wurde.
    await vi.waitFor(() => expect(u.gesagt).toContain('neueFassung'));
  });

  it('behaelt die alten Bausteine, solange die alte Seite laeuft', async () => {
    /**
     * DER FEHLER, DEN DIESER TEST FESTHAELT. Vorher flogen die alten
     * Bausteine schon beim ERKENNEN des Deploys raus. Die Seite, die gerade
     * lief, war aber noch die alte und forderte sie weiter an — im Speicher
     * geloescht, auf dem Server nach dem Deploy nicht mehr vorhanden. Seit
     * dem Code-Splitting laedt jede Ansicht erst beim Oeffnen nach, der
     * Monteur bekam also statt des Scheins eine Fehlermeldung.
     */
    await anfrage(u, 'https://app.test/assets/alt-111.js');
    await anfrage(u, 'https://app.test/', 'navigate');
    u.antwort = (url) =>
      new Response(url.endsWith('/index.html') ? 'zweite Fassung' : 'x', { status: 200 });

    await anfrage(u, 'https://app.test/', 'navigate');
    await vi.waitFor(() => expect(u.gesagt).toContain('neueFassung'));

    // Der Deploy ist gemeldet — und der alte Baustein liegt weiterhin bereit.
    expect(u.speicher.get('perl-teile')?.eintraege.has('/assets/alt-111.js')).toBe(true);
    u.geholt.length = 0;
    await anfrage(u, 'https://app.test/assets/alt-111.js');
    expect(u.geholt).toEqual([]);
  });

  it('raeumt erst auf, wenn die neue Fassung uebernommen wird', async () => {
    // Dann fordert sie niemand mehr an: die App laedt unmittelbar danach neu.
    await anfrage(u, 'https://app.test/assets/alt-111.js');
    await anfrage(u, 'https://app.test/', 'navigate');
    u.antwort = (url) =>
      new Response(url.endsWith('/index.html') ? 'zweite Fassung' : 'x', { status: 200 });
    await anfrage(u, 'https://app.test/', 'navigate');
    await vi.waitFor(() => expect(u.gesagt).toContain('neueFassung'));

    await u.nachricht('fassungUebernehmen');

    expect(u.speicher.has('perl-teile')).toBe(false);
    // Die Bestaetigung zurueck — der Aufrufer wartet darauf, damit das
    // Neuladen nicht mitten ins Loeschen faellt.
    expect(u.gesagt).toContain('fassungUebernommen');
  });

  it('meldet beim ERSTEN Besuch keine neue Fassung', async () => {
    // Sonst begrüßte die App jeden neuen Benutzer mit „es gibt eine neue
    // Fassung" — es gibt ja noch gar keine alte.
    await anfrage(u, 'https://app.test/', 'navigate');
    expect(u.gesagt).toEqual([]);
  });
});

describe('Service Worker — was er aushalten muss', () => {
  it('laeuft, obwohl die Firebase-Bibliotheken nicht geladen werden konnten', () => {
    /**
     * `importScripts` holt sie aus dem Netz. Beim allerersten Start ohne
     * Empfang schlägt das fehl. Würde der Worker daran scheitern, gäbe es
     * auch keine vorgehaltene App-Hülle — also ausgerechnet dann nichts,
     * wenn man sie am dringendsten braucht.
     */
    expect(u.hoeren.has('fetch')).toBe(true);
    expect(u.hoeren.has('install')).toBe(true);
    expect(u.hoeren.has('activate')).toBe(true);
  });

  it('liefert offline und ohne Vorrat eine erklaerbare Antwort', async () => {
    u.antwort = () => {
      throw new Error('offline');
    };
    const res = await anfrage(u, 'https://app.test/', 'navigate');
    expect(res!.status).toBe(503);
  });
});
