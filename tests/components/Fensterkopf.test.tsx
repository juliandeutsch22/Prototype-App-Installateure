/**
 * DAS ✕ IM FENSTERKOPF (E74, 10.11.2026). „Schließen“ ist das Zeichen, das
 * jeder vom Telefon kennt — ohne Rahmen, mit dem Namen für Vorlesehilfe und
 * Hinweis. Gegenprobe: mit dem gerahmten Wort aus E72 ist die erste Prüfung
 * rot. Gleich bleibt das verborgene Wort für die Tastatur ohne Titel.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BottomSheet from '@/components/BottomSheet';

describe('Fensterkopf', () => {
  it('das ✕ trägt den Namen „Schließen“, zeigt kein Wort und schließt', async () => {
    const zu = vi.fn();
    render(
      <BottomSheet open onClose={zu} label="Einsatz" auchBreit titel="Einsatz planen">
        <p>Inhalt</p>
      </BottomSheet>,
    );
    const knopf = screen.getByRole('button', { name: 'Schließen' });
    expect(knopf).toHaveClass('fenster-schliessen');
    expect(knopf).toHaveAttribute('title', 'Schließen');
    expect(knopf).toHaveTextContent(/^$/);
    expect(knopf.querySelector('path')?.getAttribute('d')).toBe('M6 6l12 12M18 6 6 18');
    await userEvent.setup().click(knopf);
    expect(zu).toHaveBeenCalled();
  });

  it('gleich geblieben: ohne Titel bleibt „Schließen“ als Wort für die Tastatur verborgen', () => {
    render(
      <BottomSheet open onClose={() => {}} label="Mehr">
        <p>Inhalt</p>
      </BottomSheet>,
    );
    const knopf = screen.getByRole('button', { name: 'Schließen' });
    expect(knopf).toHaveClass('sr-only');
    expect(knopf).toHaveTextContent('Schließen');
  });
});
