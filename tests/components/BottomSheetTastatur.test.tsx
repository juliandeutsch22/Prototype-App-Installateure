/**
 * Der Inhalt eines Fensters ist mit der Tastatur erreichbar (Stand 18, K2).
 *
 * axe fand es an der Hilfe zu einer Seite: das Fenster enthält nur Text,
 * darin nahm nichts den Fokus, und ein langer Text liess sich ohne Maus
 * nicht rollen (`scrollable-region-focusable`).
 *
 * Gegenprobe: ohne den Halt am Inhalt springt Tab von „Schließen“ gleich
 * wieder auf „Schließen“ (rot). Gleich bleibt: wo Knöpfe oder Felder im
 * Fenster stehen, gibt es keinen Halt mehr als vorher — auf „Schließen“
 * folgt das erste Feld. Und lädt der Inhalt erst nach, wird neu entschieden.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BottomSheet from '@/components/BottomSheet';

describe('Fenster mit der Tastatur', () => {
  it('nur Text: Tab erreicht den Inhalt, damit er sich rollen lässt', async () => {
    render(
      <BottomSheet open onClose={() => {}} label="Hilfe" auchBreit titel="Hilfe zu dieser Seite">
        <p>Ein langer Text ohne Knopf.</p>
      </BottomSheet>,
    );
    const nutzer = userEvent.setup();
    await nutzer.tab();
    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveFocus();
    await nutzer.tab();
    expect(document.activeElement).toBe(screen.getByText('Ein langer Text ohne Knopf.').closest('.fenster-inhalt'));
  });

  it('gleich geblieben: mit Feldern kein zusätzlicher Halt — auf „Schließen“ folgt das Feld', async () => {
    render(
      <BottomSheet open onClose={() => {}} label="Formular">
        <label>
          Name
          <input />
        </label>
      </BottomSheet>,
    );
    const nutzer = userEvent.setup();
    await nutzer.tab();
    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveFocus();
    await nutzer.tab();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(document.querySelector('.blatt-inhalt')).not.toHaveAttribute('tabindex');
  });

  it('kommt ein Knopf erst nach dem Öffnen dazu, fällt der Halt am Inhalt weg', async () => {
    const { rerender } = render(
      <BottomSheet open onClose={() => {}} label="Lädt">
        <p>Wird geladen</p>
      </BottomSheet>,
    );
    const inhalt = document.querySelector('.blatt-inhalt')!;
    expect(inhalt).toHaveAttribute('tabindex', '0');
    rerender(
      <BottomSheet open onClose={() => {}} label="Lädt">
        <button type="button">Übernehmen</button>
      </BottomSheet>,
    );
    await waitFor(() => expect(inhalt).not.toHaveAttribute('tabindex'));
  });
});
