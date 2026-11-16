import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Hinweiszeile from '@/components/Hinweiszeile';

/*
  U9 (Durchsicht 15.11.2026): von einer langen Warnung steht der eine Satz
  da, der Rest kommt auf „Anzeigen“. Geprüft wird der Ablauf am Baustein;
  welche Stellen ihn nutzen müssen, prüft `tests/unit/warntextKurz.test.ts`.
*/
describe('Hinweiszeile mit Einzelheiten (U9)', () => {
  it('zeigt den Satz, die Einzelheiten erst auf „Anzeigen“ — und wieder weg mit „Ausblenden“', async () => {
    render(
      <Hinweiszeile stufe="warn" einzelheiten={<p>Weil der Grund lang ist.</p>}>
        <p>Etwas fehlt.</p>
      </Hinweiszeile>,
    );
    expect(screen.getByText('Etwas fehlt.')).toBeVisible();
    const knopf = screen.getByRole('button', { name: 'Anzeigen' });
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    // aria-controls zeigt immer auf ein vorhandenes Element, auch zugeklappt.
    const ziel = document.getElementById(knopf.getAttribute('aria-controls')!);
    expect(ziel).not.toBeNull();
    expect(screen.getByText('Weil der Grund lang ist.')).not.toBeVisible();

    await userEvent.click(knopf);
    expect(knopf).toHaveAttribute('aria-expanded', 'true');
    expect(knopf).toHaveTextContent('Ausblenden');
    expect(screen.getByText('Weil der Grund lang ist.')).toBeVisible();
    expect(ziel).toContainElement(screen.getByText('Weil der Grund lang ist.'));

    await userEvent.click(knopf);
    expect(screen.getByText('Weil der Grund lang ist.')).not.toBeVisible();
  });

  it('Gleichbleiben: ohne Einzelheiten kein „Anzeigen“, der Text steht wie bisher offen', () => {
    render(
      <Hinweiszeile stufe="warn">
        <p>Ein kurzer Satz.</p>
      </Hinweiszeile>,
    );
    expect(screen.getByText('Ein kurzer Satz.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
