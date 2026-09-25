import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SignaturePad from '@/components/SignaturePad';

/**
 * Aus dem Betrieb DREIMAL gemeldet: „das Unterschreiben funktioniert nicht."
 * Am PC ging es jedes Mal. Drei Ursachen, alle hier festgehalten.
 *
 * ERSTENS: `canvas.width` zu setzen LÖSCHT die Zeichenfläche. Die erste
 * Fassung tat das bei jedem `window.resize` — und dieses Ereignis feuert auf
 * iOS reihenweise, ohne dass sich am Feld etwas ändert: Adressleiste ein- und
 * ausblenden, Tastatur öffnen, drehen. Die Unterschrift verschwand mitten im
 * Zeichnen.
 *
 * ZWEITENS: ein kurzer Tipp zeichnete nichts, meldete aber trotzdem ein Bild
 * nach oben — ein leeres. Der Schein galt damit als unterschrieben, obwohl
 * nichts drinstand.
 *
 * DRITTENS, und das ist der Grund für den Umbau auf Berührungsereignisse:
 * bricht der Browser die ZEIGER-Geste ab, kommt kein `pointermove` mehr. Der
 * Strich blieb ein Punkt. In einem echten Browser mit echter Fingereingabe
 * nachgemessen: 8285 gezeichnete Pixel ungestört, 36 nach dem Abbruch — und
 * das Feld meldete diesen Punkt trotzdem als fertige Unterschrift nach oben.
 * In derselben Geste liefen die BERÜHRUNGS-Ereignisse weiter. Deshalb
 * zeichnet der Finger über `touchstart`/`touchmove`, Maus und Stift über die
 * Zeigerereignisse.
 */

/** jsdom hat kein Canvas; hier zählt, WELCHE Aufrufe ankommen. */
interface Aufzeichnung {
  breiten: number[];
  striche: number;
}

function canvasStellen(): Aufzeichnung {
  const auf: Aufzeichnung = { breiten: [], striche: 0 };
  const ctx = {
    setTransform: vi.fn(),
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

/** Eine Beruehrung, wie sie der Finger ausloest. */
function finger(typ: string, x: number, y: number) {
  const e = new Event(typ, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  e.touches = typ === 'touchend' || typ === 'touchcancel' ? [] : [{ clientX: x, clientY: y }];
  return e;
}

/** Ein Zeigerereignis von Maus oder Stift. */
function zeiger(typ: string, x: number, y: number, art = 'mouse') {
  const e = new Event(typ, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  e.pointerId = 1;
  e.clientX = x;
  e.clientY = y;
  e.pointerType = art;
  return e;
}

let auf: Aufzeichnung;

beforeEach(() => {
  auf = canvasStellen();
  /**
   * Die aktuelle Fassung ruft `setPointerCapture` nicht mehr auf. Die
   * Attrappe steht trotzdem hier — ohne sie wuerde die VORHERIGE Fassung
   * schon an der fehlenden Funktion scheitern, und die Gegenprobe („faellt
   * dieser Test gegen den alten Stand durch?") waere wertlos: sie fiele aus
   * dem falschen Grund durch.
   */
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

describe('Unterschriftsfeld — der Finger', () => {
  it('meldet einen Strich nach oben', () => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(finger('touchstart', 10, 10));
      feld.dispatchEvent(finger('touchmove', 80, 40));
      feld.dispatchEvent(finger('touchend', 80, 40));
    });

    expect(gemeldet).toHaveBeenCalledWith(true);
  });

  it('zeichnet WEITER, wenn der Browser die Zeigergeste abbricht', () => {
    /**
     * DER GEMELDETE FEHLER. Auf dem iPhone raeumt der Browser die Zeigerspur
     * ab, sobald er die Geste fuer sich beansprucht — danach kommt kein
     * `pointermove` mehr. Solange der Strich daran hing, blieb er ein Punkt.
     * Die Beruehrungsspur laeuft weiter, und daran haengt er jetzt.
     */
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(finger('touchstart', 10, 10));
      feld.dispatchEvent(finger('touchmove', 30, 20));
      // Genau hier stieg die alte Fassung aus.
      feld.dispatchEvent(zeiger('pointercancel', 30, 20, 'touch'));
      window.dispatchEvent(zeiger('pointercancel', 30, 20, 'touch'));
    });

    const nachAbbruch = auf.striche;
    act(() => {
      for (let i = 0; i < 8; i++) feld.dispatchEvent(finger('touchmove', 40 + i * 10, 30));
      feld.dispatchEvent(finger('touchend', 120, 30));
    });

    expect(auf.striche).toBe(nachAbbruch + 8);
    expect(gemeldet).toHaveBeenCalledWith(true);
  });

  it('haelt die Geste fest, damit die Seite nicht scrollt', () => {
    /**
     * Ohne `preventDefault()` scrollt die Seite unter dem Finger weg, statt
     * dass er zeichnet. Es wirkt nur in einem NICHT-passiven Listener — und
     * React meldet Beruehrungsereignisse an der Wurzel als passiv an. Deshalb
     * haengen die Behandler nativ am Element.
     */
    render(<SignaturePad titel="Unterschrift Kunde" onChange={vi.fn()} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    const beginn = finger('touchstart', 10, 10);
    const zug = finger('touchmove', 40, 30);
    act(() => {
      feld.dispatchEvent(beginn);
      feld.dispatchEvent(zug);
    });

    expect(beginn.defaultPrevented).toBe(true);
    expect(zug.defaultPrevented).toBe(true);
  });

  it('setzt schon beim Antippen einen sichtbaren Punkt', () => {
    render(<SignaturePad titel="Unterschrift Kunde" onChange={vi.fn()} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(finger('touchstart', 10, 10));
    });

    /**
     * Ohne diesen Punkt gab ein kurzer Tipp keinerlei Rückmeldung — das Feld
     * sah aus, als reagiere es nicht. Genau so wurde es gemeldet.
     */
    expect(auf.striche).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Neu zeichnen' })).toBeInTheDocument();
  });

  it('zeichnet nicht, wenn das Feld gesperrt ist', () => {
    // Ein eingefrorener Schein ist ein Beleg. Er wird nicht nachträglich
    // uebermalt.
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} disabled />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(finger('touchstart', 10, 10));
      feld.dispatchEvent(finger('touchmove', 40, 30));
      feld.dispatchEvent(finger('touchend', 40, 30));
    });

    expect(auf.striche).toBe(0);
    expect(gemeldet).not.toHaveBeenCalled();
  });
});

