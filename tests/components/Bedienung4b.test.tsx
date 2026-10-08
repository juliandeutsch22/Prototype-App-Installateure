/**
 * Testbericht 30.09.2026, Paket 4b — Bedienung.
 *
 *   M1   Wer mit ungespeicherten Änderungen einen Link nimmt, wird gefragt.
 *   M2   Neue Seiten starten oben.
 *   G6   Die gewählten Personen stehen UNTER der Liste — eine Wahl schiebt
 *        die Liste nicht mehr.
 *   G10  Eine neue Fehlermeldung ausserhalb des Bildes wird hereingeholt.
 *   G29  Meldungen stehen oben, nicht über den Knöpfen unten.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useUngespeichertWarnung } from '@/lib/ungespeichert';
import Seitenposition from '@/app/Seitenposition';
import FehlerInsBlickfeld from '@/app/FehlerInsBlickfeld';
import PersonPicker from '@/components/PersonPicker';
import { ToastProvider, useToast } from '@/components/Toast';

afterEach(() => vi.restoreAllMocks());

function Akte({ geaendert }: { geaendert: boolean }) {
  const warnung = useUngespeichertWarnung(geaendert);
  return (
    <div>
      {warnung}
      <Link to="/woanders">Woanders hin</Link>
    </div>
  );
}

const mitRouter = (geaendert: boolean) =>
  render(
    <MemoryRouter initialEntries={['/akte']}>
      <Routes>
        <Route path="/akte" element={<Akte geaendert={geaendert} />} />
        <Route path="/woanders" element={<p>Andere Seite</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('M1 — ungespeicherte Änderungen', () => {
  it('fragt vor dem Weggehen und bleibt, wenn man abbricht', () => {
    mitRouter(true);
    fireEvent.click(screen.getByText('Woanders hin'));
    expect(screen.getByText('Ungespeicherte Änderungen verwerfen?')).toBeInTheDocument();
    expect(screen.queryByText('Andere Seite')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByText('Andere Seite')).not.toBeInTheDocument();
  });

  it('geht nach „Verwerfen und weiter“ dorthin', async () => {
    mitRouter(true);
    fireEvent.click(screen.getByText('Woanders hin'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verwerfen und weiter' }));
    });
    expect(await screen.findByText('Andere Seite')).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Änderung geht es ohne Frage', () => {
    mitRouter(false);
    fireEvent.click(screen.getByText('Woanders hin'));
    expect(screen.getByText('Andere Seite')).toBeInTheDocument();
  });

  it('meldet sich auch beim Schließen des Tabs', () => {
    mitRouter(true);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

describe('M2 — neue Seiten starten oben', () => {
  it('scrollt beim Wechsel nach oben', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    function Weiter() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate('/zwei')}>weiter</button>;
    }
    render(
      <MemoryRouter initialEntries={['/eins']}>
        <Seitenposition />
        <Routes>
          <Route path="/eins" element={<Weiter />} />
          <Route path="/zwei" element={<p>zwei</p>} />
        </Routes>
      </MemoryRouter>,
    );
    scroll.mockClear();
    fireEvent.click(screen.getByText('weiter'));
    expect(scroll).toHaveBeenCalledWith(0, 0);
  });

  // Testbericht 30.09.2026, M2 — „Zurück“ kehrt dorthin zurück, wo man war.
  it('stellt beim Zurückgehen die alte Position wieder her', () => {
    // jsdom scrollt nicht; der Ersatz merkt sich, wohin gescrollt werden soll.
    let position = 0;
    const vorher = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => position });
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => {
      position = y;
    }) as typeof window.scrollTo);
    function Liste() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate('/akte')}>öffnen</button>;
    }
    function Akte() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => navigate(-1)}>zurück</button>;
    }
    try {
      render(
        <MemoryRouter initialEntries={['/liste']}>
          <Seitenposition />
          <Routes>
            <Route path="/liste" element={<Liste />} />
            <Route path="/akte" element={<Akte />} />
          </Routes>
        </MemoryRouter>,
      );
      // In der langen Liste weit nach unten.
      position = 1200;
      fireEvent.scroll(window);

      fireEvent.click(screen.getByText('öffnen'));
      // Die Akte beginnt oben …
      expect(position).toBe(0);

      scroll.mockClear();
      fireEvent.click(screen.getByText('zurück'));
      // … und zurück steht man wieder bei 1200, nicht oben in der Liste.
      expect(screen.getByText('öffnen')).toBeInTheDocument();
      expect(scroll).toHaveBeenCalledWith(0, 1200);
      expect(scroll).not.toHaveBeenCalledWith(0, 0);
      expect(position).toBe(1200);
    } finally {
      if (vorher) Object.defineProperty(window, 'scrollY', vorher);
      else delete (window as { scrollY?: number }).scrollY;
    }
  });
});

describe('G6 — die Auswahl schiebt die Liste nicht', () => {
  it('die gewählten Personen stehen hinter der Liste', () => {
    render(
      <PersonPicker
        legend="Team"
        idPrefix="t"
        people={[{ uid: 'a', name: 'Anna' }, { uid: 'b', name: 'Bert' }]}
        selected={['a']}
        onChange={() => {}}
      />,
    );
    const liste = screen.getByRole('checkbox', { name: /Bert/ });
    const chip = screen.getByRole('button', { name: 'Anna entfernen' });
    // DOCUMENT_POSITION_FOLLOWING: der Chip kommt nach der Liste.
    expect(liste.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('G10 — Fehler ins Blickfeld', () => {
  it('holt eine neue Fehlermeldung herein, die außerhalb liegt', async () => {
    const hinein = vi.fn();
    Element.prototype.scrollIntoView = hinein;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 5000, bottom: 5020, left: 0, right: 10, width: 10, height: 20, x: 0, y: 5000, toJSON: () => ({}),
    });
    render(<FehlerInsBlickfeld />);
    const p = document.createElement('p');
    p.setAttribute('role', 'alert');
    p.className = 'text-sm text-danger';
    p.textContent = 'Das hat nicht geklappt.';
    document.body.appendChild(p);
    await new Promise((r) => setTimeout(r, 0));
    expect(hinein).toHaveBeenCalled();
    p.remove();
  });

  it('Gegenprobe: eine Warnung beim Tippen bleibt, wo sie ist', async () => {
    const hinein = vi.fn();
    Element.prototype.scrollIntoView = hinein;
    render(<FehlerInsBlickfeld />);
    const p = document.createElement('p');
    p.setAttribute('role', 'alert');
    p.className = 'text-sm text-warning';
    document.body.appendChild(p);
    await new Promise((r) => setTimeout(r, 0));
    expect(hinein).not.toHaveBeenCalled();
    p.remove();
  });
});

describe('G29 — Meldungen verdecken keinen Knopf', () => {
  /*
    SEIT DER LINIE „LOT“ STEHT DIE LAGE IN src/styles/lot.css (`.meldungen`):
    jsdom kennt kein CSS, deshalb liest die Prüfung die Regel selbst. Am
    Telefon oben — unten lägen Daumenleiste und Aktionsleiste —, ab dem
    Tablet unten in der Mitte wie im Entwurf.
  */
  const lot = readFileSync(join(process.cwd(), 'src/styles/lot.css'), 'utf8');
  const regel = (wahl: string, text = lot) => {
    const m = new RegExp(`\\.${wahl} \\{([^}]*)\\}`).exec(text);
    if (!m) throw new Error(`.${wahl} fehlt in lot.css`);
    return m[1];
  };

  function Knopf({ rueck }: { rueck?: () => void }) {
    const toast = useToast();
    return (
      <button
        type="button"
        onClick={() => toast.success('Gespeichert', rueck ? { label: 'Rückgängig', onClick: rueck } : undefined)}
      >
        los
      </button>
    );
  }

  it('am Telefon oben, ab dem Tablet unten', () => {
    render(
      <ToastProvider>
        <Knopf />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('los'));
    const meldung = screen.getByText('Gespeichert').parentElement as HTMLElement;
    expect(meldung.parentElement!.className).toBe('meldungen');
    expect(regel('meldungen')).toMatch(/top: 1rem/);
    expect(regel('meldungen')).not.toMatch(/bottom:/);
    const tablet = /@media \(min-width: 760px\) \{ \.meldungen \{([^}]*)\}/.exec(lot);
    expect(tablet?.[1]).toMatch(/bottom: 1\.5rem/);
  });

  it('lässt Klicks durch — was darunter liegt, bleibt treffbar', () => {
    render(
      <ToastProvider>
        <Knopf />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('los'));
    expect(screen.getByText('Gespeichert').parentElement!.className).toBe('meldung');
    expect(regel('meldung')).toMatch(/pointer-events: none/);
    expect(regel('meldungen')).toMatch(/pointer-events: none/);
    // Treffbar ist nur der Knopf in der Meldung selbst.
    expect(regel('meldung-knopf')).toMatch(/pointer-events: auto/);
  });

  it('„Rückgängig“ ruft die Umkehr auf und nimmt die Meldung weg', () => {
    const rueck = vi.fn();
    render(
      <ToastProvider>
        <Knopf rueck={rueck} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('los'));
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(rueck).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Gespeichert')).toBeNull();
  });

  it('Gegenprobe: ohne Umkehr hat die Meldung keinen Knopf', () => {
    render(
      <ToastProvider>
        <Knopf />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('los'));
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
  });
});

