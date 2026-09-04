// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  uebernahmeVormerken,
  uebernahmeAufraeumen,
  darfHartErneuern,
  appHartErneuern,
} from '@/lib/erneuerung';

/**
 * Die Notbremse, wenn das Übernehmen einer neuen Fassung NICHT greift.
 *
 * AUS DEM BETRIEB GEMELDET, mehrfach: „bei der am Homescreen gespeicherten
 * Version funktioniert das automatische Updaten immer noch nicht, ich muss
 * sie jedes Mal löschen und neu speichern."
 *
 * Hier stehen genau zwei Fragen, und beide können teuer falsch ausgehen:
 *
 *   WANN wird hart geräumt. Zu früh, und ein gewöhnlicher Deploy wirft dem
 *   Monteur die App weg. Zu spät oder nie, und das Telefon steckt weiter
 *   fest — das ist der gemeldete Zustand.
 *
 *   WIE OFT. Hilft das Räumen nicht, weil der Fehler woanders liegt, lädt
 *   das Telefon ohne Schleifenschutz in Dauerschleife neu und ist auf der
 *   Baustelle unbrauchbar. Das wäre schlimmer als der Ausgangsfehler.
 */

const ALT = 'aaa111 · 01.01.2026, 10:00';
const NEU = 'bbb222 · 02.01.2026, 10:00';

beforeEach(() => {
  localStorage.clear();
});

describe('erkennen, dass ein Wechsel nicht gewirkt hat', () => {
  it('räumt NICHT, solange gar kein Wechsel versucht wurde', () => {
    // Der gewöhnliche Fall: ein Deploy ist da, die App hat ihn noch gar
    // nicht zu übernehmen versucht. Hier ist nichts widerlegt.
    expect(darfHartErneuern(ALT)).toBe(false);
  });

  it('räumt, wenn nach dem Versuch dieselbe Fassung weiterläuft', () => {
    // Genau der gemeldete Zustand: gewechselt wurde, angekommen ist nichts.
    uebernahmeVormerken(ALT);
    expect(darfHartErneuern(ALT)).toBe(true);
  });

  it('räumt kein zweites Mal für dieselbe Fassung', () => {
    // Der Schleifenschutz. Ohne ihn lädt das Telefon endlos neu, falls das
    // Räumen den Fehler nicht behebt.
    uebernahmeVormerken(ALT);
    expect(darfHartErneuern(ALT)).toBe(true);
    expect(darfHartErneuern(ALT)).toBe(false);
    expect(darfHartErneuern(ALT)).toBe(false);
  });

  it('räumt NICHT, wenn der Versuch von einer anderen Fassung ausging', () => {
    /*
      Ein alter Merker aus einer früheren Fassung darf die neue nicht
      wegräumen. Er beweist nichts über sie — sie hat noch gar nichts
      versucht.
    */
    uebernahmeVormerken(ALT);
    expect(darfHartErneuern(NEU)).toBe(false);
  });
});

describe('nach einem geglückten Wechsel entschärfen', () => {
  it('vergisst den Versuch, sobald eine andere Fassung läuft', () => {
    /*
      Ohne dieses Vergessen bliebe die Notbremse für immer scharf: der
      Merker zeigte auf eine Fassung, die längst abgelöst ist, und beim
      übernächsten Deploy schlüge sie grundlos zu.
    */
    uebernahmeVormerken(ALT);
    uebernahmeAufraeumen(NEU);
    expect(darfHartErneuern(ALT)).toBe(false);
  });

  it('behält den Versuch, solange dieselbe Fassung läuft', () => {
    // Der Start NACH dem gescheiterten Wechsel. Hier darf nichts vergessen
    // werden, sonst erfährt die Notbremse nie von ihrem Anlass.
    uebernahmeVormerken(ALT);
    uebernahmeAufraeumen(ALT);
    expect(darfHartErneuern(ALT)).toBe(true);
  });

  it('macht den Schleifenschutz wieder frei — auch für dieselbe Fassung', () => {
    /*
      DER FALL, DER DIESE ZEILE BRAUCHT, IST EIN RUECKZIEHER. Stellt sich
      eine ausgelieferte Fassung als kaputt heraus, wird die vorige wieder
      ausgeliefert. Das Telefon landet also auf einer Fassung, für die es
      schon einmal hart geräumt hat.

      Bliebe die Sperre von damals liegen, wäre die Notbremse für genau
      diese Fassung für immer verbraucht — und der Rückzieher, der die Lage
      retten sollte, nähme dem Gerät seinen letzten Ausweg.
    */
    uebernahmeVormerken(ALT);
    expect(darfHartErneuern(ALT)).toBe(true);

    uebernahmeAufraeumen(NEU); // geräumt, jetzt läuft NEU
    uebernahmeVormerken(ALT); // NEU war kaputt, zurück auf ALT — und es steckt wieder
    expect(darfHartErneuern(ALT)).toBe(true);
  });
});

