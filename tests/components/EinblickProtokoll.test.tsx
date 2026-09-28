import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import EinblickProtokoll from '@/components/EinblickProtokoll';
import { bereichVon } from '@/app/navigation';

/**
 * Jeder Bereich, den der Support im Einblick öffnet, steht im Protokoll,
 * bevor er lädt (offene Punkte B4).
 *
 * Geprüft wird die Reihenfolge — erst gemeldet, dann gezeigt — und der
 * Fehlerweg: scheitert die Meldung, bleibt der Bereich zu. Dass die
 * Datenbank ohne Eintrag gar nichts herausgibt, steht in
 * `tests/supabase/supportzugang.test.ts`.
 */

const zugriffMelden = vi.fn();
vi.mock('@/lib/db/support', () => ({
  zugriffMelden: (...a: unknown[]) => zugriffMelden(...a),
}));

let einblick: { id: string; company_id: string } | null = null;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ einblick }) }));

function zeige(start = '/invoices') {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <EinblickProtokoll>
        <Routes>
          <Route path="/invoices" element={<p>Rechnungsliste <Link to="/invoices/r1">Akte</Link> <Link to="/customers">Kunden</Link></p>} />
          <Route path="/invoices/:id" element={<p>Rechnungsakte</p>} />
          <Route path="/customers" element={<p>Kundenliste</p>} />
        </Routes>
      </EinblickProtokoll>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  zugriffMelden.mockReset();
  einblick = { id: 'f1', company_id: 'perl' };
});

describe('Der Bereich steht im Protokoll, bevor er lädt', () => {
  it('meldet zuerst und zeigt dann', async () => {
    let fertig: () => void = () => {};
    zugriffMelden.mockReturnValue(new Promise<void>((r) => { fertig = r; }));
    zeige();
    expect(screen.queryByText(/Rechnungsliste/)).not.toBeInTheDocument();
    expect(zugriffMelden).toHaveBeenCalledWith('perl', 'f1', 'Rechnungen');
    fertig();
    expect(await screen.findByText(/Rechnungsliste/)).toBeInTheDocument();
  });

  it('meldet beim Wechsel des Bereichs, nicht bei jedem Klick darin', async () => {
    zugriffMelden.mockResolvedValue(undefined);
    zeige();
    await userEvent.click(await screen.findByText('Akte'));
    expect(await screen.findByText('Rechnungsakte')).toBeInTheDocument();
    expect(zugriffMelden).toHaveBeenCalledTimes(1);
  });

  it('meldet einen neuen Bereich neu', async () => {
    zugriffMelden.mockResolvedValue(undefined);
    zeige();
    await userEvent.click(await screen.findByText('Kunden'));
    expect(await screen.findByText('Kundenliste')).toBeInTheDocument();
    expect(zugriffMelden.mock.calls.map((c) => c[2])).toEqual(['Rechnungen', 'Kunden']);
  });

  it('lässt den Bereich zu, wenn die Meldung scheitert — und versucht es auf Wunsch neu', async () => {
    zugriffMelden.mockRejectedValueOnce(new Error('Keine Verbindung.')).mockResolvedValue(undefined);
    zeige();
    expect(await screen.findByText(/liess sich nicht protokollieren/)).toBeInTheDocument();
    expect(screen.queryByText(/Rechnungsliste/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() => expect(screen.getByText(/Rechnungsliste/)).toBeInTheDocument());
  });

  it('Gegenprobe: ohne Einblick meldet nichts und zeigt sofort', () => {
    einblick = null;
    zeige();
    expect(screen.getByText(/Rechnungsliste/)).toBeInTheDocument();
    expect(zugriffMelden).not.toHaveBeenCalled();
  });
});

describe('Der Name des Bereichs', () => {
  it('ist der Menüname, auch für Akten, Unterseiten und den einzelnen Schein', () => {
    expect(bereichVon('/')).toBe('Dashboard');
    expect(bereichVon('/invoices')).toBe('Rechnungen');
    expect(bereichVon('/customers/k1')).toBe('Kunden');
    expect(bereichVon('/settings/firma')).toBe('Einstellungen');
    expect(bereichVon('/worksheet')).toBe('Handwerksscheine');
  });
});
