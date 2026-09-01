import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SignaturePad from '@/components/SignaturePad';

/**
 * Aus dem Betrieb gemeldet: „das Unterschreiben im Feld funktioniert nicht."
 *
 * Zwei Ursachen, beide hier festgehalten.
 *
 * ERSTENS: `canvas.width` zu setzen LÖSCHT die Zeichenfläche. Die alte Fassung
 * tat das bei jedem `window.resize` — und dieses Ereignis feuert auf iOS
 * reihenweise, ohne dass sich am Feld etwas ändert: Adressleiste ein- und
 * ausblenden, Tastatur öffnen, drehen. Die Unterschrift verschwand mitten im
 * Zeichnen.
 *
 * ZWEITENS: ein kurzer Tipp zeichnete nichts, meldete aber trotzdem ein Bild
 * nach oben — ein leeres. Der Schein galt damit als unterschrieben, obwohl
 * nichts drinstand.
 */

/** jsdom hat kein Canvas; hier zählt, WELCHE Aufrufe ankommen. */
interface Aufzeichnung {
  breiten: number[];
  striche: number;
}

function canvasStellen(): Aufzeichnung {
  const auf: Aufzeichnung = { breiten: [], striche: 0 };
  const ctx = {
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(() => {
      auf.striche++;
    }),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
  };
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    ({ width: 300, height: 160, left: 0, top: 0, right: 300, bottom: 160, x: 0, y: 0 }) as DOMRect;
  // Die Breite mitschreiben: JEDE Zuweisung loescht in echten Browsern die
  // Flaeche, auch die mit demselben Wert.
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true,
    get() {
      return auf.breiten[auf.breiten.length - 1] ?? 0;
    },
    set(v: number) {
      auf.breiten.push(v);
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
    configurable: true,
    get: () => 160,
    set: () => undefined,
  });
  return auf;
}

/** Ein Zeigerereignis, wie es der Finger ausloest. */
function zeiger(typ: string, x: number, y: number) {
  const e = new Event(typ, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  e.pointerId = 1;
  e.clientX = x;
  e.clientY = y;
  e.pointerType = 'touch';
  return e;
}

let auf: Aufzeichnung;

beforeEach(() => {
  auf = canvasStellen();
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

describe('Unterschriftsfeld', () => {
  it('meldet einen Strich nach oben', () => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(zeiger('pointerdown', 10, 10));
      feld.dispatchEvent(zeiger('pointermove', 40, 30));
      feld.dispatchEvent(zeiger('pointerup', 40, 30));
    });

    expect(gemeldet).toHaveBeenCalledWith('data:image/png;base64,AAA');
  });

  it('meldet NICHTS, wenn gar nicht gezeichnet wurde', () => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    // Ein Zeigerende ohne vorheriges Zeichnen — etwa ein Wisch, der auf dem
    // Feld endet. Vorher meldete das eine leere Flaeche als Unterschrift.
    act(() => {
      feld.dispatchEvent(zeiger('pointerup', 40, 30));
    });

    expect(gemeldet).not.toHaveBeenCalled();
  });

  it('setzt schon beim Antippen einen sichtbaren Punkt', () => {
    render(<SignaturePad titel="Unterschrift Kunde" onChange={vi.fn()} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(zeiger('pointerdown', 10, 10));
    });

    /**
     * Ohne diesen Punkt gab ein kurzer Tipp keinerlei Rückmeldung — das Feld
     * sah aus, als reagiere es nicht. Genau so wurde es gemeldet.
     */
    expect(auf.striche).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Neu zeichnen' })).toBeInTheDocument();
  });

  it('fasst die Zeichenflaeche bei gleicher Groesse NICHT an', () => {
    render(<SignaturePad titel="Unterschrift Kunde" onChange={vi.fn()} />);
    const vorher = auf.breiten.length;

    // Auf iOS feuert `resize` beim Ein- und Ausblenden der Adressleiste,
    // ohne dass sich am Feld etwas aendert.
    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    });

    /**
     * Jede Zuweisung an `canvas.width` löscht die Fläche. Bliebe sie hier
     * stehen, wäre die Unterschrift beim ersten Scrollen weg — und der Schein
     * würde mit einem leeren Bild eingefroren.
     */
    expect(auf.breiten.length).toBe(vorher);
  });

  it('leert auf Wunsch und meldet das auch', () => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(zeiger('pointerdown', 10, 10));
      feld.dispatchEvent(zeiger('pointerup', 10, 10));
    });
    gemeldet.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'Neu zeichnen' }).click();
    });

    // `null` heisst „nichts mehr da" — der Abschluss-Knopf muss danach wieder
    // sperren.
    expect(gemeldet).toHaveBeenCalledWith(null);
  });
});
