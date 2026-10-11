// @vitest-environment jsdom
/**
 * Der Service Worker meldet sich an — auch wenn die Seite schon fertig ist.
 *
 * GEFUNDEN AM 11.10.2026 beim Durchgang zu den Sicherheits-Kopfzeilen: in der
 * Vorschau des fertigen Baus lief nie ein Worker. Die Anmeldung wartete auf
 * `window.load`, aufgerufen wurde sie aber erst im Effekt von `NeueFassung`
 * — da war `load` schon vorbei und kam nie wieder.
 *
 * Gegenprobe: gegen den Stand davor bleibt `register` bei fertiger Seite
 * ungerufen (rot). Gleich bleibt: auf eine noch ladende Seite wird gewartet,
 * und im Entwicklungsbetrieb meldet sich keiner an.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const register = vi.fn(async () => undefined);
const gesendet: string[] = [];
let zustand: DocumentReadyState = 'complete';

beforeEach(() => {
  register.mockClear();
  gesendet.length = 0;
  sessionStorage.clear();
  vi.stubEnv('DEV', false);
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => zustand });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: { postMessage: (m: string) => gesendet.push(m) },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      getRegistration: async () => undefined,
      register,
    },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(document, 'readyState');
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

const { serviceWorkerAnmelden } = await import('@/lib/sw');

describe('Service Worker anmelden', () => {
  // Diese beiden zuerst: ein Hörer auf `load`, den ein früherer Fall
  // angemeldet hat, bliebe am Fenster hängen und feuerte hier mit.
  it('wartet auf eine Seite, die noch lädt', () => {
    zustand = 'interactive';
    serviceWorkerAnmelden(() => undefined);
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('im Entwicklungsbetrieb meldet sich keiner an', () => {
    vi.stubEnv('DEV', true);
    zustand = 'complete';
    serviceWorkerAnmelden(() => undefined);
    expect(register).not.toHaveBeenCalled();
  });

  it('meldet sich sofort an, wenn die Seite schon geladen ist', () => {
    zustand = 'complete';
    serviceWorkerAnmelden(() => undefined);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]).toEqual([expect.stringMatching(/^\/sw\.js\?apiKey=/)]);
  });

  it('räumt nach einem Wechsel auch dann auf', () => {
    zustand = 'complete';
    sessionStorage.setItem('senklot:aufraeumen', '1');
    serviceWorkerAnmelden(() => undefined);
    expect(gesendet).toEqual(['fassungUebernehmen']);
    expect(sessionStorage.getItem('senklot:aufraeumen')).toBeNull();
  });
});
