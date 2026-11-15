import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ZusammenfuehrenVorschau } from '@/lib/db/customers';
import { kundenAttrappe, kundeWaehlen } from './kundenAuswahl';

/**
 * Kunden zusammenführen aus der Kundenakte (Durchsicht 15.11.2026, F9).
 *
 * Vorher gab es diesen Weg nicht: eine Dublette mit Belegen blieb stehen.
 * Geprüft wird der ganze Weg im Fenster — doppelten Kunden wählen, wer
 * bleibt, Vorschau, Stammfelder, Zusammenführen — und dass ein veralteter
 * Stand nichts zusammenführt, sondern neu zeigt.
 */

const DIESER = { id: 'k1', companyId: 'b', name: 'Maier GmbH', address: 'Hauptstraße 1, 1010 Wien', kundennummer: 'K-1', active: true };
const DOPPELT = { id: 'k2', companyId: 'b', name: 'Meier GmbH', address: 'Hauptstraße 1, 1010 Wien', kundennummer: 'K-2', email: 'office@meier.at', active: true };

const ZAHLEN = {
  baustellen: 3, angebote: 1, rechnungen: 2, scheine: 0, wartungen: 0, termine: 0, eingaenge: 0,
  beteiligungen: 0, uidPruefungen: 0, verlauf: 5, beteiligungenDoppelt: 0,
};
const NAMEN = { baustellen: 0, angebote: 0, rechnungen: 0, scheine: 0, wartungen: 0 };

function vorschau(bleibt: typeof DIESER, geht: typeof DIESER, rest: Partial<ZusammenfuehrenVorschau> = {}): ZusammenfuehrenVorschau {
  return { bleibt, geht, zahlen: ZAHLEN, ueberNamen: NAMEN, nameEindeutig: true, stand: 's1', ...rest };
}

const vorschauHolen = vi.fn(async (b: string, g: string) =>
  b === 'k1' ? vorschau(DIESER, DOPPELT, { stand: `s-${b}-${g}` }) : vorschau(DOPPELT, DIESER, { stand: `s-${b}-${g}` }));
const zusammenfuehren = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ art: 'zusammengefuehrt', kunde: 'k1', name: 'Maier GmbH' }));

vi.mock('@/lib/db/customers', () => ({
  ...kundenAttrappe(() => [DIESER, DOPPELT]),
  kundenZusammenfuehrenVorschau: (b: string, g: string) => vorschauHolen(b, g),
  kundenZusammenfuehren: (...a: unknown[]) => zusammenfuehren(...a),
}));

const { default: KundenZusammenfuehren } = await import('@/features/customers/KundenZusammenfuehren');

const onFertig = vi.fn();
const onSchliessen = vi.fn();

function zeigen() {
  return render(
    <MemoryRouter>
      <KundenZusammenfuehren companyId="b" kunde={DIESER} onFertig={onFertig} onSchliessen={onSchliessen} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vorschauHolen.mockClear();
  zusammenfuehren.mockClear();
  onFertig.mockClear();
});

describe('Kunden zusammenführen (F9)', () => {
  it('doppelten Kunden wählen, Vorschau lesen, zusammenführen — der Kunde dieser Akte bleibt', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    const knopf = screen.getByRole('button', { name: 'Zusammenführen' });
    expect(knopf).toBeDisabled();

    await kundeWaehlen(nutzer, 'Meier GmbH', 'Doppelter Kunde');
    expect(await screen.findByText('3 Baustellen')).toBeInTheDocument();
    expect(vorschauHolen).toHaveBeenCalledWith('k1', 'k2');
    expect(screen.getByText('Wandert von „Meier GmbH“ zu „Maier GmbH“')).toBeInTheDocument();
    expect(screen.getByText(/behalten Name und Anschrift/)).toBeInTheDocument();
    expect(screen.getByText(/künftig unter Kundennummer K-1, nicht mehr unter K-2/)).toBeInTheDocument();

    // Die E-Mail hat nur die Dublette — vorbelegt kommt sie mit.
    const mail = screen.getByRole('group', { name: 'E-Mail' });
    expect(within(mail).getByRole('radio', { name: /office@meier.at/ })).toBeChecked();
    // Die Kundennummer der Dublette wählen.
    await nutzer.click(within(screen.getByRole('group', { name: 'Kundennummer' })).getByRole('radio', { name: /K-2/ }));

    await nutzer.click(screen.getByRole('button', { name: 'Zusammenführen' }));
    expect(zusammenfuehren).toHaveBeenCalledWith('k1', 'k2', expect.objectContaining({ email: 'geht', kundennummer: 'geht', name: 'bleibt' }), 's-k1-k2');
    expect(onFertig).toHaveBeenCalledWith('k1', 'Maier GmbH');
  });

  it('„Welcher Kunde bleibt?“ dreht die Richtung — die Vorschau kommt neu', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    await kundeWaehlen(nutzer, 'Meier GmbH', 'Doppelter Kunde');
    await screen.findByText('3 Baustellen');
    await nutzer.click(screen.getByRole('radio', { name: /Der gewählte Kunde/ }));
    expect(await screen.findByText('Wandert von „Maier GmbH“ zu „Meier GmbH“')).toBeInTheDocument();
    expect(vorschauHolen).toHaveBeenLastCalledWith('k2', 'k1');
  });

  it('hat sich seit der Vorschau etwas geändert, wird nichts zusammengeführt — die neue Vorschau steht da', async () => {
    zusammenfuehren.mockResolvedValueOnce({
      art: 'veraltet', vorschau: vorschau(DIESER, DOPPELT, { zahlen: { ...ZAHLEN, baustellen: 4 }, stand: 's2' }),
    });
    const nutzer = userEvent.setup();
    zeigen();
    await kundeWaehlen(nutzer, 'Meier GmbH', 'Doppelter Kunde');
    await screen.findByText('3 Baustellen');
    await nutzer.click(screen.getByRole('button', { name: 'Zusammenführen' }));
    expect(await screen.findByText(/es wurde nichts zusammengeführt/)).toBeInTheDocument();
    expect(screen.getByText('4 Baustellen')).toBeInTheDocument();
    expect(onFertig).not.toHaveBeenCalled();
    // Der zweite Versuch schickt den neuen Stand.
    await nutzer.click(screen.getByRole('button', { name: 'Zusammenführen' }));
    expect(zusammenfuehren).toHaveBeenLastCalledWith('k1', 'k2', expect.any(Object), 's2');
    expect(onFertig).toHaveBeenCalledWith('k1', 'Maier GmbH');
  });

  it('den Kunden dieser Akte mit sich selbst: Hinweis, keine Vorschau, kein Zusammenführen', async () => {
    const nutzer = userEvent.setup();
    zeigen();
    await kundeWaehlen(nutzer, 'Maier GmbH', 'Doppelter Kunde');
    expect(await screen.findByText(/bitte den doppelten wählen/)).toBeInTheDocument();
    expect(vorschauHolen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Zusammenführen' })).toBeDisabled();
  });
});
