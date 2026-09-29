import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/Toast';
import Datenauskunft from '@/features/recht/Datenauskunft';
import { auskunftDateiname, zeigtAuskunft } from '@/features/recht/auskunftDatei';

/**
 * Die Karte „Datenauskunft" in Benutzer- und Kundenakte (DSGVO Art. 15,
 * offene Punkte B8). Was hineingehört, prüft `tests/supabase/datenauskunft.test.ts`
 * gegen die Datenbank; hier: wer den Knopf sieht, dass er die richtige
 * Person holt und als Datei speichert, und dass eine Absage lesbar ankommt.
 */

let auth: { user: { role: string } | null; einblick: unknown } = { user: null, einblick: null };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => auth }));

const holen = vi.fn();
vi.mock('@/lib/db/auskunft', () => ({ personAuskunft: (...a: unknown[]) => holen(...a) }));

const zeichne = () =>
  render(
    <ToastProvider>
      <Datenauskunft art="kunde" id="k-1" />
    </ToastProvider>,
  );

beforeEach(() => {
  holen.mockReset();
  auth = { user: { role: 'Geschäftsführung' }, einblick: null };
});

describe('Wer die Auskunft holt', () => {
  it('die Geschäftsführung und die Administration', () => {
    expect(zeigtAuskunft('Geschäftsführung', false)).toBe(true);
    expect(zeigtAuskunft('Administrator', false)).toBe(true);
  });

  it('sonst niemand — und im Supporteinblick auch die Administration nicht', () => {
    for (const r of ['Buchhaltung', 'Verwaltung', 'Projektleiter', 'Mitarbeiter'] as const) {
      expect(zeigtAuskunft(r, false)).toBe(false);
    }
    expect(zeigtAuskunft('Administrator', true)).toBe(false);
    expect(zeigtAuskunft(undefined, false)).toBe(false);
  });

  it('die Karte fehlt, wo der Knopf nur abgewiesen würde', () => {
    auth = { user: { role: 'Buchhaltung' }, einblick: null };
    const { container } = zeichne();
    expect(container.textContent).not.toContain('Auskunft herunterladen');
  });
});

describe('Der Knopf', () => {
  it('holt die Auskunft dieser Person und speichert sie als Datei', async () => {
    holen.mockResolvedValue({ person: 'Familie Huber', erstellt_am: '2026-09-29T10:00:00Z', daten: {} });
    const url = vi.fn(() => 'blob:auskunft');
    const frei = vi.fn();
    Object.assign(URL, { createObjectURL: url, revokeObjectURL: frei });
    const klick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Auskunft herunterladen' }));

    await waitFor(() => expect(klick).toHaveBeenCalled());
    expect(holen).toHaveBeenCalledWith('kunde', 'k-1');
    const a = klick.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(a.download).toBe('datenauskunft-Familie-Huber-2026-09-29.json');
    expect(frei).toHaveBeenCalledWith('blob:auskunft');
    klick.mockRestore();
  });

  it('zeigt die Absage der Datenbank, wie sie ist', async () => {
    holen.mockRejectedValue(new Error('Die Auskunft ist mit 9 MB zu groß für den Abruf in der App.'));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Auskunft herunterladen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('9 MB zu groß');
  });
});

describe('Der Dateiname', () => {
  it('nimmt Umlaute mit und lässt, was ein Dateisystem stört, weg', () => {
    expect(auskunftDateiname('Jürgen Öztürk / Bau: GmbH', '2026-09-29T08:00:00Z'))
      .toBe('datenauskunft-Jürgen-Öztürk-Bau-GmbH-2026-09-29.json');
    expect(auskunftDateiname('  ', '2026-09-29')).toBe('datenauskunft-person-2026-09-29.json');
  });
});
