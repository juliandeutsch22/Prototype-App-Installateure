import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary, { istNachladeFehler } from '@/app/ErrorBoundary';

/**
 * Die Fehlergrenze nach einem Deploy.
 *
 * Seit dem Code-Splitting lädt jede Ansicht erst beim Öffnen nach. Kommt
 * dazwischen ein Deploy, zeigt die laufende Seite auf Dateinamen, die es auf
 * dem Server nicht mehr gibt — Hosting kennt nach einem Deploy nur die neuen.
 * Dann landet der Monteur hier, und „Erneut versuchen" kann ihm per
 * Konstruktion nicht helfen: React merkt sich das abgelehnte Versprechen
 * eines `lazy`-Imports und scheitert sofort wieder, ohne das Netz zu fragen.
 */

function Wirft({ fehler }: { fehler: Error }): JSX.Element {
  throw fehler;
}

/** Was die Browser tatsächlich melden, wenn ein Nachladen scheitert. */
const NACHLADE_MELDUNGEN = [
  'Failed to fetch dynamically imported module: https://app.test/assets/TimeView-a1b2.js',
  "Importing a module script failed.",
  'error loading dynamically imported module',
  'Loading chunk 42 failed.',
];

let reload: ReturnType<typeof vi.fn>;
let echteLocation: Location;

beforeEach(() => {
  // Ohne Stille auf stderr steht die Fehlermeldung von React über der
  // gesamten Ausgabe — und in einer unlesbaren Ausgabe übersieht man echte
  // Fehler (siehe tests/components/setup.ts).
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  reload = vi.fn();
  echteLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...echteLocation, reload },
  });
  sessionStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: echteLocation });
  vi.restoreAllMocks();
});

describe('Nachladefehler erkennen', () => {
  it.each(NACHLADE_MELDUNGEN)('erkennt: %s', (meldung) => {
    expect(istNachladeFehler({ name: 'TypeError', message: meldung })).toBe(true);
  });

  it('haelt einen gewoehnlichen Fehler NICHT dafuer', () => {
    // Sonst lüde die App bei jedem Programmierfehler endlos neu.
    expect(
      istNachladeFehler({ name: 'TypeError', message: "Cannot read properties of undefined" }),
    ).toBe(false);
  });
});

describe('Fehlergrenze', () => {
  it('laedt bei einem Nachladefehler von selbst neu', () => {
    render(
      <ErrorBoundary>
        <Wirft fehler={new TypeError(NACHLADE_MELDUNGEN[0])} />
      </ErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('laedt kein zweites Mal gleich hinterher', () => {
    /**
     * Der Schutz gegen die Schleife. Scheitert das Nachladen aus einem
     * anderen Grund — kein Netz —, brächte ein sofortiges zweites Neuladen
     * eine Seite, die sich unentwegt selbst neu startet.
     */
    render(
      <ErrorBoundary>
        <Wirft fehler={new TypeError(NACHLADE_MELDUNGEN[0])} />
      </ErrorBoundary>,
    );
    render(
      <ErrorBoundary>
        <Wirft fehler={new TypeError(NACHLADE_MELDUNGEN[0])} />
      </ErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('laedt bei einem gewoehnlichen Fehler NICHT neu und bietet den Weg an', () => {
    render(
      <ErrorBoundary>
        <Wirft fehler={new TypeError('irgendwas anderes')} />
      </ErrorBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('heading')).toHaveTextContent('Da ist etwas schiefgelaufen');
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  it('sagt beim Nachladefehler, was tatsaechlich hilft', () => {
    // Zweiter Versuch nach der Sperre: die Grenze zeigt ihre Tafel, und dort
    // darf nicht „Erneut versuchen" als Ausweg dastehen — der kann nicht
    // wirken.
    sessionStorage.setItem('perl:nachladefehler', String(Date.now()));
    render(
      <ErrorBoundary>
        <Wirft fehler={new TypeError(NACHLADE_MELDUNGEN[0])} />
      </ErrorBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText(/neue Fassung/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zur Startseite' })).toBeInTheDocument();
  });
});