describe('ohne nutzbaren Speicher', () => {
  it('wirft nicht und räumt nicht', () => {
    /*
      Privates Fenster oder abgeschaltete Website-Daten: dort wirft schon
      der ZUGRIFF auf den Speicher. Diese Prüfung läuft beim Start jeder
      Sitzung — ein Fehler hier risse die ganze App mit, statt nur die
      Notbremse zu kosten.
    */
    const echt = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('gesperrt');
      },
    });
    try {
      expect(() => uebernahmeVormerken(ALT)).not.toThrow();
      expect(() => uebernahmeAufraeumen(ALT)).not.toThrow();
      expect(darfHartErneuern(ALT)).toBe(false);
    } finally {
      if (echt) Object.defineProperty(window, 'localStorage', echt);
    }
  });
});

describe('hart räumen', () => {
  const abgemeldet: string[] = [];
  const geloescht: string[] = [];
  const reload = vi.fn();
  let echteLocation: PropertyDescriptor | undefined;

  beforeEach(() => {
    abgemeldet.length = 0;
    geloescht.length = 0;
    reload.mockClear();

    echteLocation = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: async () =>
          ['/', '/alt'].map((s) => ({
            unregister: async () => {
              abgemeldet.push(s);
              return true;
            },
          })),
      },
    });

    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: async () => ['perl-huelle', 'perl-teile'],
        delete: async (n: string) => {
          geloescht.push(n);
          return true;
        },
      },
    });
  });

  afterEach(() => {
    if (echteLocation) Object.defineProperty(window, 'location', echteLocation);
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(globalThis, 'caches');
  });

  it('meldet JEDEN Worker ab und löscht JEDEN Speicher, dann lädt es neu', async () => {
    /*
      „Jeden" ist der Punkt. Ein übrig gebliebener Worker aus einer früheren
      Bauweise liefert die alte Hülle weiter aus — dann war das Räumen
      umsonst und der Knopf hält nicht, was er verspricht.
    */
    await appHartErneuern();

    expect(abgemeldet).toEqual(['/', '/alt']);
    expect(geloescht).toEqual(['perl-huelle', 'perl-teile']);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('lädt auch dann neu, wenn das Abmelden scheitert', async () => {
    /*
      Stehenbleiben wäre hier der schlechteste Ausgang: der Benutzer hat den
      Knopf gedrückt, WEIL nichts mehr geht. Eine App, die daraufhin gar
      nichts tut, ist nicht zu erklären.
    */
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: async () => {
          throw new Error('nicht erlaubt');
        },
      },
    });

    await appHartErneuern();

    expect(geloescht).toEqual(['perl-huelle', 'perl-teile']);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('lädt auch ohne jeden Zwischenspeicher neu', async () => {
    // Abgeschaltete Website-Daten: dann gibt es nichts zu räumen, aber der
    // Neustart ist trotzdem das, was verlangt wurde.
    Reflect.deleteProperty(globalThis, 'caches');

    await appHartErneuern();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('räumt VOR dem Neuladen, nicht danach', async () => {
    /*
      Die Reihenfolge ist der ganze Zweck. Erst laden und dann räumen hiesse:
      die Seite holt sich noch einmal die alte Hülle, und das Räumen trifft
      eine App, die schon wieder falsch läuft. Genau dieser Fehler ist bei
      der stillen Übernahme schon einmal im Betrieb aufgeschlagen.
    */
    let stand: string[] = [];
    reload.mockImplementation(() => {
      stand = [...abgemeldet, ...geloescht];
    });

    await appHartErneuern();

    expect(stand).toEqual(['/', '/alt', 'perl-huelle', 'perl-teile']);
  });
});
