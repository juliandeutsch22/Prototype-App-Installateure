import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import PlattformView from '@/features/plattform/PlattformView';

const api = vi.hoisted(() => ({ anlegen: vi.fn(), oeffnen: vi.fn(), notzugang: vi.fn(), abmelden: vi.fn(), fehler: vi.fn(), freigaben: vi.fn(), weitereBetriebe: [] as unknown[] }));
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ signOut: api.abmelden, einblickStarten: api.oeffnen }) }));
vi.mock('@/lib/db/plattform', () => ({
  betriebAnlegenMitAnmeldung: api.anlegen,
  plattformBetriebe: async () => [
    { kennung: 'alpha', name: 'Alpha Technik', angelegtAm: '2026-09-01T08:00:00Z', leitungskonten: 2, leitungMitMail: 1, notzugangBis: null },
    { kennung: 'beta', name: 'Beta Haustechnik', angelegtAm: '2026-09-02T08:00:00Z', leitungskonten: 1, leitungMitMail: 1, deaktiviertAm: '2026-10-01T08:00:00Z', notzugangBis: null },
    ...api.weitereBetriebe,
  ],
  geloeschteBetriebe: async () => [{ kennung: 'alt', name: 'Alter Betrieb', geloeschtAm: '2026-10-01T08:00:00Z', testbetrieb: true }],
  betriebProtokoll: async () => [],
}));
vi.mock('@/lib/db/support', () => ({ notzugang: api.notzugang, offeneFreigaben: api.freigaben }));
vi.mock('@/lib/db/fehlerprotokoll', () => ({ plattformFehler: api.fehler }));
vi.mock('@/lib/db/basiszins', () => ({ listBasiszinssaetze: async () => [], basiszinssatzSetzen: vi.fn(), basiszinssatzEntfernen: vi.fn() }));
vi.mock('@/lib/auth/sitzung', () => ({ zweiterFaktorStand: async () => ({ angeboten: true, eingerichtet: true, pflicht: true, plattform: true, codesOffen: 8 }), neueCodes: async () => ['DEMO'], passwortSetzen: vi.fn() }));
const zeige = () => render(<ToastProvider><PlattformView /></ToastProvider>);
const bereich = (name: string) => name === 'Mein Konto' ? screen.getByRole('button', { name }) : within(screen.getByRole('navigation', { name: 'Bereiche der Plattform' })).getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  api.weitereBetriebe = [];
  api.anlegen.mockResolvedValue({ companyId: 'neu', passwortLink: 'https://beispiel.invalid/zugang' });
  api.fehler.mockResolvedValue([]);
  api.freigaben.mockResolvedValue([{ id: 'f1', company_id: 'alpha', name: 'Alpha Technik', grund: 'Rückfrage', notzugang: false, stufe: 'mitarbeiten', gilt_bis: '2026-11-01T12:00:00Z' }]);
});

