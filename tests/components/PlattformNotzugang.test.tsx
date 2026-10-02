import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastProvider } from '@/components/Toast';

/**
 * Nachtest 01.10.2026, N5: „Passwort neu setzen“ im Notzugang nur, wenn der
 * Betrieb ein aktives Leitungskonto mit Benutzername hat. Vorher stand der
 * Knopf auch bei „Senklot Testbetrieb GmbH“ ohne ein solches Konto, und erst
 * nach dem Klick kam die Erklärung.
 */

let betriebe: unknown[] = [];
vi.mock('@/lib/db/plattform', () => ({
  betriebAnlegen: vi.fn(),
  betriebAnlegenMitAnmeldung: vi.fn(),
  plattformBetriebe: vi.fn(async () => betriebe),
  leitungskontenImNotzugang: vi.fn(async () => []),
  notzugangPasswort: vi.fn(),
}));
vi.mock('@/lib/db/support', () => ({
  notzugang: vi.fn(),
  offeneFreigaben: vi.fn(async () => [
    { id: 'f1', company_id: 'senklot-test', name: 'Senklot Testbetrieb GmbH', grund: 'Wiederherstellung', notzugang: true, stufe: 'mitarbeiten', gilt_bis: '2026-10-02T12:58:00Z' },
  ]),
}));
vi.mock('@/lib/db/fehlerprotokoll', () => ({ plattformFehler: vi.fn(async () => []) }));
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

const { default: PlattformView } = await import('@/features/plattform/PlattformView');

const betrieb = (leitungskonten: number, leitungMitMail: number) => ({
  kennung: 'senklot-test', name: 'Senklot Testbetrieb GmbH', angelegtAm: '2026-09-01T08:00:00Z',
  leitungskonten, leitungMitMail, notzugangBis: '2026-10-02T12:58:00Z',
});

function zeige() {
  return render(<ToastProvider><PlattformView /></ToastProvider>);
}

beforeEach(() => {
  betriebe = [];
});

describe('Notzugang: Passwort neu setzen (N5)', () => {
  it('mit einem Leitungskonto mit Benutzername steht der Knopf', async () => {
    betriebe = [betrieb(2, 1)];
    zeige();
    expect(await screen.findByRole('button', { name: 'Passwort neu setzen' })).toBeInTheDocument();
  });

  it('nur Leitung mit E-Mail: kein Knopf, sondern der Weg über „Passwort vergessen“', async () => {
    betriebe = [betrieb(1, 1)];
    zeige();
    expect(await screen.findByText(/Kein aktives Leitungskonto mit Benutzername/)).toBeInTheDocument();
    expect(screen.getByText(/Passwort vergessen“ auf der Anmeldeseite/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passwort neu setzen' })).not.toBeInTheDocument();
  });

  it('gar kein aktives Leitungskonto: kein Knopf', async () => {
    betriebe = [betrieb(0, 0)];
    zeige();
    expect(await screen.findByText(/Kein aktives Leitungskonto mit Benutzername/)).toBeInTheDocument();
    expect(screen.queryByText(/Passwort vergessen“ auf der Anmeldeseite/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passwort neu setzen' })).not.toBeInTheDocument();
  });

  it('solange die Liste der Betriebe fehlt, verspricht der Knopf nichts', async () => {
    betriebe = [];
    zeige();
    expect(await screen.findByText('Senklot Testbetrieb GmbH')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passwort neu setzen' })).not.toBeInTheDocument();
  });
});
