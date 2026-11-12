import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * DER SCHALTER FÜR DEN GEÄNDERTEN EINSATZPLAN (B6, E85). Er steht nur dort,
 * wo er etwas bewirkt: bei jemandem, der selbst eingeplant wird, und nur mit
 * der Einsatzplanung im Betrieb. Ab Werk an; wer ihn umlegt, speichert die
 * ganze Auswahl — kein anderer Schalter darf dabei umfallen.
 */
const auth: {
  user: { uid: string; email: string; name: string; role: string; companyId: string; docId: string; active?: boolean };
  company: { id: string; modules?: Record<string, boolean>; projektleitungImEinsatzplan?: boolean } | null;
} = { user: { uid: 'm1', email: 'max@perl.at', name: 'Max', role: 'Mitarbeiter', companyId: 'perl', docId: 'm1' }, company: null };

vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ ...auth, signOut: vi.fn(), einblick: null }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
let gespeichert: Record<string, unknown> | null = null;
let gelesen: Record<string, unknown> | null = null;
const savePrefs = vi.fn(async (_c: string, _u: string, p: Record<string, unknown>) => { gespeichert = p; });
vi.mock('@/lib/db/prefs', async () => {
  const echt = await vi.importActual<typeof import('@/lib/db/meldungsvorgaben')>('@/lib/db/meldungsvorgaben');
  return {
    getPrefs: () => Promise.resolve(gelesen),
    savePrefs: (c: string, u: string, p: Record<string, unknown>) => savePrefs(c, u, p),
    PREFS_DEFAULTS: echt.PREFS_DEFAULTS,
  };
});
vi.mock('@/lib/push', () => ({ getPushState: () => Promise.resolve('aus'), enablePush: vi.fn(), disablePush: vi.fn() }));
vi.mock('@/lib/auth/sitzung', () => ({ passwortSetzen: vi.fn(), zweiterFaktorStand: vi.fn(async () => ({ angeboten: false })) }));

const { default: NotificationSettings } = await import('@/features/settings/NotificationSettings');

const SCHALTER = 'Geänderter Einsatzplan für heute und morgen';

beforeEach(() => {
  auth.user = { uid: 'm1', email: 'max@perl.at', name: 'Max', role: 'Mitarbeiter', companyId: 'perl', docId: 'm1' };
  auth.company = { id: 'perl', modules: {} };
  gespeichert = null;
  gelesen = null;
  savePrefs.mockClear();
});

describe('Mein Konto — Einsatzplan', () => {
  it('ein Monteur sieht den Schalter, ab Werk an, und legt ihn um', async () => {
    render(<NotificationSettings />);
    const schalter = await screen.findByRole('checkbox', { name: SCHALTER });
    expect(schalter).toBeChecked();
    await userEvent.click(schalter);
    await waitFor(() => expect(savePrefs).toHaveBeenCalled());
    expect(gespeichert).toMatchObject({ notifyEinsaetze: false, notifyNachrichten: true, notifyZeiterfassung: true });
    expect(schalter).not.toBeChecked();
  });

  it('übernimmt eine gespeicherte Abwahl', async () => {
    gelesen = { notifyEinsaetze: false };
    render(<NotificationSettings />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: SCHALTER })).not.toBeChecked());
  });

  it('ein anderer Schalter lässt die Wahl für den Einsatzplan stehen', async () => {
    gelesen = { notifyEinsaetze: false };
    render(<NotificationSettings />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: SCHALTER })).not.toBeChecked());
    await userEvent.click(screen.getByRole('checkbox', { name: /Zeiterfassung/ }));
    await waitFor(() => expect(savePrefs).toHaveBeenCalled());
    expect(gespeichert).toMatchObject({ notifyEinsaetze: false, notifyZeiterfassung: false });
  });

  it('Gegenprobe: ohne Einsatzplanung im Betrieb kein Schalter', async () => {
    auth.company = { id: 'perl', modules: { einsatzplanung: false } };
    render(<NotificationSettings />);
    await screen.findByRole('checkbox', { name: /Zeiterfassung/ });
    expect(screen.queryByRole('checkbox', { name: SCHALTER })).toBeNull();
  });

  it('Gegenprobe: wer nicht eingeplant wird (Geschäftsführung), sieht ihn nicht', async () => {
    auth.user = { ...auth.user, role: 'Geschäftsführung' };
    render(<NotificationSettings />);
    await screen.findByRole('checkbox', { name: /Zeiterfassung/ });
    expect(screen.queryByRole('checkbox', { name: SCHALTER })).toBeNull();
  });

  it('die Projektleitung nur, wenn der Betrieb sie im Einsatzplan führt', async () => {
    auth.user = { ...auth.user, role: 'Projektleiter' };
    const { unmount } = render(<NotificationSettings />);
    await screen.findByRole('checkbox', { name: /Zeiterfassung/ });
    expect(screen.queryByRole('checkbox', { name: SCHALTER })).toBeNull();
    unmount();
    auth.company = { id: 'perl', modules: {}, projektleitungImEinsatzplan: true };
    render(<NotificationSettings />);
    expect(await screen.findByRole('checkbox', { name: SCHALTER })).toBeChecked();
  });
});
