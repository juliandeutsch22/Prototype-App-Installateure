/**
 * Das Änderungsprotokoll zum Aufklappen (E50). Auftrag: „über einen Klick
 * sichtbar … nicht generell auf der Seite“. Festgehalten: zu Beginn zu und
 * nicht geladen; ein Klick lädt und zeigt; ein Fehler lässt sich wiederholen;
 * fehlt der Anfang (Altdaten), sagt es das.
 * Gegenprobe: ohne den Baustein gibt es nichts aufzuklappen.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Aenderungsprotokoll from '@/features/time/Aenderungsprotokoll';
import type { VerlaufZeile } from '@/lib/db/zeitbuchungVerlauf';

const am = Date.parse('2026-11-05T13:03:00Z');
const geaendert: VerlaufZeile = {
  eintragId: 'e1', userId: 'u1', datum: '2026-11-02', art: 'geaendert', vonName: 'Erna Beispiel', am,
  aenderungen: { end_time: { alt: '15:00:00', neu: '14:00:00' } },
};

function oeffnen(titel: string) {
  const zeile = screen.getByText(titel);
  const details = zeile.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  return details;
}

describe('Aenderungsprotokoll', () => {
  it('ist zu und lädt nichts, bis jemand aufklappt — dann steht da, wer was geändert hat', async () => {
    const laden = vi.fn(async () => [geaendert]);
    render(<Aenderungsprotokoll titel="Verlauf dieser Buchung" laden={laden} />);
    const details = screen.getByText('Verlauf dieser Buchung').closest('details')!;
    expect(details.open).toBe(false);
    expect(laden).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ende 15:00/)).toBeNull();

    oeffnen('Verlauf dieser Buchung');
    expect(await screen.findByText('Ende 15:00 → 14:00')).toBeInTheDocument();
    expect(screen.getByText('Geändert von Erna Beispiel')).toBeInTheDocument();
    expect(laden).toHaveBeenCalledTimes(1);
    // Ohne Anlegen davor: die Buchung ist älter als das Protokoll.
    expect(screen.getByText(/wurde nichts aufgezeichnet/)).toBeInTheDocument();

    // Zu und wieder auf lädt nicht noch einmal.
    details.open = false;
    fireEvent(details, new Event('toggle'));
    oeffnen('Verlauf dieser Buchung');
    expect(laden).toHaveBeenCalledTimes(1);
  });

  it('über mehrere Buchungen steht der Tag davor; ohne Zeilen der Satz, seit wann aufgezeichnet wird', async () => {
    const { unmount } = render(<Aenderungsprotokoll mitTag titel="Protokoll" laden={async () => [geaendert]} />);
    oeffnen('Protokoll');
    expect(await screen.findByText('Buchung vom 02.11.2026 · Geändert von Erna Beispiel')).toBeInTheDocument();
    unmount();

    render(<Aenderungsprotokoll titel="Leer" laden={async () => []} />);
    oeffnen('Leer');
    expect(await screen.findByText(/Keine Änderung aufgezeichnet. Aufgezeichnet wird seit 05.11.2026/)).toBeInTheDocument();
  });

  it('ein Fehler lässt sich wiederholen — ohne ein umgebendes Formular abzuschicken', async () => {
    const laden = vi.fn<() => Promise<VerlaufZeile[]>>()
      .mockRejectedValueOnce(new Error('kein Netz'))
      .mockResolvedValueOnce([geaendert]);
    const abgeschickt = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={abgeschickt}><Aenderungsprotokoll titel="Verlauf" laden={laden} /></form>);
    oeffnen('Verlauf');
    expect(await screen.findByText(/ließ sich nicht laden/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() => expect(screen.getByText('Ende 15:00 → 14:00')).toBeInTheDocument());
    expect(abgeschickt).not.toHaveBeenCalled();
  });
});
