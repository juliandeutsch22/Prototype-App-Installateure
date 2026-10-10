import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlattformBetrieb, Uebergabe } from '@/lib/db/plattform';

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
  betriebUebergabe: vi.fn(async (): Promise<Uebergabe> => ({ zeilen: 120, dateien: 3, datenLink: 'https://x/daten', dateienLink: 'https://x/dateien', gueltigBis: '2026-10-09T10:00:00Z' })),
  betriebLoeschen: vi.fn(async () => ({ zeilen: 120, dateien: 3, konten: 2, kontenOffen: [] })),
};
vi.mock('@/lib/db/plattform', () => db);

const { default: BetriebVerwalten } = await import('@/features/plattform/BetriebVerwalten');

const basis: PlattformBetrieb = {
  kennung: 'senklot-test', name: 'Senklot Testbetrieb GmbH', angelegtAm: '2026-09-01T08:00:00Z',
  leitungskonten: 1, leitungMitMail: 0, notzugangBis: null, testbetrieb: false,
  deaktiviertAm: null, deaktiviertGrund: null, exportAm: null, loeschungGeplantFuer: null,
  echteDaten: null,
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

  it('ein grosser Betrieb: jeder Teil des Stands mit seinem Link, der erste vorn', async () => {
    db.betriebUebergabe.mockResolvedValueOnce({
      zeilen: 9000, dateien: 3, datenLink: 'https://x/teil-1', dateienLink: 'https://x/dateien',
      datenLinks: ['https://x/teil-1', 'https://x/teil-2'], gueltigBis: '2026-10-09T10:00:00Z',
    });
    const nutzer = userEvent.setup();
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z' });
    await nutzer.type(screen.getByLabelText(/Grund/), 'Übergabe vor Löschung');
    await nutzer.click(screen.getByRole('button', { name: 'Übergabe erstellen' }));
    const teile = await screen.findAllByRole('link', { name: /^Daten/ });
    expect(teile.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Daten (JSON-Zeilen), Teil 1 von 2', 'https://x/teil-1'],
      ['Daten (JSON-Zeilen), Teil 2 von 2', 'https://x/teil-2'],
    ]);
  });

  it('ein Stand in einem Teil zeigt wie bisher einen Link ohne Teilangabe', async () => {
    db.betriebUebergabe.mockResolvedValueOnce({
      zeilen: 120, dateien: 3, datenLink: 'https://x/daten', dateienLink: 'https://x/dateien',
      datenLinks: ['https://x/daten'], gueltigBis: '2026-10-09T10:00:00Z',
    });
    const nutzer = userEvent.setup();
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z' });
    await nutzer.type(screen.getByLabelText(/Grund/), 'Übergabe vor Löschung');
    await nutzer.click(screen.getByRole('button', { name: 'Übergabe erstellen' }));
    const teile = await screen.findAllByRole('link', { name: /^Daten/ });
    expect(teile.map((l) => l.textContent)).toEqual(['Daten (JSON-Zeilen)']);
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

  it('Runde 3, H1: ein Betrieb mit echten Daten bekommt keinen Knopf „Als Testbetrieb kennzeichnen“', () => {
    zeige({ echteDaten: 'er hat Rechnungen' });
    expect(screen.queryByRole('button', { name: 'Als Testbetrieb kennzeichnen' })).not.toBeInTheDocument();
    expect(screen.getByText(/Kein Testbetrieb: er hat Rechnungen/)).toBeInTheDocument();
  });

  it('Gegenprobe H1: ohne echte Daten bleibt der Knopf, „Kein Testbetrieb“ immer', () => {
    const { unmount } = zeige({});
    expect(screen.getByRole('button', { name: 'Als Testbetrieb kennzeichnen' })).toBeInTheDocument();
    unmount();
    zeige({ testbetrieb: true, echteDaten: 'er hat Rechnungen' });
    expect(screen.getByRole('button', { name: 'Kein Testbetrieb' })).toBeInTheDocument();
  });

  it('Runde 3, G13: solange der Grund fehlt, sagt die Maske es', async () => {
    const nutzer = userEvent.setup();
    zeige({ deaktiviertAm: '2026-10-01T08:00:00Z', exportAm: '2026-10-01T09:00:00Z', loeschungGeplantFuer: '2026-10-01T10:00:00Z' });
    expect(screen.getByText('Für jeden Schritt zuerst oben einen Grund eintragen.')).toBeInTheDocument();
    expect(screen.getByText(/Zum Löschen oben einen Grund eintragen und die Kennung/)).toBeInTheDocument();
    await nutzer.type(screen.getByLabelText(/Grund/), 'Antrag');
    expect(screen.queryByText('Für jeden Schritt zuerst oben einen Grund eintragen.')).not.toBeInTheDocument();
    expect(screen.getByText('Zum Löschen die Kennung genau eintippen.')).toBeInTheDocument();
  });

  it('Runde 3, G12: läuft die Frist ab, erscheint „Endgültig löschen“ ohne Neuladen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const gleich = new Date(Date.now() + 2_000).toISOString();
      zeige({ deaktiviertAm: '2026-10-01T08:00:00Z', testbetrieb: true, loeschungGeplantFuer: gleich });
      expect(screen.queryByRole('button', { name: 'Endgültig löschen' })).not.toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(screen.getByRole('button', { name: 'Endgültig löschen' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

describe('Das Protokoll als Lot (Linie „Lot“)', () => {
  it('zeigt die Schritte von alt nach neu, den jüngsten als „jetzt“', async () => {
    // Die Datenbank liefert den jüngsten zuerst (`order by am desc`).
    db.betriebProtokoll.mockResolvedValueOnce([
      { am: '2026-10-02T08:00:00Z', aktion: 'deaktiviert', grund: 'Kündigung' },
      { am: '2026-09-20T08:00:00Z', aktion: 'testbetrieb', grund: null },
    ] as never);
    zeige({});
    const lot = await screen.findByRole('list', { name: 'Protokoll Senklot Testbetrieb GmbH' });
    const punkte = within(lot).getAllByRole('listitem');
    expect(punkte.map((p) => p.querySelector('.lot-titel')?.textContent)).toEqual([
      'Testbetrieb geändert', 'Deaktiviert',
    ]);
    expect(punkte[1]).toHaveAttribute('aria-current', 'step');
    expect(punkte[0]).not.toHaveAttribute('aria-current');
    expect(within(punkte[1]).getByText('Kündigung')).toBeInTheDocument();
  });
});
