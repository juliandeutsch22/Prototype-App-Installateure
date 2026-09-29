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
const loeschen = vi.fn();
vi.mock('@/lib/db/auskunft', () => ({
  personAuskunft: (...a: unknown[]) => holen(...a),
  personLoeschen: (...a: unknown[]) => loeschen(...a),
}));

const geloescht = vi.fn();
const zeichne = () =>
  render(
    <ToastProvider>
      <Datenauskunft art="kunde" id="k-1" onGeloescht={geloescht} />
    </ToastProvider>,
  );

beforeEach(() => {
  holen.mockReset();
  loeschen.mockReset();
  geloescht.mockReset();
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

describe('Das Löschen', () => {
  const bericht = (geloescht: boolean, ganz = false) => ({
    art: 'kunde', person: 'Familie Huber', geloescht, ganz,
    hinweis: 'Der Kunde bleibt inaktiv.',
    sofort: { wartungen: 1, kontaktdaten: 0 },
    aufbewahren: [{ was: 'Rechnungen samt Zahlungen', anzahl: 3, bis: '2033-12-31', grund: '§ 132 BAO' }],
  });

  it('zeigt erst den Probelauf — was geht, was bis wann bleibt — und löscht erst danach', async () => {
    loeschen.mockImplementation((_a: string, _id: string, nurPruefen: boolean) =>
      Promise.resolve(bericht(!nurPruefen)));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen …' }));

    const dialog = await screen.findByRole('dialog');
    expect(loeschen).toHaveBeenCalledWith('kunde', 'k-1', true);
    expect(dialog).toHaveTextContent('Wartungen: 1');
    // Was null Einträge hat, steht nicht in der Liste.
    expect(dialog).not.toHaveTextContent('Kontaktdaten');
    expect(dialog).toHaveTextContent('Rechnungen samt Zahlungen: 3, bis 31.12.2033');
    expect(geloescht).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt löschen' }));
    await waitFor(() => expect(geloescht).toHaveBeenCalledWith(false));
    expect(loeschen).toHaveBeenLastCalledWith('kunde', 'k-1', false);
  });

  it('ein Kunde ohne Belege geht ganz — die Akte erfährt es', async () => {
    loeschen.mockImplementation((_a: string, _id: string, nurPruefen: boolean) =>
      Promise.resolve({ ...bericht(!nurPruefen, true), aufbewahren: [] }));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('ganz gelöscht');
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt löschen' }));
    await waitFor(() => expect(geloescht).toHaveBeenCalledWith(true));
  });

  it('nennt die Absage der Datenbank, statt einen Dialog zu öffnen', async () => {
    loeschen.mockRejectedValue(new Error('Zuerst das Konto deaktivieren'));
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen …' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Zuerst das Konto deaktivieren');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Der Dateiname', () => {
  it('nimmt Umlaute mit und lässt, was ein Dateisystem stört, weg', () => {
    expect(auskunftDateiname('Jürgen Öztürk / Bau: GmbH', '2026-09-29T08:00:00Z'))
      .toBe('datenauskunft-Jürgen-Öztürk-Bau-GmbH-2026-09-29.json');
    expect(auskunftDateiname('  ', '2026-09-29')).toBe('datenauskunft-person-2026-09-29.json');
  });
});
