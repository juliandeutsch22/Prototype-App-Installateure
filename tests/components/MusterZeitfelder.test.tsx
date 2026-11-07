import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MusterZeitfelder from '@/features/muster/MusterZeitfelder';

/**
 * Die freien Zeitfelder auf der Musterseite (M06b): jeder Typ in der Maske,
 * Pflicht, die nicht mehr wählbare Option, eine Meldung, und die Angaben als
 * Text mit „Nachpflege“ und „fehlt“.
 *
 * Gegenprobe: ohne `MusterZeitfelder` steht nichts davon da — rot.
 */
describe('Musterseite — freie Zeitfelder', () => {
  it('zeigt jeden Typ, die Pflicht und die nicht mehr wählbare Option an ihrem Wert', () => {
    render(<MusterZeitfelder />);
    expect(screen.getByLabelText(/^Kostenstelle/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('option', { name: 'Linz (nicht mehr wählbar)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kilometer Firmenauto (km)')).toHaveValue('12,5');
    expect(screen.getByLabelText('Material vom Kunden gestellt')).toHaveValue('ja');
    expect(screen.getByLabelText('Auftragsnummer Hausverwaltung')).toBeInTheDocument();
    expect(screen.getByLabelText('Datum der Abnahme')).toHaveAttribute('type', 'date');
    expect(screen.getByText('Kilometer Firmenauto: Höchstens 1 Nachkommastellen')).toBeInTheDocument();
  });

  it('zeigt die Angaben als Text mit „fehlt“ und „Nachpflege“', () => {
    render(<MusterZeitfelder />);
    expect(screen.getByText('Kostenstelle: Wien · Kilometer Firmenauto: 12,5 km · Material vom Kunden gestellt: Ja')).toBeInTheDocument();
    expect(screen.getByText('fehlt: Auftragsnummer Hausverwaltung')).toBeInTheDocument();
    expect(screen.getByText('Nachpflege: Kostenstelle')).toBeInTheDocument();
  });
});
