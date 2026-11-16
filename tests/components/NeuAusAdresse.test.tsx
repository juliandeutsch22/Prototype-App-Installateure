import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useNeuAusAdresse } from '@/lib/useNeuAusAdresse';

/*
  F15: `?neu` öffnet das Formular „Neu …“ — nur, wo die Seite den Knopf
  zeigt — und verschwindet danach aus der Adresse (sonst öffnete jedes
  Neuladen das Formular wieder).
*/
function Seite({ darf, oeffnen }: { darf: boolean; oeffnen: () => void }) {
  useNeuAusAdresse(oeffnen, darf);
  return <p data-testid="adresse">{useLocation().search}</p>;
}
const zeige = (adresse: string, darf: boolean, oeffnen = vi.fn()) => {
  render(<MemoryRouter initialEntries={[adresse]}><Seite darf={darf} oeffnen={oeffnen} /></MemoryRouter>);
  return oeffnen;
};

describe('useNeuAusAdresse', () => {
  it('öffnet einmal und nimmt den Parameter aus der Adresse', () => {
    const oeffnen = zeige('/customers?neu&suche=Huber', true);
    expect(oeffnen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('adresse')).toHaveTextContent('?suche=Huber');
  });
  it('gleich geblieben: „?neu=fuer&kunde=…“ aus der Kundenakte liest die Seite selbst — unberührt', () => {
    expect(zeige('/quotes?neu=fuer&kunde=k1', true)).not.toHaveBeenCalled();
    expect(screen.getByTestId('adresse')).toHaveTextContent('?neu=fuer&kunde=k1');
  });
  it('ohne das Recht des Knopfs nichts', () => {
    expect(zeige('/customers?neu', false)).not.toHaveBeenCalled();
  });
  it('gleich geblieben: ohne Parameter nichts', () => {
    expect(zeige('/customers', true)).not.toHaveBeenCalled();
  });
});
