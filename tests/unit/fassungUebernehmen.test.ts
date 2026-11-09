// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Die REIHENFOLGE beim Wechsel auf eine neue Fassung.
 *
 * AUS DEM BETRIEB GEMELDET, auf dem iPhone kurz nach einem Deploy:
 *
 *   undefined is not an object (evaluating 'e._result.default')
 *
 * Die Ursache war die Reihenfolge, nicht die Handlung. Der Wechsel liess den
 * Service Worker ERST die alten Bausteine loeschen und wartete auf seine
 * Bestaetigung, bevor er neu lud. In diesen bis zu zwei Sekunden lief die
 * ALTE Seite weiter und wurde bedient. Wer in diesem Fenster auf einen
 * Reiter tippte, forderte einen Baustein an, den es im Speicher gerade nicht
 * mehr und auf dem Server nach dem Deploy nicht mehr gab.
 *
 * Solange nur jemand bewusst auf „Jetzt laden" tippte, war das ein seltenes
 * Fenster. Mit der stillen Uebernahme beim Kaltstart wurde daraus der
 * Regelfall — sie laeuft bei jedem Start nach einem Deploy, unsichtbar.
 *
 * Deshalb steht hier eine einzige Zusicherung: BEIM WECHSEL WIRD NICHT
 * AUFGERAEUMT. Nur geladen.
 */

const gesendet: string[] = [];
const reload = vi.fn();
/** Was der Worker auf eine Frage antwortet — leer: er antwortet nicht. */
let antworten: (frage: string) => string[] = () => [];
const hoerer = new Set<(e: MessageEvent) => void>();
let echteLocation: PropertyDescriptor | undefined;

beforeEach(() => {
  gesendet.length = 0;
  reload.mockClear();
  antworten = () => [];
  hoerer.clear();
  sessionStorage.clear();
  localStorage.clear();

  echteLocation = Object.getOwnPropertyDescriptor(window, 'location');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {
        postMessage: (m: string) => {
          gesendet.push(m);
          // Wie im Browser: die Antworten kommen später, nicht noch im Aufruf.
          for (const a of antworten(m)) queueMicrotask(() => hoerer.forEach((h) => h(new MessageEvent('message', { data: a }))));
        },
      },
      addEventListener: (_art: string, h: (e: MessageEvent) => void) => hoerer.add(h),
      removeEventListener: (_art: string, h: (e: MessageEvent) => void) => hoerer.delete(h),
      getRegistration: async () => undefined,
      register: async () => undefined,
    },
  });
});