describe('Lot: vollständige Plattformabläufe über Bereichswechsel', () => {
  it('beginnt mit Betrieben und findet auch deaktivierte Betriebe über die Suche', async () => {
    const u = userEvent.setup(); zeige();
    expect(await screen.findByRole('heading', { name: 'Betriebe' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /Name des Betriebs/ })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Deaktiviert' }));
    expect(await screen.findByRole('button', { name: /Beta Haustechnik \(beta\)/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Alpha Technik \(alpha\)/ })).toBeNull();
    await u.type(screen.getByRole('searchbox', { name: 'Betrieb suchen' }), 'alpha');
    expect(screen.getByRole('button', { name: /Alpha Technik \(alpha\)/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alle' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('findet einen Betrieb außerhalb der ersten zwanzig Zeilen ohne Datenverlust', async () => {
    const u = userEvent.setup();
    api.weitereBetriebe = Array.from({ length: 25 }, (_, i) => ({ kennung: `z-${i}`, name: `Zusatzbetrieb ${String(i).padStart(2, '0')}`, angelegtAm: '2026-09-01T08:00:00Z', leitungskonten: 1, leitungMitMail: 1 }));
    zeige();
    await screen.findByRole('button', { name: /und 7 weitere anzeigen/ });
    expect(screen.queryByRole('button', { name: 'Zusatzbetrieb 24 (z-24)' })).toBeNull();
    await u.type(screen.getByRole('searchbox', { name: 'Betrieb suchen' }), 'z-24');
    expect(screen.getByRole('button', { name: 'Zusatzbetrieb 24 (z-24)' })).toBeVisible();
  });

  it('erhält angefangene Eingaben und einmalige Zugangsdaten bei Bereichswechseln', async () => {
    const u = userEvent.setup(); zeige();
    await u.click(screen.getByRole('button', { name: 'Betrieb anlegen' }));
    await u.type(screen.getByLabelText(/Name des Betriebs/), 'Neuer Betrieb');
    await u.click(bereich('Fehlerprotokoll'));
    await u.click(bereich('Betriebe'));
    expect(screen.getByLabelText(/Name des Betriebs/)).toHaveValue('Neuer Betrieb');
    await u.type(screen.getByLabelText(/Erster Administrator/), 'Andrea Muster');
    await u.type(screen.getByLabelText(/Dessen E-Mail/), 'andrea@beispiel.invalid');
    await u.click(screen.getByRole('button', { name: 'Betrieb anlegen' }));
    expect(await screen.findByRole('link', { name: 'https://beispiel.invalid/zugang' })).toBeVisible();
    await u.click(bereich('Mein Konto'));
    await u.click(bereich('Betriebe'));
    expect(screen.getByRole('link', { name: 'https://beispiel.invalid/zugang' })).toBeVisible();
    await u.click(screen.getByRole('button', { name: 'Zu den Betrieben' }));
    await u.click(screen.getByRole('button', { name: /In dieser Sitzung angelegt/ }));
    expect(screen.getByRole('link', { name: 'https://beispiel.invalid/zugang' })).toBeVisible();
    expect(api.anlegen).toHaveBeenCalledTimes(1);
  });

  it('führt den gewählten Betrieb in den Notzugang und erhält Grund und Dauer', async () => {
    const u = userEvent.setup(); zeige();
    await u.click(await screen.findByRole('button', { name: 'Alpha Technik für den Notzugang wählen' }));
    expect(screen.getByLabelText(/^Betrieb$/)).toHaveValue('alpha');
    await u.type(screen.getByLabelText('Grund'), 'Betrieb ausgesperrt');
    await u.clear(screen.getByLabelText('Stunden (1–24)'));
    await u.type(screen.getByLabelText('Stunden (1–24)'), '3');
    await u.click(bereich('Betriebe')); await u.click(bereich('Supportzugänge'));
    await u.click(screen.getByRole('button', { name: 'Notzugang öffnen' }));
    expect(api.notzugang).toHaveBeenCalledWith('alpha', 'Betrieb ausgesperrt', 3);
  });

  it('öffnet weiterhin exakt die gewährte Freigabe mit ihrer Stufe', async () => {
    const u = userEvent.setup(); zeige(); await u.click(bereich('Supportzugänge'));
    await u.click(await screen.findByRole('button', { name: 'Öffnen' }));
    expect(api.oeffnen).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1', company_id: 'alpha', stufe: 'mitarbeiten' }));
    expect(api.notzugang).not.toHaveBeenCalled();
  });

  it('unterscheidet einen fehlgeschlagenen Supportabruf von einer leeren Freigabe und lädt erneut', async () => {
    const u = userEvent.setup();
    api.freigaben.mockRejectedValueOnce(new Error('Supportverbindung unterbrochen'));
    zeige();
    const kontext = within(screen.getByRole('complementary', { name: 'Freigegebener Einblick' }));
    expect(await kontext.findByText('Supportverbindung unterbrochen')).toBeVisible();
    expect(kontext.queryByText('Kein Betrieb gewährt gerade Einblick.')).toBeNull();
    await u.click(kontext.getByRole('button', { name: /Erneut/ }));
    expect(await kontext.findByRole('heading', { name: 'Alpha Technik' })).toBeVisible();
  });

  it('hält Löschprotokoll, eigenes Konto und verpflichtenden Faktor erreichbar', async () => {
    const u = userEvent.setup(); zeige();
    await u.click(await screen.findByRole('button', { name: /Löschprotokoll/ }));
    expect(await screen.findByText(/Alter Betrieb/)).toBeVisible();
    await u.click(bereich('Mein Konto'));
    expect(await screen.findByText('Für das Plattformkonto ist sie Pflicht.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ausschalten' })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(api.abmelden).toHaveBeenCalledTimes(1);
  });
});
