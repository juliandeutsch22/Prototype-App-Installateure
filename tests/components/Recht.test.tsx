import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImpressumView from '@/features/recht/ImpressumView';
import DatenschutzView from '@/features/recht/DatenschutzView';
import RechtLinks from '@/components/RechtLinks';
import { GEPRUEFT, VERARBEITER } from '@/features/recht/betreiber';

/**
 * Impressum und Datenschutz.
 *
 * Geprüft wird nicht der Rechtstext — den gibt jemand mit Rechtskenntnis
 * frei —, sondern dass die Seiten ehrlich sind: solange nicht geprüft, steht
 * „Entwurf" darüber; jeder Unterauftragsverarbeiter aus der Liste steht auf
 * der Seite; und die Wege dorthin gibt es.
 */

const zeige = (el: JSX.Element) => render(<MemoryRouter>{el}</MemoryRouter>);

describe('Rechtsseiten', () => {
  it('kennzeichnen den Entwurf, solange die Texte nicht freigegeben sind', () => {
    expect(GEPRUEFT).toBe(false);
    zeige(<ImpressumView />);
    expect(screen.getByRole('note')).toHaveTextContent('Entwurf');
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur App' })).toHaveAttribute('href', '/');
  });

  it('nennt im Impressum den Betreiber der Software, nicht den Betrieb', () => {
    zeige(<ImpressumView />);
    expect(screen.getByText('Medieninhaber und Diensteanbieter')).toBeInTheDocument();
    expect(screen.getByText(/Name bzw. Firma des Betreibers/)).toBeInTheDocument();
  });

  it('führt in der Datenschutzerklärung jeden Unterauftragsverarbeiter auf', () => {
    zeige(<DatenschutzView />);
    const abschnitt = screen.getByRole('heading', { name: 'Wer die Daten technisch verarbeitet' })
      .closest('section')!;
    for (const v of VERARBEITER) {
      expect(within(abschnitt).getAllByText(v.wer).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Österreichischen Datenschutzbehörde/)).toBeInTheDocument();
    expect(screen.getByText(/Fehlerprotokoll nach 90 Tagen/)).toBeInTheDocument();
  });

  it('verlinkt beide Seiten', () => {
    zeige(<RechtLinks />);
    expect(screen.getByRole('link', { name: 'Datenschutz' })).toHaveAttribute('href', '/datenschutz');
    expect(screen.getByRole('link', { name: 'Impressum' })).toHaveAttribute('href', '/impressum');
  });
});
