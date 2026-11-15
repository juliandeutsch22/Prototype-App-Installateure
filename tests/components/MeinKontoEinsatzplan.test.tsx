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
    const schalter = await screen.findByRole('switch', { name: SCHALTER });
    expect(schalter).toBeChecked();
    await userEvent.click(schalter);
    await waitFor(() => expect(savePrefs).toHaveBeenCalled());
    expect(gespeichert).toMatchObject({ notifyEinsaetze: false, notifyNachrichten: true, notifyZeiterfassung: true });
    expect(schalter).not.toBeChecked();
  });

  it('übernimmt eine gespeicherte Abwahl', async () => {
    gelesen = { notifyEinsaetze: false };
    render(<NotificationSettings />);
    await waitFor(() => expect(screen.getByRole('switch', { name: SCHALTER })).not.toBeChecked());
  });

  it('ein anderer Schalter lässt die Wahl für den Einsatzplan stehen', async () => {
    gelesen = { notifyEinsaetze: false };
    render(<NotificationSettings />);
    await waitFor(() => expect(screen.getByRole('switch', { name: SCHALTER })).not.toBeChecked());
    await userEvent.click(screen.getByRole('switch', { name: /Zeiterfassung/ }));
    await waitFor(() => expect(savePrefs).toHaveBeenCalled());
    expect(gespeichert).toMatchObject({ notifyEinsaetze: false, notifyZeiterfassung: false });
  });

  it('Gegenprobe: ohne Einsatzplanung im Betrieb kein Schalter', async () => {
    auth.company = { id: 'perl', modules: { einsatzplanung: false } };
    render(<NotificationSettings />);
    await screen.findByRole('switch', { name: /Zeiterfassung/ });
    expect(screen.queryByRole('switch', { name: SCHALTER })).toBeNull();
  });

  /*
    SEIT V8 (Durchsicht 15.11.2026) gehören Termine zum Plan: Teilnehmer kann
    jede Rolle sein, und die Meldung kommt mit derselben Vorgabe. Der
    Schalter steht deshalb für jeden da, solange die Einsatzplanung an ist —
    vorher nur für Eingeplante (dann hätte die Geschäftsführung Meldungen zu
    ihren Terminen bekommen, ohne sie abschalten zu können).
  */
  it('V8: auch wer nicht eingeplant wird (Geschäftsführung), sieht ihn — wegen der Termine', async () => {
    auth.user = { ...auth.user, role: 'Geschäftsführung' };
    render(<NotificationSettings />);
    expect(await screen.findByRole('switch', { name: SCHALTER })).toBeChecked();
  });

  it('V8: die Projektleitung ebenso, unabhängig vom Einsatzplan', async () => {
    auth.user = { ...auth.user, role: 'Projektleiter' };
    render(<NotificationSettings />);
    expect(await screen.findByRole('switch', { name: SCHALTER })).toBeChecked();
  });
});

/*
  V8: NOTFALL IM AUFTRAGSEINGANG — der Schalter für die Führung, ab Werk an,
  gespeichert wie die übrigen. Gegenprobe: vorher gab es ihn nicht.
*/
describe('Mein Konto — Notfall im Auftragseingang (V8)', () => {
  const NOTFALL = 'Notfall im Auftragseingang';

  it('die Führung sieht ihn (ab Werk an) und schaltet ihn ab', async () => {
    auth.user = { ...auth.user, role: 'Geschäftsführung' };
    render(<NotificationSettings />);
    const schalter = await screen.findByRole('switch', { name: NOTFALL });
    expect(schalter).toBeChecked();
    await userEvent.click(schalter);
    await waitFor(() => expect(savePrefs).toHaveBeenCalled());
    expect(gespeichert).toMatchObject({ notifyNotfall: false });
  });

  it('bleibt gleich: der Monteur bekommt keinen; ohne Auftragseingang auch die Führung nicht', async () => {
    auth.user = { ...auth.user, role: 'Mitarbeiter' };
    const { unmount } = render(<NotificationSettings />);
    await screen.findByRole('switch', { name: /Zeiterfassung/ });
    expect(screen.queryByRole('switch', { name: NOTFALL })).toBeNull();
    unmount();
    auth.user = { ...auth.user, role: 'Geschäftsführung' };
    auth.company = { id: 'perl', modules: { 'baustellen.auftragseingang': false } };
    render(<NotificationSettings />);
    await screen.findByRole('switch', { name: /Zeiterfassung/ });
    expect(screen.queryByRole('switch', { name: NOTFALL })).toBeNull();
  });
});
