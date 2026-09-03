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
let echteLocation: PropertyDescriptor | undefined;

beforeEach(() => {
  gesendet.length = 0;
  reload.mockClear();
  sessionStorage.clear();

  echteLocation = Object.getOwnPropertyDescriptor(window, 'location');
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: { postMessage: (m: string) => gesendet.push(m) },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      getRegistration: async () => undefined,
      register: async () => undefined,
    },
  });
});

afterEach(() => {
  if (echteLocation) Object.defineProperty(window, 'location', echteLocation);
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

const { neueFassungUebernehmen } = await import('@/lib/sw');

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
    expect(sessionStorage.getItem('perl:aufraeumen')).toBe('1');
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
