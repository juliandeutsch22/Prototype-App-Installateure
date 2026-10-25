import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Kennzahlen, { type Kennzahl } from '@/features/dashboard/start/Kennzahlen';

/**
 * Der Stand der Startseite als eine Zeile (E22, 25.10.2026).
 *
 * Vorher vier große Kacheln; jetzt Beschriftung, Wert und Zusatz in einem
 * Verweis. Geprüft wird, dass dabei nichts verloren geht — jeder Wert, jeder
 * Zusatz, jedes Ziel — und dass nur ausfällt, was der Aufbau als leer meldet.
 */

function zeichne(werte: Kennzahl[]) {
  return render(
    <MemoryRouter>
      <Kennzahlen werte={werte} />
    </MemoryRouter>,
  );
}

const OFFEN: Kennzahl = { key: 'offen', label: 'Offen', wert: '€ 500,00', zusatz: '2 Rechnungen', to: '/invoices' };
const UEBER: Kennzahl = { key: 'ueberfaellig', label: 'Überfällig', wert: '€ 150,00', zusatz: '1 Rechnung', to: '/invoices?status=%C3%9Cberf%C3%A4llig', ton: 'danger' };

describe('Stand-Zeile der Startseite', () => {
  it('steht jeder Wert mit Beschriftung und Zusatz in einem Verweis auf seine Liste', () => {
    zeichne([OFFEN, UEBER]);
    const zeile = screen.getByRole('list', { name: 'Stand' });
    const offen = within(zeile).getByRole('link', { name: /^Offen/ });
    expect(offen).toHaveAttribute('href', '/invoices');
    expect(offen).toHaveTextContent('Offen € 500,00 2 Rechnungen');
    expect(within(zeile).getByRole('link', { name: /^Überfällig/ })).toHaveAttribute('href', '/invoices?status=%C3%9Cberf%C3%A4llig');
  });

  it('bleibt rot, wo etwas überfällig ist — und nur dort', () => {
    zeichne([OFFEN, UEBER]);
    expect(screen.getByText('€ 150,00')).toHaveClass('lage-wert-rot');
    expect(screen.getByText('€ 500,00')).not.toHaveClass('lage-wert-rot');
  });

  it('lässt aus, was der Aufbau als leer meldet', () => {
    zeichne([OFFEN, { ...UEBER, wert: '€ 0,00', zusatz: 'keine Rechnung', ton: undefined, leer: true }]);
    expect(screen.queryByRole('link', { name: /^Überfällig/ })).toBeNull();
    expect(screen.getByRole('link', { name: /^Offen/ })).toBeInTheDocument();
  });

  it('Gegenprobe: eine Null ohne „leer“ bleibt stehen — Resturlaub 0 Tage ist eine Auskunft', () => {
    zeichne([{ key: 'urlaub', label: 'Resturlaub', wert: '0 Tage', zusatz: 'von 25 Tagen', to: '/vacations' }]);
    expect(screen.getByRole('link', { name: /^Resturlaub/ })).toHaveTextContent('Resturlaub 0 Tage von 25 Tagen');
  });

  it('zeigt gar nichts, wenn alles leer ist — keine leere Leiste', () => {
    const { container } = zeichne([{ ...OFFEN, leer: true }, { ...UEBER, leer: true }]);
    expect(container).toBeEmptyDOMElement();
  });

  it('keine Kachel mehr: kein Kennzahlen-Raster, keine großen Werte', () => {
    const { container } = zeichne([OFFEN, UEBER]);
    expect(container.querySelector('.kennzahl, .kennzahlen, .kennzahl-wert')).toBeNull();
  });
});
