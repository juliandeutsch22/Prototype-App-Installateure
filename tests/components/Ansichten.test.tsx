import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ansichten vorladen und den Seitenwechsel sichtbar machen (Analyse
 * 10.10.2026): nach dem Klick blieb die alte Seite bis zu 1,6 s stehen, ohne
 * Zeichen, weil der Baustein der neuen erst übers Netz kam.
 */

const neuLaden = vi.fn(async () => undefined);
vi.mock('@/lib/sw', () => ({ huelleErneuernUndNeuLaden: () => neuLaden() }));

type Modul = { default: () => JSX.Element };

/** Ein Baustein, dessen Ankunft der Test bestimmt. */
function steuerbar(text: string) {
  let fertig: (m: Modul | undefined) => void = () => undefined;
  let scheitern: (e: Error) => void = () => undefined;
  const laden = vi.fn(
    () => new Promise<Modul>((ok, nein) => {
      fertig = ok as (m: Modul | undefined) => void;
      scheitern = nein;
    }),
  );
  return {
    laden,
    kommt: () => act(async () => fertig({ default: () => <p>{text}</p> })),
    leer: () => act(async () => fertig(undefined)),
    scheitert: () => act(async () => scheitern(new Error('Failed to fetch dynamically imported module'))),
  };
}

let A: typeof import('@/lib/ansichten');

beforeEach(async () => {
  vi.resetModules();
  neuLaden.mockClear();
  A = await import('@/lib/ansichten');
});

describe('Vorladen', () => {
  it('holt nur die genannten Pfade, nacheinander — und der Seitenwechsel holt nicht noch einmal', async () => {
    const zeit = steuerbar('Zeiterfassung');
    const rechnung = steuerbar('Rechnungen');
    const lager = steuerbar('Lager');
    const Zeit = A.ansicht('/time', zeit.laden);
    A.ansicht('/invoices', rechnung.laden);
    A.ansicht('/lager', lager.laden);

    const lauf = A.vorladen(['/time', '/invoices']);
    // Nacheinander: der zweite erst, wenn der erste da ist.
    expect(zeit.laden).toHaveBeenCalledTimes(1);
    expect(rechnung.laden).not.toHaveBeenCalled();
    await zeit.kommt();
    expect(rechnung.laden).toHaveBeenCalledTimes(1);
    await rechnung.kommt();
    await lauf;
    // Nicht genannt, nicht geholt.
    expect(lager.laden).not.toHaveBeenCalled();

    render(<Suspense fallback={<p>wartet</p>}><Zeit /></Suspense>);
    expect(await screen.findByText('Zeiterfassung')).toBeInTheDocument();
    expect(zeit.laden).toHaveBeenCalledTimes(1);
  });

  it('ein Baustein unter zwei Pfaden wird über jeden geholt', async () => {
    const woche = steuerbar('Woche');
    A.ansicht(['/assignments', '/my-schedule'], woche.laden);
    const lauf = A.vorladen(['/my-schedule']);
    await woche.kommt();
    await lauf;
    expect(woche.laden).toHaveBeenCalledTimes(1);
  });

  it('hört beim ersten Fehler auf und merkt sich ihn nicht — das Öffnen holt neu', async () => {
    const zeit = steuerbar('Zeiterfassung');
    const rechnung = steuerbar('Rechnungen');
    const Zeit = A.ansicht('/time', zeit.laden);
    A.ansicht('/invoices', rechnung.laden);

    const lauf = A.vorladen(['/time', '/invoices']);
    await zeit.scheitert();
    await lauf;
    expect(rechnung.laden).not.toHaveBeenCalled();

    render(<Suspense fallback={<p>wartet</p>}><Zeit /></Suspense>);
    expect(zeit.laden).toHaveBeenCalledTimes(2);
    await zeit.kommt();
    expect(await screen.findByText('Zeiterfassung')).toBeInTheDocument();
  });

  it('ein leer angekommener Baustein gilt als gescheitert, mit einer Meldung, die die Fehlergrenze erkennt', async () => {
    const zeit = steuerbar('Zeiterfassung');
    A.ansicht('/time', zeit.laden);
    const lauf = A.vorladen(['/time']);
    await zeit.leer();
    await lauf;
    // Nicht gemerkt: der nächste Versuch holt neu.
    void A.vorladen(['/time']);
    expect(zeit.laden).toHaveBeenCalledTimes(2);
    const { istNachladeFehler } = await import('@/lib/nachladen');
    expect(istNachladeFehler(new Error('Failed to fetch dynamically imported module (leer)'))).toBe(true);
  });
});

