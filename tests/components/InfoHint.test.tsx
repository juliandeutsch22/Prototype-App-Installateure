import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InfoHint from '@/components/InfoHint';
import Card from '@/components/Card';
import { CheckboxField } from '@/components/Field';

/**
 * Das „i" ersetzt den Beipacktext, der bisher unter jedem Feld stand. Zwei
 * Zusagen: der Text ist vorher WIRKLICH weg (nicht nur unsichtbar gestellt),
 * und der Tipp darauf aendert nichts an der Einstellung daneben.
 */

describe('Info-Hinweis', () => {
  it('haelt die Erklaerung zurueck, bis jemand fragt', async () => {
    render(
      <div className="flex flex-wrap">
        <span>Eilzustellung</span>
        <InfoHint about="Eilzustellung">Die Projektleitung wird sofort verständigt.</InfoHint>
      </div>,
    );
    expect(screen.queryByText(/sofort verständigt/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Was bedeutet Eilzustellung?' }));
    expect(screen.getByText(/sofort verständigt/)).toBeInTheDocument();
  });

  it('klappt auf demselben Weg wieder zu', async () => {
    render(
      <div className="flex flex-wrap">
        <InfoHint about="Eilzustellung">Erklärung.</InfoHint>
      </div>,
    );
    const knopf = screen.getByRole('button', { name: 'Was bedeutet Eilzustellung?' });
    await userEvent.click(knopf);
    await userEvent.click(
      screen.getByRole('button', { name: 'Erklärung zu Eilzustellung schließen' }),
    );
    expect(screen.queryByText('Erklärung.')).not.toBeInTheDocument();
  });

  /**
   * Der Knopf sitzt neben einem Kaestchen. Landete er einmal INNERHALB des
   * <label>, schaltete jeder Tipp auf das „i" zugleich die Einstellung um —
   * eine Erklaerung, die die Bestellung aendert.
   */
  it('schaltet das Kaestchen nicht mit um, auch im Label', async () => {
    // Bewusst INNERHALB des <label> gerendert — genau der Fall, gegen den
    // die Sperre schuetzt. Als blosses Geschwister nebenan liefe der Test
    // ins Leere: dorthin steigt das Ereignis gar nicht erst auf.
    render(
      <CheckboxField
        id="eil"
        defaultChecked={false}
        label={
          <span className="flex flex-wrap items-center gap-2">
            Eilzustellung
            <InfoHint about="Eilzustellung">Erklärung.</InfoHint>
          </span>
        }
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Was bedeutet Eilzustellung?' }));
    expect(screen.getByText('Erklärung.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('verknuepft Knopf und Text fuer die Vorlesehilfe', async () => {
    render(
      <div className="flex flex-wrap">
        <InfoHint about="Eilzustellung">Erklärung.</InfoHint>
      </div>,
    );
    const knopf = screen.getByRole('button');
    await userEvent.click(knopf);
    expect(knopf).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Erklärung.')).toHaveAttribute(
      'id',
      knopf.getAttribute('aria-controls'),
    );
  });

  it('haengt in der Karte am Titel und laesst den Inhalt in Ruhe', async () => {
    render(
      <Card title="Zuschläge" hint="Nacht und Notdienst können zusammentreffen.">
        <p>Formularfelder</p>
      </Card>,
    );
    expect(screen.queryByText(/zusammentreffen/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Was bedeutet Zuschläge?' }));
    expect(screen.getByText(/zusammentreffen/)).toBeInTheDocument();
    expect(screen.getByText('Formularfelder')).toBeInTheDocument();
  });

  it('zeigt in einer Karte ohne Hinweis auch kein „i"', () => {
    render(
      <Card title="Zuschläge">
        <p>Formularfelder</p>
      </Card>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