describe('Unterschriftsfeld — Maus und Stift', () => {
  it('zeichnet am Schreibtisch weiterhin', () => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(zeiger('pointerdown', 10, 10));
      window.dispatchEvent(zeiger('pointermove', 80, 40));
      window.dispatchEvent(zeiger('pointerup', 80, 40));
    });

    expect(auf.striche).toBeGreaterThan(1);
    expect(gemeldet).toHaveBeenCalledWith(true);
  });

  it('reisst nicht ab, wenn die Maus ueber den Feldrand geraet', () => {
    /**
     * Diese Aufgabe hatte `setPointerCapture`. Es ist raus — es steht im
     * Verdacht, den Abbruch auf WebKit ueberhaupt auszuloesen. Ersatz sind
     * Listener am FENSTER, solange ein Strich laeuft.
     */
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(zeiger('pointerdown', 10, 10));
      // Weit ausserhalb des Feldes — das Ereignis geht ans Fenster, nicht
      // ans Feld.
      window.dispatchEvent(zeiger('pointermove', 900, 900));
      window.dispatchEvent(zeiger('pointerup', 900, 900));
    });

    expect(auf.striche).toBeGreaterThan(1);
    expect(gemeldet).toHaveBeenCalled();
  });

  it('nimmt einen Finger NICHT ueber den Zeigerweg an', () => {
    // Sonst zeichnete dieselbe Geste doppelt: einmal ueber die Beruehrung,
    // einmal ueber das Zeigerereignis, das das Telefon zusaetzlich schickt.
    render(<SignaturePad titel="Unterschrift Kunde" onChange={vi.fn()} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(zeiger('pointerdown', 10, 10, 'touch'));
    });

    expect(auf.striche).toBe(0);
  });
});

describe('Unterschriftsfeld — die Flaeche', () => {
  it('meldet NICHTS, wenn gar nicht gezeichnet wurde', () => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    // Ein Ende ohne vorheriges Zeichnen — etwa ein Wisch, der auf dem Feld
    // endet. Vorher meldete das eine leere Flaeche als Unterschrift.
    act(() => {
      feld.dispatchEvent(finger('touchend', 40, 30));
    });

    expect(gemeldet).not.toHaveBeenCalled();
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

  it('sperrt die Browser-Geste fest am Element, nicht nur per Klasse', () => {
    // Im Probestand ohne `touch-action: none` brach der Browser die Geste
    // nach dem ersten Zug ab — das Feld war unbenutzbar. Eine Klasse kann ein
    // Build verlieren, diese Zeile nicht.
    render(<SignaturePad titel="Unterschrift Kunde" onChange={vi.fn()} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/) as HTMLCanvasElement;
    expect(feld.style.touchAction).toBe('none');
  });

  it('leert auf Wunsch und meldet das auch', () => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(finger('touchstart', 10, 10));
      feld.dispatchEvent(finger('touchend', 10, 10));
    });
    gemeldet.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'Neu zeichnen' }).click();
    });

    expect(gemeldet).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('button', { name: 'Neu zeichnen' })).not.toBeInTheDocument();
  });
});

describe('Unterschriftsfeld — was als Unterschrift zählt (Launch-Check 25.09.2026)', () => {
  it.each([
    ['ein Antippen', [[10, 10]]],
    ['ein kurzer Strich', [[20, 20], [35, 22]]],
    ['eine gerade Linie quer durchs Feld', [[10, 50], [120, 52], [200, 53]]],
  ])('%s zählt nicht', (_was, punkte) => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      const [erster, ...rest] = punkte;
      feld.dispatchEvent(finger('touchstart', erster[0], erster[1]));
      for (const [x, y] of rest) feld.dispatchEvent(finger('touchmove', x, y));
      const letzter = punkte[punkte.length - 1];
      feld.dispatchEvent(finger('touchend', letzter[0], letzter[1]));
    });

    expect(gemeldet).not.toHaveBeenCalledWith(true);
    expect(screen.getByText(/reicht noch nicht für eine Unterschrift/)).toBeInTheDocument();
  });

  it('ein Namenszug in EINEM Zug zählt — viele unterschreiben so', () => {
    const gemeldet = vi.fn();
    render(<SignaturePad titel="Unterschrift Kunde" onChange={gemeldet} />);
    const feld = screen.getByLabelText(/Unterschrift Kunde/);

    act(() => {
      feld.dispatchEvent(finger('touchstart', 10, 40));
      for (let i = 1; i <= 8; i++) feld.dispatchEvent(finger('touchmove', 10 + i * 15, i % 2 ? 25 : 55));
      feld.dispatchEvent(finger('touchend', 130, 55));
    });

    expect(gemeldet).toHaveBeenCalledWith(true);
    expect(gemeldet).toHaveBeenCalledTimes(1);
  });
});
