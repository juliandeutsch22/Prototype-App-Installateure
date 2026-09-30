import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/*
  TESTBERICHT 30.09.2026, P2 — das Formular im Notzugang: ohne Grund,
  Rückrufnummer und bestätigte Identität lässt es sich nicht abschicken; das
  Startpasswort steht danach einmal da.
*/
const setzen = vi.fn();
vi.mock('@/lib/db/plattform', () => ({
  leitungskontenImNotzugang: vi.fn(async () => [
    { uid: '11111111-1111-1111-1111-111111111111', name: 'Petra Perl', rolle: 'Administrator', benutzername: 'petra.perl' },
  ]),
  notzugangPasswort: (e: unknown) => setzen(e),
}));

const { default: NotzugangPasswort } = await import('@/features/plattform/NotzugangPasswort');

beforeEach(() => {
  setzen.mockReset();
  setzen.mockResolvedValue('Kx7mPq2wRt9aBc');
});

describe('Passwort über den Notzugang (P2)', () => {
  it('schickt erst ab, wenn Grund, Rückruf und Bestätigung da sind — dann das Startpasswort einmal', async () => {
    const nutzer = userEvent.setup();
    render(<NotzugangPasswort kennung="perl" name="Perl Installationen" />);
    await nutzer.selectOptions(await screen.findByLabelText(/^Konto/), '11111111-1111-1111-1111-111111111111');
    const knopf = screen.getByRole('button', { name: 'Startpasswort erzeugen' });
    await nutzer.type(screen.getByLabelText(/^Grund/), 'Passwort vergessen');
    await nutzer.type(screen.getByLabelText(/^Rückruf an/), '+43 1 234 56 78');
    expect(knopf).toBeDisabled();
    await nutzer.click(screen.getByLabelText(/Identität ist durch Rückruf/));
    expect(knopf).toBeEnabled();
    await nutzer.click(knopf);

    await waitFor(() => expect(setzen).toHaveBeenCalled());
    expect(setzen.mock.calls[0][0]).toMatchObject({
      uid: '11111111-1111-1111-1111-111111111111', grund: 'Passwort vergessen',
      rueckruf: '+43 1 234 56 78', identitaetBestaetigt: true,
    });
    expect(await screen.findByText('Kx7mPq2wRt9aBc')).toBeInTheDocument();
  });

  it('Gegenprobe: eine Ablehnung steht da, ein Passwort nicht', async () => {
    const nutzer = userEvent.setup();
    setzen.mockRejectedValue(new Error('Für diesen Betrieb ist kein Notzugang offen'));
    render(<NotzugangPasswort kennung="perl" name="Perl Installationen" />);
    await nutzer.selectOptions(await screen.findByLabelText(/^Konto/), '11111111-1111-1111-1111-111111111111');
    await nutzer.type(screen.getByLabelText(/^Grund/), 'x');
    await nutzer.type(screen.getByLabelText(/^Rückruf an/), 'y');
    await nutzer.click(screen.getByLabelText(/Identität ist durch Rückruf/));
    await nutzer.click(screen.getByRole('button', { name: 'Startpasswort erzeugen' }));
    expect(await screen.findByText(/kein Notzugang offen/)).toBeInTheDocument();
    expect(screen.queryByText(/Startpasswort für/)).toBeNull();
  });
});
