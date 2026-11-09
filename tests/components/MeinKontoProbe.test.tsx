import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/*
 * „MEIN KONTO“: PROBEMELDUNG UND ABSCHALTEN (E69). Ob Meldungen ankommen,
 * war von außen nicht zu sehen. Jetzt schickt man sich eine Probe und liest
 * Googles Antwort. Abschalten ist ausdrücklich — das Gerät bleibt dann aus,
 * auch beim nächsten Start.
 *
 * Gegenprobe: ohne den Knopf bzw. mit `disablePush(uid)` ohne „ausdrücklich“
 * sind die Prüfungen rot.
 */
const PROFIL = { uid: 'm1', email: 'max@perl.at', name: 'Max', role: 'Mitarbeiter', companyId: 'perl', docId: 'm1' };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: PROFIL, signOut: vi.fn(), einblick: null }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/db/prefs', () => ({ getPrefs: () => Promise.resolve(null), savePrefs: vi.fn(), PREFS_DEFAULTS: {} }));
let zustand = 'bereit';
const getPushState = vi.fn<(uid: string) => Promise<string>>(async () => zustand);
const disablePush = vi.fn<(uid: string, ausdruecklich?: boolean) => Promise<void>>(async () => { zustand = 'aus'; });
const pushProbe = vi.fn();
vi.mock('@/lib/push', () => ({
  getPushState: (uid: string) => getPushState(uid),
  enablePush: vi.fn(),
  disablePush: (uid: string, ausdruecklich?: boolean) => disablePush(uid, ausdruecklich),
  pushProbe: (f: string, u: string) => pushProbe(f, u),
}));
vi.mock('@/lib/auth/sitzung', () => ({ passwortSetzen: vi.fn(), zweiterFaktorStand: vi.fn(async () => ({ angeboten: false })) }));

const { default: NotificationSettings } = await import('@/features/settings/NotificationSettings');

beforeEach(() => {
  zustand = 'bereit';
  getPushState.mockClear();
  disablePush.mockClear();
  pushProbe.mockReset();
});

describe('Mein Konto — Probemeldung', () => {
  it('der Zustand wird für die angemeldete Person erfragt', async () => {
    render(<NotificationSettings />);
    await screen.findByText('Dieses Gerät ist angemeldet und bekommt Meldungen.');
    expect(getPushState).toHaveBeenCalledWith('m1');
  });

  it('sagt, dass Google die Probe angenommen hat', async () => {
    const nutzer = userEvent.setup();
    pushProbe.mockResolvedValue({ art: 'gesendet' });
    render(<NotificationSettings />);
    await nutzer.click(await screen.findByRole('button', { name: 'Probemeldung senden' }));
    expect(pushProbe).toHaveBeenCalledWith('perl', 'm1');
    expect(await screen.findByRole('status')).toHaveTextContent('Google hat die Probemeldung angenommen');
  });

  it('nennt Googles Code, wenn abgelehnt', async () => {
    const nutzer = userEvent.setup();
    pushProbe.mockResolvedValue({ art: 'abgelehnt', code: 'messaging/third_party_auth_error' });
    render(<NotificationSettings />);
    await nutzer.click(await screen.findByRole('button', { name: 'Probemeldung senden' }));
    expect(await screen.findByText(/Google hat die Probemeldung abgelehnt \(messaging\/third_party_auth_error\)/)).toBeInTheDocument();
  });

  it('ein Fehler des Servers steht als Grund da', async () => {
    const nutzer = userEvent.setup();
    pushProbe.mockRejectedValue(new Error('FCM_DIENSTKONTO fehlt — es wurde nichts verschickt.'));
    render(<NotificationSettings />);
    await nutzer.click(await screen.findByRole('button', { name: 'Probemeldung senden' }));
    expect(await screen.findByText(/FCM_DIENSTKONTO fehlt/)).toBeInTheDocument();
  });

  it('„Auf diesem Gerät abschalten“ schaltet ausdrücklich ab', async () => {
    const nutzer = userEvent.setup();
    render(<NotificationSettings />);
    await nutzer.click(await screen.findByRole('button', { name: 'Auf diesem Gerät abschalten' }));
    expect(disablePush).toHaveBeenCalledWith('m1', true);
    expect(await screen.findByText('Dieses Gerät bekommt noch keine Meldungen.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Probemeldung senden' })).not.toBeInTheDocument();
  });

  it('ohne Anmeldung keine Probe', async () => {
    zustand = 'aus';
    render(<NotificationSettings />);
    await screen.findByRole('button', { name: 'Auf diesem Gerät einschalten' });
    expect(screen.queryByRole('button', { name: 'Probemeldung senden' })).not.toBeInTheDocument();
  });
});
