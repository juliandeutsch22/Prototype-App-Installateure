import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * „Mein Konto" (Analyse 03.10.2026, Paket 2): wer hierherkommt, will meistens
 * die Meldungen auf dem Telefon einschalten. Deshalb steht das Gerät oben,
 * das Passwort — zweimal im Jahr gebraucht — hinter einem Knopf, aber weiter
 * auf der einzigen Unterseite, die jede Rolle sieht.
 */
const PROFIL = {
  uid: 'm1',
  email: 'max@perl.at',
  name: 'Max Mustermann',
  role: 'Mitarbeiter',
  companyId: 'perl',
  docId: 'm1',
};

vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: PROFIL }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/db/prefs', () => ({
  getPrefs: () => Promise.resolve(null),
  savePrefs: vi.fn(),
  PREFS_DEFAULTS: {},
}));
vi.mock('@/lib/push', () => ({
  getPushState: () => Promise.resolve('aus'),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));
vi.mock('@/lib/auth/sitzung', () => ({ passwortSetzen: vi.fn(async () => undefined) }));

const { default: NotificationSettings } = await import('@/features/settings/NotificationSettings');

describe('Mein Konto', () => {
  it('zeigt zuerst das Gerät, dann die Auswahl, zuletzt das Passwort', async () => {
    render(<NotificationSettings />);
    await screen.findByText('Dieses Gerät bekommt noch keine Meldungen.');
    // Karten mit Hinweis tragen den „i"-Knopf in der Überschrift — deshalb über den Anfang.
    const ueberschriften = screen.getAllByRole('heading').map((h) => h.textContent ?? '');
    const stelle = (anfang: string) => ueberschriften.findIndex((t) => t.startsWith(anfang));
    const geraet = stelle('Dieses Gerät');
    const auswahl = stelle('Wovon möchtest du erfahren?');
    const passwort = ueberschriften.indexOf('Passwort');
    expect(geraet).toBeGreaterThanOrEqual(0);
    expect(auswahl).toBeGreaterThan(geraet);
    expect(passwort).toBeGreaterThan(auswahl);
  });

  it('öffnet das Passwort-Formular erst auf Knopfdruck', async () => {
    const nutzer = userEvent.setup();
    render(<NotificationSettings />);
    await screen.findByText('Dieses Gerät bekommt noch keine Meldungen.');
    expect(screen.queryByLabelText(/Aktuelles Passwort/)).not.toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Passwort ändern' }));
    expect(screen.getByRole('heading', { name: /^Passwort ändern/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Aktuelles Passwort/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Neues Passwort/)).toBeInTheDocument();
    // Der Öffnen-Knopf ist weg; übrig bleibt nur der des Formulars.
    expect(screen.getAllByRole('button', { name: 'Passwort ändern' })).toHaveLength(1);
  });
});
