import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * DER SCHALTER „ANTWORT EINES KUNDEN ÜBER DEN ANNAHME-LINK“ (M02a) in
 * „Mein Konto“: nur für die, die Angebote annehmen dürfen (Projektleitung,
 * Geschäftsführung, Administration), nur mit eingeschalteter Annahme per
 * Link; Vorgabe an; abschalten speichert `notifyAngebot: false` mit den
 * übrigen Schaltern, wie sie stehen.
 */
const profil = { uid: 'c1', email: 'chefin@perl.at', name: 'Carla Chefin', role: 'Geschäftsführung', companyId: 'perl', docId: 'c1' };
let module: Record<string, boolean> | undefined;
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: profil, company: { id: 'perl', name: 'Perl', modules: module }, signOut: vi.fn(), einblick: null, reloadCompany: vi.fn() }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
let gespeichert: Record<string, unknown> | null = null;
const savePrefs = vi.fn<(c: string, u: string, p: Record<string, unknown>) => Promise<void>>(async () => undefined);
vi.mock('@/lib/db/prefs', () => ({
  getPrefs: () => Promise.resolve(gespeichert),
  savePrefs: (c: string, u: string, p: Record<string, unknown>) => savePrefs(c, u, p),
  PREFS_DEFAULTS: { notifyNewOrder: true, notifyOrderReady: true, notifyUrgentDelivery: true, notifyAbwesenheit: true, notifyAngebot: true },
}));
vi.mock('@/lib/push', () => ({ getPushState: () => Promise.resolve('aus'), enablePush: vi.fn(), disablePush: vi.fn() }));
vi.mock('@/lib/auth/sitzung', () => ({
  passwortSetzen: vi.fn(async () => undefined),
  zweiterFaktorStand: vi.fn(async () => ({ angeboten: false })),
}));

const { default: NotificationSettings } = await import('@/features/settings/NotificationSettings');
const SCHALTER = 'Antwort eines Kunden über den Annahme-Link';

beforeEach(() => {
  profil.role = 'Geschäftsführung';
  module = undefined;
  gespeichert = null;
  savePrefs.mockClear();
});

describe('Meldung über die Antwort eines Kunden', () => {
  it('für die Führung, Vorgabe an — abschalten speichert nur diesen Schalter anders', async () => {
    const nutzer = userEvent.setup();
    render(<NotificationSettings />);
    const kaestchen = await screen.findByLabelText(SCHALTER);
    expect(kaestchen).toBeChecked();
    await nutzer.click(kaestchen);
    await waitFor(() => expect(savePrefs).toHaveBeenCalledWith('perl', 'c1', expect.objectContaining({
      notifyAngebot: false, notifyAbwesenheit: true, notifyNewOrder: true,
    })));
    expect(kaestchen).not.toBeChecked();
  });

  it('liest den gespeicherten Stand', async () => {
    gespeichert = { notifyAngebot: false };
    render(<NotificationSettings />);
    await waitFor(async () => expect(await screen.findByLabelText(SCHALTER)).not.toBeChecked());
  });

  it('nicht für Buchhaltung und Monteur, nicht ohne die Annahme per Link', async () => {
    for (const [rolle, festlegung] of [
      ['Buchhaltung', undefined], ['Mitarbeiter', undefined], ['Geschäftsführung', { 'angebote.online_annahme': false }],
      ['Projektleiter', { angebote: false }],
    ] as const) {
      profil.role = rolle;
      module = festlegung as Record<string, boolean> | undefined;
      const r = render(<NotificationSettings />);
      await screen.findByText('Dieses Gerät bekommt noch keine Meldungen.');
      expect(screen.queryByLabelText(SCHALTER), rolle).toBeNull();
      r.unmount();
    }
    // Gegenprobe: die Projektleitung mit eingeschalteter Annahme per Link sieht ihn.
    profil.role = 'Projektleiter';
    module = undefined;
    render(<NotificationSettings />);
    expect(await screen.findByLabelText(SCHALTER)).toBeInTheDocument();
  });
});
