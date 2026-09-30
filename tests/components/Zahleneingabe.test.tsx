import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZahlFeld, { ZahlWertFeld } from '@/components/ZahlFeld';
import { unlesbareZahlIn } from '@/lib/zahl';

/*
  EINE ZAHLENEINGABE FÜR ALLE BETRÄGE UND MENGEN (Testbericht 30.09.2026, M15).
  „7.500,50“ ergab im Angebot kommentarlos 0,00 €.
*/

function Text({ start = '' }: { start?: string }) {
  const [t, setT] = useState(start);
  return (
    <form>
      <ZahlFeld id="betrag" label="Betrag (€)" value={t} onChange={setT} />
      <output data-testid="gelesen">{t}</output>
    </form>
  );
}

describe('ZahlFeld', () => {
  it('meldet „7.500“ nach dem Verlassen des Feldes — nicht beim Tippen', async () => {
    const nutzer = userEvent.setup();
    render(<Text />);
    const feld = screen.getByLabelText('Betrag (€)');
    await nutzer.type(feld, '7.500');
    expect(screen.queryByText(/nicht eindeutig/)).not.toBeInTheDocument();
    await nutzer.tab();
    expect(screen.getByText(/nicht eindeutig/)).toBeInTheDocument();
    expect(feld).toHaveAttribute('aria-invalid', 'true');
  });

  it('Gegenprobe: „7.500,50“ ist lesbar und wird nicht gemeldet', async () => {
    const nutzer = userEvent.setup();
    render(<Text />);
    await nutzer.type(screen.getByLabelText('Betrag (€)'), '7.500,50');
    await nutzer.tab();
    expect(screen.queryByText(/eindeutig|keine Zahl/)).not.toBeInTheDocument();
  });

  it('ist ein Textfeld mit Zifferntastatur, kein Zahlenfeld des Browsers', () => {
    render(<Text />);
    const feld = screen.getByLabelText('Betrag (€)');
    expect(feld).toHaveAttribute('type', 'text');
    expect(feld).toHaveAttribute('inputmode', 'decimal');
  });
});

describe('ZahlWertFeld', () => {
  it('gibt die gelesene Zahl hinaus und behält Unfertiges als Text', async () => {
    const nutzer = userEvent.setup();
    const onWert = vi.fn();
    render(<ZahlWertFeld id="satz" label="Satz (€/h)" wert={65} onWert={onWert} />);
    const feld = screen.getByLabelText('Satz (€/h)');
    await nutzer.clear(feld);
    await nutzer.type(feld, '65,5');
    expect(feld).toHaveValue('65,5');
    expect(onWert).toHaveBeenLastCalledWith(65.5);
  });

  it('springt mit leerAls nicht auf „0“, wenn jemand das Feld leert', async () => {
    const nutzer = userEvent.setup();
    function Menge() {
      const [m, setM] = useState(3);
      return <ZahlWertFeld id="m" label="Menge" wert={m} leerAls={0} onWert={(n) => setM(n ?? 0)} />;
    }
    render(<Menge />);
    const feld = screen.getByLabelText('Menge');
    await nutzer.clear(feld);
    expect(feld).toHaveValue('');
    await nutzer.type(feld, '1,5');
    expect(feld).toHaveValue('1,5');
  });
});

describe('unlesbareZahlIn', () => {
  it('findet vor dem Speichern ein Zahlenfeld, das sich nicht lesen lässt', async () => {
    const nutzer = userEvent.setup();
    const { container } = render(<Text />);
    expect(unlesbareZahlIn(container)).toBeNull();
    await nutzer.type(screen.getByLabelText('Betrag (€)'), '7,500');
    expect(unlesbareZahlIn(container)).toMatch(/^Betrag \(€\): .*nicht eindeutig/);
  });
});