afterEach(() => {
  if (echteLocation) Object.defineProperty(window, 'location', echteLocation);
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

const { neueFassungUebernehmen, huelleErneuernUndNeuLaden } = await import('@/lib/sw');
const { FASSUNG } = await import('@/lib/fassung');
const { darfHartErneuern } = await import('@/lib/erneuerung');

describe('Auf die neue Fassung wechseln', () => {
  it('laedt neu, OHNE vorher aufraeumen zu lassen', async () => {
    /**
     * Die eine Zusicherung, an der der gemeldete Fehler haengt. Ein
     * `fassungUebernehmen` an dieser Stelle loescht die Bausteine, die die
     * noch laufende alte Seite im naechsten Moment anfordern koennte.
     */
    await neueFassungUebernehmen();

    expect(gesendet).not.toContain('fassungUebernehmen');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('merkt sich, dass beim naechsten Start aufzuraeumen ist', async () => {
    // Sonst blieben die alten Bausteine mit jedem Deploy liegen, und der
    // Speicher der Startbildschirm-App waechst ohne Grenze.
    await neueFassungUebernehmen();
    expect(sessionStorage.getItem('senklot:aufraeumen')).toBe('1');
  });

  it('haelt fest, VON WELCHER Fassung aus gewechselt wurde', async () => {
    /**
     * Ohne diesen Merker laesst sich nach dem Neuladen nicht sagen, ob der
     * Wechsel etwas gebracht hat — und genau daran haengt die Notbremse in
     * `lib/erneuerung.ts`. Aus dem Betrieb gemeldet: „ich muss die App jedes
     * Mal vom Homescreen loeschen und neu speichern."
     *
     * Er liegt im LOKALEN Speicher, nicht im Sitzungsspeicher: iOS beendet
     * eine Startbildschirm-App jederzeit, und genau ueber diese Grenze
     * hinweg muss die Feststellung tragen.
     */
    await neueFassungUebernehmen();
    expect(localStorage.getItem('perl:letzterVersuch')).toBe(FASSUNG);
  });

  it('laedt auch dann, wenn nichts gemerkt werden kann', async () => {
    /**
     * Privates Fenster oder abgeschaltete Website-Daten. Dann bleiben die
     * alten Bausteine eine Fassung laenger liegen — das kostet Speicher.
     * Nicht zu laden waere dagegen eine App, die auf einem alten Stand
     * feststeckt.
     */
    const echt = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('gesperrt');
      },
    });
    try {
      await neueFassungUebernehmen();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      if (echt) Object.defineProperty(window, 'sessionStorage', echt);
    }
  });
});

/*
  NUR LADEN, WENN DIE NEUE HÜLLE LIEGT (09.11.2026). Kamen die Bausteine der
  neuen Fassung über ein schwaches Netz nicht an, lud die App trotzdem neu,
  landete auf derselben Fassung — und weil der Versuch vorgemerkt war, räumte
  der nächste Start mit der Notbremse alles weg: weiße Seite, ohne Netz gar
  nichts mehr.
*/
describe('Wechseln nach dem Stand des Workers', () => {
  it('stehen die Bausteine still, wird weder geladen noch der Versuch vorgemerkt — die Notbremse bleibt entschärft', async () => {
    antworten = (f) => (f === 'fassungWechseln' ? ['wechselLaeuft', 'wechselAusstehend'] : []);

    expect(await neueFassungUebernehmen()).toBe('ausstehend');

    expect(reload).not.toHaveBeenCalled();
    expect(localStorage.getItem('perl:letzterVersuch')).toBeNull();
    expect(sessionStorage.getItem('senklot:aufraeumen')).toBeNull();
    expect(darfHartErneuern(FASSUNG)).toBe(false);
  });

  it('liegt die neue Hülle, wird vorgemerkt und geladen', async () => {
    antworten = (f) => (f === 'fassungWechseln' ? ['wechselLaeuft', 'wechselBereit'] : []);

    expect(await neueFassungUebernehmen()).toBe('neuGeladen');

    expect(gesendet).toEqual(['fassungWechseln']);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('perl:letzterVersuch')).toBe(FASSUNG);
  });

  it('arbeitet der Worker, wird länger gewartet als auf einen, der nicht antwortet — reicht das Netz auch dann nicht, wird nicht geladen', async () => {
    vi.useFakeTimers();
    try {
      antworten = (f) => (f === 'fassungWechseln' ? ['wechselLaeuft'] : []);
      let ergebnis: string | null = null;
      void neueFassungUebernehmen().then((e) => { ergebnis = e; });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(ergebnis).toBeNull();
      await vi.advanceTimersByTimeAsync(25_000);
      expect(ergebnis).toBe('ausstehend');
      expect(reload).not.toHaveBeenCalled();
      expect(localStorage.getItem('perl:letzterVersuch')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('wer inzwischen tippt, wird nicht neu geladen — auch wenn die Hülle liegt', async () => {
    antworten = (f) => (f === 'fassungWechseln' ? ['wechselLaeuft', 'wechselBereit'] : []);

    expect(await neueFassungUebernehmen(() => false)).toBe('angehalten');

    expect(reload).not.toHaveBeenCalled();
    expect(localStorage.getItem('perl:letzterVersuch')).toBeNull();
  });

  it('gleich geblieben: ohne Worker wird wie bisher vorgemerkt und geladen', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');

    expect(await neueFassungUebernehmen()).toBe('neuGeladen');

    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('perl:letzterVersuch')).toBe(FASSUNG);
  });

  it('gleich geblieben: nach einem gescheiterten Nachladen wird in jedem Fall neu geladen', async () => {
    // Die Seite ist dann schon kaputt; nur das Neuladen heilt sie.
    antworten = (f) => (f === 'fassungWechseln' ? ['wechselLaeuft', 'wechselAusstehend'] : []);

    await huelleErneuernUndNeuLaden();

    expect(gesendet).toEqual(['fassungWechseln']);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
