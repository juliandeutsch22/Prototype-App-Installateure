import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Die Maske fürs eigene Passwort (Launch-Check 25.09.2026, K7): wer nur
 * ändert, gibt das aktuelle an; wer über einen Rücksetzlink oder mit dem
 * Startpasswort kommt, nicht — er kennt keines.
 */
const passwortSetzen = vi.fn<[string, string | undefined], Promise<void>>(async () => undefined);
vi.mock('@/lib/auth/sitzung', () => ({
  passwortSetzen: (neu: string, aktuell?: string) => passwortSetzen(neu, aktuell),
}));

const { default: PasswortAendern } = await import('@/features/auth/PasswortAendern');

beforeEach(() => {
  passwortSetzen.mockClear();
});

describe('Passwort ändern', () => {
  it('verlangt das aktuelle und reicht es weiter', async () => {
    const nutzer = userEvent.setup();
    render(<PasswortAendern />);
    const knopf = screen.getByRole('button', { name: 'Passwort ändern' });
    await nutzer.type(screen.getByLabelText(/Neues Passwort/), 'neu-und-lang');
    await nutzer.type(screen.getByLabelText(/Noch einmal/), 'neu-und-lang');
    expect(knopf).toBeDisabled();

    await nutzer.type(screen.getByLabelText(/Aktuelles Passwort/), 'alt-und-lang');
    await nutzer.click(knopf);
    expect(passwortSetzen).toHaveBeenCalledWith('neu-und-lang', 'alt-und-lang');
  });

  it('fragt beim ersten Vergeben nicht nach dem aktuellen', async () => {
    const nutzer = userEvent.setup();
    render(<PasswortAendern erstmalig />);
    expect(screen.queryByLabelText(/Aktuelles Passwort/)).not.toBeInTheDocument();
    await nutzer.type(screen.getByLabelText(/Neues Passwort/), 'neu-und-lang');
    await nutzer.type(screen.getByLabelText(/Noch einmal/), 'neu-und-lang');
    await nutzer.click(screen.getByRole('button', { name: 'Passwort vergeben' }));
    expect(passwortSetzen).toHaveBeenCalledWith('neu-und-lang', undefined);
  });
});