describe('Abschalten für Werkzeuge', () => {
  it('die Vorschau schaltet das Vorladen ab — sonst gilt der Datensparmodus des Geräts', () => {
    expect(A.datenSparen()).toBe(false);
    A.vorladenAbschalten();
    expect(A.datenSparen()).toBe(true);
    const vorschau = readFileSync(join(__dirname, '../../tools/vorschau/main.tsx'), 'utf8');
    expect(vorschau).toMatch(/^vorladenAbschalten\(\);$/m);
  });
});

describe('Ein gescheitertes Vorladen lädt die App nicht neu', () => {
  const vite = () => {
    const e = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(e);
    return e;
  };

  afterEach(() => sessionStorage.clear());

  it('solange nur das Vorladen läuft, bleibt die Seite, wie sie ist', async () => {
    const { nachladefehlerBeobachten } = await import('@/lib/nachladen');
    nachladefehlerBeobachten();
    const zeit = steuerbar('Zeiterfassung');
    A.ansicht('/time', zeit.laden);
    const lauf = A.vorladen(['/time']);
    expect(A.nurHintergrundLaedt()).toBe(true);
    expect(vite().defaultPrevented).toBe(true);
    expect(neuLaden).not.toHaveBeenCalled();
    await zeit.scheitert();
    await lauf;
  });

  it('Gegenprobe: wartet ein Seitenwechsel auf den Baustein, wird wie bisher neu geladen', async () => {
    const { nachladefehlerBeobachten } = await import('@/lib/nachladen');
    nachladefehlerBeobachten();
    const zeit = steuerbar('Zeiterfassung');
    const Zeit = A.ansicht('/time', zeit.laden);
    render(<Suspense fallback={<p>wartet</p>}><Zeit /></Suspense>);
    expect(A.nurHintergrundLaedt()).toBe(false);
    vite();
    expect(neuLaden).toHaveBeenCalledTimes(1);
  });
});

