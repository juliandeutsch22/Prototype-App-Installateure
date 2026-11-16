import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import Schalter from '@/components/Schalter';

/** Der Schalter (U6, E3): zugänglich, mit Tastatur und Etikett zu bedienen. */
function Probe({ start = false, onChange }: { start?: boolean; onChange?: (an: boolean) => void }) {
  const [an, setAn] = useState(start);
  return <Schalter id="probe" label="Neue Nachrichten" an={an} onChange={(n) => { setAn(n); onChange?.(n); }} />;
}

describe('Schalter', () => {
  it('ist ein Schalter mit Namen und Zustand', () => {
    render(<Probe />);
    const s = screen.getByRole('switch', { name: 'Neue Nachrichten' });
    expect(s).toHaveAttribute('aria-checked', 'false');
    expect(s).not.toBeChecked();
  });

  it('schaltet mit Leertaste und Enter', async () => {
    const nutzer = userEvent.setup();
    render(<Probe />);
    const s = screen.getByRole('switch', { name: 'Neue Nachrichten' });
    s.focus();
    await nutzer.keyboard(' ');
    expect(s).toBeChecked();
    await nutzer.keyboard('{Enter}');
    expect(s).not.toBeChecked();
  });

  it('schaltet auch über das Etikett — die ganze Zeile ist das Ziel', async () => {
    const nutzer = userEvent.setup();
    const geaendert = vi.fn();
    render(<Probe onChange={geaendert} />);
    await nutzer.click(screen.getByText('Neue Nachrichten'));
    expect(geaendert).toHaveBeenCalledWith(true);
  });

  it('zeigt „an“ nicht nur in der Farbe: im Griff steht ein Häkchen', () => {
    const { container, rerender } = render(<Schalter id="x" label="X" an={false} onChange={() => undefined} />);
    expect(container.querySelector('.schalter-griff svg')).toBeNull();
    rerender(<Schalter id="x" label="X" an onChange={() => undefined} />);
    expect(container.querySelector('.schalter-griff svg')).not.toBeNull();
  });

  it('gesperrt oder während des Speicherns lässt er sich nicht umlegen', async () => {
    const nutzer = userEvent.setup();
    const geaendert = vi.fn();
    const { rerender } = render(<Schalter id="x" label="X" an={false} gesperrt onChange={geaendert} />);
    await nutzer.click(screen.getByRole('switch', { name: 'X' }));
    rerender(<Schalter id="x" label="X" an={false} laeuft onChange={geaendert} />);
    expect(screen.getByRole('switch', { name: 'X' })).toHaveAttribute('aria-busy', 'true');
    await nutzer.click(screen.getByRole('switch', { name: 'X' }));
    expect(geaendert).not.toHaveBeenCalled();
  });

  it('der Zusatz („i“) gehört nicht zum Namen des Schalters', () => {
    render(<Schalter id="x" label="Vorschau" an onChange={() => undefined} zusatz={<button type="button">Was bedeutet Vorschau?</button>} />);
    expect(screen.getByRole('switch', { name: 'Vorschau' })).toBeInTheDocument();
  });
});
