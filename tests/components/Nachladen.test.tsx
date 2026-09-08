import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Nachladen from '@/components/Nachladen';

/**
 * „So weit reicht diese Liste."
 *
 * Jede Liste dieser App hat eine Obergrenze, und bis zum 08.09.2026 sagte
 * keine einzige, wenn sie erreicht war. Das ist kein Geschwindigkeitsproblem,
 * es ist ein Wahrheitsproblem: der 501. Kunde existierte für die App schlicht
 * nicht, und nichts sagte es.
 */
describe('Der Hinweis auf die Grenze', () => {
  /*
    NUR WENN DIE GRENZE WIRKLICH GREIFT. Steht die Liste bei 43 von 500, ist
    nichts abgeschnitten — ein Hinweis wäre Lärm, und Lärm gewöhnt man sich
    ab, gerade den, der einmal im Jahr wichtig wäre.
  */
  it('schweigt, solange die Liste unter der Grenze bleibt', () => {
    const { container } = render(
      <Nachladen geladen={43} grenze={500} einheit="Kunden" onMehr={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('meldet sich, sobald die Grenze erreicht ist', () => {
    render(<Nachladen geladen={500} grenze={500} einheit="Kunden" onMehr={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Weitere Kunden laden' })).toBeInTheDocument();
    expect(screen.getByText(/500 von möglicherweise mehr/)).toBeInTheDocument();
  });

  /*
    DER ZWEITE SATZ IST DER WICHTIGERE. Die Suche läuft im Browser und damit
    nur über das Geladene. Ohne den Hinweis sucht jemand einen alten Kunden,
    findet nichts und schliesst daraus, es gebe ihn nicht — der Fehler wird
    also gerade dort gefährlich, wo jemand gezielt nachschlägt.
  */
  it('sagt, dass die Suche nur über das Geladene geht', () => {
    render(<Nachladen geladen={100} grenze={100} einheit="Scheine" onMehr={() => undefined} />);
    expect(screen.getByText(/Suche geht nur über diese/)).toBeInTheDocument();
  });

  it('lässt den Satz weg, wo serverseitig gesucht wird', () => {
    render(
      <Nachladen
        geladen={100}
        grenze={100}
        einheit="Kunden"
        sucheImBrowser={false}
        onMehr={() => undefined}
      />,
    );
    expect(screen.queryByText(/Suche geht nur/)).not.toBeInTheDocument();
  });

  it('reicht den Griff nach mehr durch', async () => {
    const mehr = vi.fn();
    render(<Nachladen geladen={50} grenze={50} einheit="Rechnungen" onMehr={mehr} />);
    await userEvent.click(screen.getByRole('button', { name: 'Weitere Rechnungen laden' }));
    expect(mehr).toHaveBeenCalled();
  });
});
