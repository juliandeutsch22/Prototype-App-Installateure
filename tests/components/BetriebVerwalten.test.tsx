import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlattformBetrieb } from '@/lib/db/plattform';

/**
 * Nachtest 01.10.2026, Paket D: die Maske zeigt den Weg — aktiv →
 * deaktiviert → Übergabe → Löschung geplant → nach der Frist löschen — und
 * nur den jeweils nächsten Schritt. Ob er erlaubt ist, entscheidet die
 * Datenbank (`tests/supabase/betriebeDeaktivierenLoeschen.test.ts`).
 */

const db = {
  betriebDeaktivieren: vi.fn(async () => undefined),
  betriebAktivieren: vi.fn(async () => undefined),
  testbetriebSetzen: vi.fn(async () => undefined),
  loeschungPlanen: vi.fn(async () => '2026-11-01T10:00:00Z'),
  loeschungAbbrechen: vi.fn(async () => undefined),
  betriebProtokoll: vi.fn(async () => []),
  betriebUebergabe: vi.fn(async () => ({ zeilen: 120, dateien: 3, datenLink: 'https://x/daten', dateienLink: 'https://x/dateien', gueltigBis: '2026-10-09T10:00:00Z' })),
  betriebLoeschen: vi.fn(async () => ({ zeilen: 120, dateien: 3, konten: 2, kontenOffen: [] })),
};
vi.mock('@/lib/db/plattform', () => db);

const { default: BetriebVerwalten } = await import('@/features/plattform/BetriebVerwalten');

const basis: PlattformBetrieb = {
  kennung: 'senklot-test', name: 'Senklot Testbetrieb GmbH', angelegtAm: '2026-09-01T08:00:00Z',
  leitungskonten: 1, leitungMitMail: 0, notzugangBis: null, testbetrieb: false,
  deaktiviertAm: null, deaktiviertGrund: null, exportAm: null, loeschungGeplantFuer: null,
};

const zeige = (b: Partial<PlattformBetrieb>, geaendert = vi.fn()) =>
  render(<BetriebVerwalten betrieb={{ ...basis, ...b }} geaendert={geaendert} />);

beforeEach(() => {
  for (const f of Object.values(db)) f.mockClear();
});

describe('Betrieb verwalten', () => {
  it('aktiv: deaktivieren nur mit Grund, sonst kein Weg zum Löschen', async () => {
    const nutzer = userEvent.setup();
    const geaendert = vi.fn();
    zeige({}, geaendert);
    const knopf = screen.getByRole('button', { name: 'Deaktivieren' });
    expect(knopf).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Löschung planen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übergabe erstellen' })).not.toBeInTheDocument();

    await nutzer.type(screen.getByLabelText(/Grund/), 'Kündigung zum 31.10.');
    await nutzer.click(knopf);
    expect(db.betriebDeaktivieren).toHaveBeenCalledWith('senklot-test', 'Kündigung zum 31.10.');
    expect(geaendert).toHaveBeenCalled();
    expect(await screen.findByText(/Alle Konten sind gesperrt/)).toBeInTheDocument();
  });

  it('deaktiviert ohne Übergabe: Löschung planen ist gesperrt und sagt warum', async () => {
    const nutzer = userEvent.setup();
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z', deaktiviertGrund: 'Kündigung' });
    await nutzer.type(screen.getByLabelText(/Grund/), 'Antrag vom 01.10.');
    expect(screen.getByRole('button', { name: 'Löschung planen' })).toBeDisabled();
    expect(screen.getByText(/Vorher braucht der Betrieb seine Übergabe/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wieder aktivieren' })).toBeEnabled();
  });

  it('die Übergabe zeigt ihre Links und wie lange sie gelten', async () => {
    const nutzer = userEvent.setup();
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z' });
    await nutzer.type(screen.getByLabelText(/Grund/), 'Übergabe vor Löschung');
    await nutzer.click(screen.getByRole('button', { name: 'Übergabe erstellen' }));
    expect(db.betriebUebergabe).toHaveBeenCalledWith('senklot-test', 'Übergabe vor Löschung');
    expect(await screen.findByRole('link', { name: /Daten/ })).toHaveAttribute('href', 'https://x/daten');
    expect(screen.getByRole('link', { name: /Verzeichnis der Dateien/ })).toHaveAttribute('href', 'https://x/dateien');
    expect(screen.getByText(/Gültig bis/)).toBeInTheDocument();
  });

  it('mit Übergabe: planen mit Frist (vorgeschlagen 30 Tage)', async () => {
    const nutzer = userEvent.setup();
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z', exportAm: '2026-10-01T09:00:00Z' });
    expect(screen.getByLabelText('Frist (Tage)')).toHaveValue(30);
    await nutzer.type(screen.getByLabelText(/Grund/), 'Antrag vom 01.10.');
    await nutzer.click(screen.getByRole('button', { name: 'Löschung planen' }));
    expect(db.loeschungPlanen).toHaveBeenCalledWith('senklot-test', 'Antrag vom 01.10.', 30);
  });

  it('ein Testbetrieb: ohne Übergabe, Frist ab 0 Tagen', () => {
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z', testbetrieb: true });
    expect(screen.getByLabelText('Frist (Tage)')).toHaveValue(0);
    expect(screen.queryByText(/Vorher braucht der Betrieb seine Übergabe/)).not.toBeInTheDocument();
  });

  it('geplant, Frist läuft: abbrechen ja, löschen nein', () => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString();
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z', exportAm: '2026-10-01T09:00:00Z', loeschungGeplantFuer: morgen });
    expect(screen.getByRole('button', { name: 'Löschung abbrechen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Endgültig löschen' })).not.toBeInTheDocument();
    expect(screen.getByText(/Vor Ablauf der Frist/)).toBeInTheDocument();
  });

  it('nach der Frist: löschen erst mit genau eingetippter Kennung und Grund', async () => {
    const nutzer = userEvent.setup();
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z', exportAm: '2026-10-01T09:00:00Z', loeschungGeplantFuer: '2026-10-01T10:00:00Z' });
    const loeschen = screen.getByRole('button', { name: 'Endgültig löschen' });
    await nutzer.type(screen.getByLabelText(/Grund/), 'Löschung laut Antrag');
    await nutzer.type(screen.getByLabelText(/Kennung eintippen/), 'senklot-tes');
    expect(loeschen).toBeDisabled();
    await nutzer.type(screen.getByLabelText(/Kennung eintippen/), 't');
    expect(loeschen).toBeEnabled();
    await nutzer.click(loeschen);
    expect(db.betriebLoeschen).toHaveBeenCalledWith('senklot-test', 'senklot-test', 'Löschung laut Antrag');
    expect(await screen.findByText(/Gelöscht: 120 Zeilen, 3 Dateien, 2 Anmeldekonten/)).toBeInTheDocument();
  });

  it('eine Ablehnung der Datenbank steht in der Maske, wörtlich', async () => {
    const nutzer = userEvent.setup();
    db.betriebDeaktivieren.mockRejectedValueOnce(new Error('Das darf nur die Plattform'));
    zeige({});
    await nutzer.type(screen.getByLabelText(/Grund/), 'x');
    await nutzer.click(screen.getByRole('button', { name: 'Deaktivieren' }));
    expect(await screen.findByText('Das darf nur die Plattform')).toBeInTheDocument();
  });
});