describe('Der Ladebalken', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function aufbau() {
    const { default: Ladebalken } = await import('@/components/Ladebalken');
    const zeit = steuerbar('Zeiterfassung');
    const Zeit = A.ansicht('/time', zeit.laden);
    render(
      <>
        <Ladebalken />
        <Suspense fallback={null}><Zeit /></Suspense>
      </>,
    );
    return zeit;
  }

  it('erscheint erst, wenn der Wechsel länger als 150 ms wartet, und verschwindet danach', async () => {
    const zeit = await aufbau();
    await act(async () => vi.advanceTimersByTime(140));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(20));
    expect(screen.getByRole('progressbar', { name: 'Seite wird geladen' })).toHaveAttribute('data-zustand', 'laeuft');
    await zeit.kommt();
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-zustand', 'fertig');
    await act(async () => vi.advanceTimersByTime(300));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('Gegenprobe: ein schneller Wechsel zeigt gar keinen Balken', async () => {
    const zeit = await aufbau();
    await act(async () => vi.advanceTimersByTime(100));
    await zeit.kommt();
    await act(async () => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('das Vorladen allein zeigt keinen Balken', async () => {
    const { default: Ladebalken } = await import('@/components/Ladebalken');
    const zeit = steuerbar('Zeiterfassung');
    A.ansicht('/time', zeit.laden);
    render(<Ladebalken />);
    void A.vorladen(['/time']);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

/*
  DEN BAUSTEIN DER GEÖFFNETEN SEITE SCHON BEIM START (Ladezeit, 19.10.2026).
  Gegenprobe: ohne `startansichtVorladen` fragt erst React nach ihm — nach
  der Anmeldung; hier gibt es die Funktion dann gar nicht (rot).
*/
describe('Startansicht vorladen', () => {
  it('holt die Ansicht des geöffneten Pfades sofort — und das Öffnen übernimmt sie', async () => {
    const start = steuerbar('Start');
    const zeit = steuerbar('Zeiterfassung');
    A.ansicht('/', start.laden);
    const Zeit = A.ansicht('/time', zeit.laden);
    A.startansichtVorladen('/time');
    expect(zeit.laden).toHaveBeenCalledTimes(1);
    expect(start.laden).not.toHaveBeenCalled();
    await zeit.kommt();
    render(<Suspense fallback={<p>wartet</p>}><Zeit /></Suspense>);
    expect(await screen.findByText('Zeiterfassung')).toBeInTheDocument();
    expect(zeit.laden).toHaveBeenCalledTimes(1);
  });

  it('eine Akte gehört zum längsten passenden Menüpfad; Liste und Akte kommen zugleich', async () => {
    const start = steuerbar('Start');
    const liste = steuerbar('Kunden');
    const akte = steuerbar('Kundenakte');
    A.ansicht('/', start.laden);
    A.ansicht('/customers', liste.laden);
    A.ansicht('/customers', akte.laden);
    A.startansichtVorladen('/customers/k-17');
    expect(liste.laden).toHaveBeenCalledTimes(1);
    expect(akte.laden).toHaveBeenCalledTimes(1);
    expect(start.laden).not.toHaveBeenCalled();
  });

  it('auch im Datensparmodus — es ist die Seite, die ohnehin aufgeht', async () => {
    const zeit = steuerbar('Zeiterfassung');
    A.ansicht('/time', zeit.laden);
    A.vorladenAbschalten();
    A.startansichtVorladen('/time');
    expect(zeit.laden).toHaveBeenCalledTimes(1);
  });

  it('ein unbekannter Pfad holt nichts; ein Fehler bleibt still und das Öffnen holt neu', async () => {
    const zeit = steuerbar('Zeiterfassung');
    const Zeit = A.ansicht('/time', zeit.laden);
    A.startansichtVorladen('/gibt-es-nicht');
    expect(zeit.laden).not.toHaveBeenCalled();
    A.startansichtVorladen('/time');
    expect(A.nurHintergrundLaedt()).toBe(true);
    await zeit.scheitert();
    expect(A.nurHintergrundLaedt()).toBe(false);
    render(<Suspense fallback={<p>wartet</p>}><Zeit /></Suspense>);
    expect(zeit.laden).toHaveBeenCalledTimes(2);
  });
});

describe('Ein Baustein, der nie ankommt (01.11.2026: „lädt beim Seitenwechsel gar nicht mehr“)', () => {
  /** Ein Abruf auf einer halb toten Verbindung: weder Antwort noch Fehler. */
  const nie = () => vi.fn(() => new Promise<Modul>(() => undefined));

  afterEach(() => {
    vi.useRealTimers();
  });

  it('der Seitenwechsel endet nach der Frist als Nachladefehler — die Fehlergrenze lädt neu', async () => {
    vi.useFakeTimers();
    const { istNachladeFehler } = await import('@/lib/nachladen');
    const laden = nie();
    const Zeit = A.ansicht('/time', laden);
    const gefangen: Error[] = [];
    const { Component } = await import('react');
    class Grenze extends Component<{ children: JSX.Element }, { e: Error | null }> {
      state = { e: null as Error | null };
      static getDerivedStateFromError(e: Error) { return { e }; }
      componentDidCatch(e: Error) { gefangen.push(e); }
      render() { return this.state.e ? <p>Fehlergrenze</p> : this.props.children; }
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Grenze><Suspense fallback={<p>wartet</p>}><Zeit /></Suspense></Grenze>);
    expect(A.nurHintergrundLaedt()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(A.BAUSTEIN_FRIST_MS - 1000); });
    expect(screen.getByText('wartet')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText('Fehlergrenze')).toBeInTheDocument();
    expect(istNachladeFehler(gefangen[0])).toBe(true);
    // Der Wechsel wartet nicht mehr: kein ewiger Ladebalken.
    expect(A.nurHintergrundLaedt()).toBe(false);
  });

  it('ein hängendes Vorladen hört nach der Frist auf und blockiert den Menüpunkt nicht — das Öffnen holt neu', async () => {
    vi.useFakeTimers();
    const laden = nie();
    A.ansicht('/time', laden);
    let fertig = false;
    A.vorladen(['/time']).then(() => { fertig = true; });
    await vi.advanceTimersByTimeAsync(A.BAUSTEIN_FRIST_MS + 10);
    expect(fertig).toBe(true);
    expect(A.nurHintergrundLaedt()).toBe(false);
    // Nichts Hängendes gemerkt: der nächste Versuch holt neu.
    void A.vorladen(['/time']);
    expect(laden).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(A.BAUSTEIN_FRIST_MS + 10);
  });

  it('gleich geblieben: ein Baustein, der innerhalb der Frist kommt, wird wie bisher gezeigt', async () => {
    vi.useFakeTimers();
    const zeit = steuerbar('Zeiterfassung');
    const Zeit = A.ansicht('/time', zeit.laden);
    render(<Suspense fallback={<p>wartet</p>}><Zeit /></Suspense>);
    await act(async () => { await vi.advanceTimersByTimeAsync(A.BAUSTEIN_FRIST_MS - 5000); });
    await zeit.kommt();
    expect(screen.getByText('Zeiterfassung')).toBeInTheDocument();
  });
});
