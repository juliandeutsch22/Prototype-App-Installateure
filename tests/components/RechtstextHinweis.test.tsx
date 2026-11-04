import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RechtstextHinweis from '@/features/recht/RechtstextHinweis';
import { LEERER_BETREIBER, type GeltendeTexte } from '@/features/recht/rechtstext';
import type { VerarbeiterAenderung } from '@/lib/db/rechtstexte';

/**
 * Der Hinweis auf geänderte Rechtstexte in der App (E45):
 * - die Leitung eines Betriebs erfährt von neuen Unterauftragsverarbeitern
 *   und nimmt sie zur Kenntnis (Art. 28 Abs. 2 DSGVO);
 * - alle, die die App benutzen, sehen einmal „Die Datenschutzerklärung wurde
 *   … geändert“, wenn der Betreiber das beim Veröffentlichen gewählt hat.
 */

let user: Record<string, unknown> | null = null;
let einblick: unknown = null;
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user, einblick }) }));

const aktuell = vi.fn<() => Promise<GeltendeTexte>>();
const aenderungen = vi.fn<() => Promise<VerarbeiterAenderung[]>>();
const kenntnis = vi.fn<() => Promise<void>>();
vi.mock('@/lib/db/rechtstexte', () => ({
  rechtstexteAktuell: () => aktuell(),
  verarbeiterAenderungen: () => aenderungen(),
  verarbeiterZurKenntnisNehmen: () => kenntnis(),
}));

const GEAENDERT = '2026-11-04T16:00:00+00:00';
const texte = (hinweisen: boolean, nummer = 2): GeltendeTexte => ({
  betreiber: { nummer: 2, inhalt: { ...LEERER_BETREIBER, email: 'office@senklot.test' }, veroeffentlichtAm: GEAENDERT, geprueft: false, hinweisen: false, neueVerarbeiter: [] },
  datenschutz: { nummer, inhalt: { abschnitte: [], verarbeiter: [] }, veroeffentlichtAm: GEAENDERT, geprueft: false, hinweisen, neueVerarbeiter: ['Prüfpost GmbH'] },
});
const zeige = () => render(<MemoryRouter><RechtstextHinweis /></MemoryRouter>);
const ALT = Date.parse('2026-01-01T00:00:00Z');

beforeEach(() => {
  window.localStorage.clear();
  einblick = null;
  user = { uid: 'u1', role: 'Mitarbeiter', createdAt: ALT };
  aktuell.mockReset().mockResolvedValue(texte(true));
  aenderungen.mockReset().mockResolvedValue([]);
  kenntnis.mockReset().mockResolvedValue();
});

describe('Neue Unterauftragsverarbeiter — für die Leitung', () => {
  it('nennt sie mit Datum und Kontakt für Einwände; „Zur Kenntnis genommen“ hält es fest und schließt', async () => {
    user = { uid: 'u1', role: 'Geschäftsführung', createdAt: ALT };
    aenderungen.mockResolvedValue([{ nummer: 2, veroeffentlichtAm: GEAENDERT, neueVerarbeiter: ['Prüfpost GmbH'] }]);
    zeige();
    const zeile = await screen.findByRole('status');
    expect(zeile).toHaveTextContent('Neue Unterauftragsverarbeiter bei Senklot seit 04.11.2026: Prüfpost GmbH.');
    expect(zeile).toHaveTextContent('Einwände an den Betreiber: office@senklot.test.');
    expect(screen.getByRole('link', { name: 'Datenschutzerklärung' })).toHaveAttribute('href', '/datenschutz');
    fireEvent.click(screen.getByRole('button', { name: 'Zur Kenntnis genommen' }));
    await waitFor(() => expect(kenntnis).toHaveBeenCalledTimes(1));
    // Danach auch kein zweiter Hinweis auf dieselbe Fassung.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(window.localStorage.getItem('senklot.datenschutz.gesehen:u1')).toBe('2');
  });

  it('ein Monteur fragt gar nicht nach — die Datenbank gäbe ihm ohnehin nichts', async () => {
    zeige();
    await screen.findByRole('status');
    expect(aenderungen).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).not.toHaveTextContent('Unterauftragsverarbeiter');
  });
});

describe('Geänderte Datenschutzerklärung — für alle', () => {
  it('erscheint einmal; „Ausblenden“ merkt es sich auf dem Gerät', async () => {
    zeige();
    expect(await screen.findByRole('status')).toHaveTextContent('Die Datenschutzerklärung wurde am 04.11.2026 geändert.');
    fireEvent.click(screen.getByRole('button', { name: 'Ausblenden' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('senklot.datenschutz.gesehen:u1')).toBe('2');
  });

  it('„Ansehen“ führt zur Erklärung und gilt als gelesen', async () => {
    zeige();
    fireEvent.click(await screen.findByRole('link', { name: 'Ansehen' }));
    expect(window.localStorage.getItem('senklot.datenschutz.gesehen:u1')).toBe('2');
  });

  it('nicht, wenn sie schon gesehen ist, wenn der Betreiber nicht hinweisen wollte, wenn das Konto jünger ist, und nicht im Supporteinblick', async () => {
    const leer = async () => {
      const { unmount } = zeige();
      await waitFor(() => expect(aktuell).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      unmount();
      aktuell.mockClear();
    };
    window.localStorage.setItem('senklot.datenschutz.gesehen:u1', '2');
    await leer();
    window.localStorage.clear();
    aktuell.mockResolvedValue(texte(false));
    await leer();
    aktuell.mockResolvedValue(texte(true));
    user = { uid: 'u1', role: 'Mitarbeiter', createdAt: Date.parse('2026-11-05T00:00:00Z') };
    await leer();
    user = { uid: 'u1', role: 'Mitarbeiter', createdAt: ALT };
    einblick = { id: 'f1' };
    const { container } = zeige();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('Gegenprobe: eine neue Fassung zeigt ihn wieder, auch wenn die vorige gesehen war', async () => {
    window.localStorage.setItem('senklot.datenschutz.gesehen:u1', '2');
    aktuell.mockResolvedValue(texte(true, 3));
    zeige();
    expect(await screen.findByRole('status')).toHaveTextContent('Die Datenschutzerklärung wurde am 04.11.2026 geändert.');
  });
});
