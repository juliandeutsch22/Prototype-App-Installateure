import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { InvoiceRates } from '@/types';

/**
 * Der Basiszinssatz, zentral gepflegt (seit 05.10.2026): die Karte des
 * Betreibers und die Karte des Betriebs in den Rechnungsvorgaben.
 */

let zentral: Array<{ ab: string; satz: number }> = [];
const setzen = vi.fn(async (ab: string, satz: number) => {
  zentral = [...zentral.filter((b) => b.ab !== ab), { ab, satz }].sort((a, b) => a.ab.localeCompare(b.ab));
});
const entfernen = vi.fn(async (ab: string) => {
  zentral = zentral.filter((b) => b.ab !== ab);
});
vi.mock('@/lib/db/basiszins', () => ({
  listBasiszinssaetze: vi.fn(async () => zentral),
  basiszinssatzSetzen: (ab: string, satz: number) => setzen(ab, satz),
  basiszinssatzEntfernen: (ab: string) => entfernen(ab),
}));

const { default: BasiszinsZentral } = await import('@/features/plattform/BasiszinsZentral');
const { default: BasiszinsVerlauf } = await import('@/features/settings/BasiszinsVerlauf');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T10:00:00'));
  zentral = [];
  setzen.mockClear();
  entfernen.mockClear();
});

describe('Basiszinssatz beim Betreiber', () => {
  it('trägt einen Satz ein und zeigt ihn danach in der Liste', async () => {
    const nutzer = userEvent.setup();
    render(<BasiszinsZentral />);
    expect(await screen.findByText(/es gelten die Einträge der Betriebe/)).toBeInTheDocument();
    expect(screen.getByText(/Für das laufende Halbjahr .* ist zentral kein Satz hinterlegt/)).toBeInTheDocument();

    await nutzer.selectOptions(screen.getByLabelText('Halbjahr ab'), '2026-07-01');
    await nutzer.type(screen.getByLabelText('Basiszinssatz (%)'), '1,53');
    await nutzer.click(screen.getByRole('button', { name: 'Satz eintragen' }));

    await waitFor(() => expect(setzen).toHaveBeenCalledWith('2026-07-01', 1.53));
    expect(await screen.findByText('1,53 %')).toBeInTheDocument();
    expect(screen.queryByText(/ist zentral kein Satz hinterlegt/)).not.toBeInTheDocument();
  });

  it('entfernt einen Satz', async () => {
    const nutzer = userEvent.setup();
    zentral = [{ ab: '2026-07-01', satz: 1.53 }];
    render(<BasiszinsZentral />);
    await nutzer.click(await screen.findByRole('button', { name: 'Basiszinssatz ab 01.07.2026 entfernen' }));
    await waitFor(() => expect(entfernen).toHaveBeenCalledWith('2026-07-01'));
    expect(await screen.findByText(/es gelten die Einträge der Betriebe/)).toBeInTheDocument();
  });

  it('zeigt die Ablehnung der Datenbank', async () => {
    const nutzer = userEvent.setup();
    setzen.mockRejectedValueOnce(new Error('Den Basiszinssatz pflegt der Betreiber'));
    render(<BasiszinsZentral />);
    await screen.findByText(/es gelten die Einträge der Betriebe/);
    await nutzer.type(screen.getByLabelText('Basiszinssatz (%)'), '1');
    await nutzer.click(screen.getByRole('button', { name: 'Satz eintragen' }));
    expect(await screen.findByText('Den Basiszinssatz pflegt der Betreiber')).toBeInTheDocument();
  });
});

/** Die Karte des Betriebs mit echtem Zustand, wie in den Einstellungen. */
function Betrieb({ start, gemerkt }: { start: InvoiceRates; gemerkt: (r: InvoiceRates) => void }) {
  const [rates, setRates] = useState<InvoiceRates>(start);
  return (
    <BasiszinsVerlauf
      rates={rates}
      setRates={(r) => {
        setRates(r);
        gemerkt(r);
      }}
    />
  );
}

describe('Basiszinssatz im Betrieb', () => {
  it('zeigt zentrale Sätze ohne Knopf und bietet ihr Halbjahr nicht zur Eingabe an', async () => {
    zentral = [{ ab: '2026-07-01', satz: 1.53 }];
    render(<Betrieb start={{ dueDays: 14 } as InvoiceRates} gemerkt={() => undefined} />);
    expect(await screen.findByText('zentral')).toBeInTheDocument();
    expect(screen.getByText('1,53 %')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Basiszinssatz ab 01.07.2026 entfernen' })).not.toBeInTheDocument();
    const halbjahre = [...(screen.getByLabelText('Halbjahr ab') as HTMLSelectElement).options].map((o) => o.value);
    expect(halbjahre).not.toContain('2026-07-01');
    expect(halbjahre).toContain('2026-01-01');
    // Das laufende Halbjahr ist gedeckt — keine Warnung.
    expect(screen.queryByText(/ist kein Satz eingetragen/)).not.toBeInTheDocument();
  });

  it('speichert nur die eigenen Einträge, nie die zentralen', async () => {
    const nutzer = userEvent.setup();
    zentral = [{ ab: '2026-07-01', satz: 1.53 }];
    const gemerkt = vi.fn();
    render(<Betrieb start={{ dueDays: 14 } as InvoiceRates} gemerkt={gemerkt} />);
    await screen.findByText('zentral');
    await nutzer.selectOptions(screen.getByLabelText('Halbjahr ab'), '2025-01-01');
    await nutzer.type(screen.getByLabelText('Basiszinssatz (%)'), '2,58');
    await nutzer.click(screen.getByRole('button', { name: 'Satz eintragen' }));
    expect(gemerkt).toHaveBeenLastCalledWith(expect.objectContaining({
      basiszinssaetze: [{ ab: '2025-01-01', satz: 2.58 }],
    }));
  });

  it('Gegenprobe: ohne zentrale Sätze bleibt die Karte, wie sie war', async () => {
    render(<Betrieb start={{ dueDays: 14, basiszinssaetze: [{ ab: '2020-01-01', satz: -0.88 }] } as InvoiceRates} gemerkt={() => undefined} />);
    expect(await screen.findByText(/Für das laufende Halbjahr .* ist kein Satz eingetragen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Basiszinssatz ab 01.01.2020 entfernen' })).toBeInTheDocument();
    expect(screen.queryByText('zentral')).not.toBeInTheDocument();
    const halbjahre = [...(screen.getByLabelText('Halbjahr ab') as HTMLSelectElement).options].map((o) => o.value);
    expect(halbjahre).toContain('2026-07-01');
  });
});
