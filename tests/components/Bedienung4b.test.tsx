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

  it('meldet sich auch beim Schliessen des Tabs', () => {
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
  it('holt eine neue Fehlermeldung herein, die ausserhalb liegt', async () => {
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

describe('G29 — Meldungen oben', () => {
  it('der Meldungsbereich hängt oben, nicht unten', () => {
    function Knopf() {
      const toast = useToast();
      return <button type="button" onClick={() => toast.success('Gespeichert')}>los</button>;
    }
    render(
      <ToastProvider>
        <Knopf />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('los'));
    const bereich = screen.getByText('Gespeichert').parentElement as HTMLElement;
    expect(bereich.className).toMatch(/top-/);
    expect(bereich.className).not.toMatch(/bottom-4/);
  });
});
