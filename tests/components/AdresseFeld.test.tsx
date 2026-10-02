import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdresseFeld from '@/components/AdresseFeld';

/**
 * G3 (Nachtest 01.10.2026): „Alois-Köberl-Gasse 11KI-Teststraße 1, 8200
 * Gleisdorf“ — die getippte Adresse vor dem Vorschlag des Kunden. Das Feld
 * erkennt die Vermischung und bietet beide an.
 */
const KUNDE = 'KI-Teststraße 1, 8200 Gleisdorf';

describe('Adressfeld mit Vorschlag aus dem Kunden', () => {
  it('erkennt zwei Adressen ineinander und bietet die getippte an', async () => {
    const onChange = vi.fn();
    render(<AdresseFeld id="a" label="Baustellenadresse" value={`Alois-Köberl-Gasse 11${KUNDE}`} vorschlag={KUNDE} onChange={onChange} />);
    expect(screen.getByText(/zwei Adressen ineinander/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Alois-Köberl-Gasse 11' }));
    expect(onChange).toHaveBeenCalledWith('Alois-Köberl-Gasse 11');
  });

  it('schweigt beim reinen Vorschlag und bei einer ganz anderen Adresse', () => {
    const { rerender } = render(<AdresseFeld id="a" label="Adresse" value={KUNDE} vorschlag={KUNDE} onChange={() => {}} />);
    expect(screen.queryByText(/zwei Adressen/)).not.toBeInTheDocument();
    rerender(<AdresseFeld id="a" label="Adresse" value="Hauptplatz 7, 8200 Gleisdorf" vorschlag={KUNDE} onChange={() => {}} />);
    expect(screen.queryByText(/zwei Adressen/)).not.toBeInTheDocument();
  });
});
