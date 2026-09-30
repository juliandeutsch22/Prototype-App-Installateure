import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Supportsitzung from '@/components/Supportsitzung';

/**
 * Das Band, das der SUPPORT in einem fremden Betrieb sieht.
 *
 * PRÜFLAUF 25.09.2026 (P3-14), offene Punkte B2. Die Oberfläche zeigt dem
 * Support die Knöpfe eines Administrators. Was Zeitbuchungen, Urlaube oder
 * Scheinfotos berührt, bleibt ihm verschlossen, und die Datensicherung nimmt
 * nur der Betrieb selbst mit — diese Knöpfe scheitern. Das Band sagt es,
 * bevor jemand es am Telefon mit dem Kunden ausprobiert; was seit B2 geht,
 * nennt es nicht mehr.
 */

let einblick: Record<string, unknown> | null = null;
const beenden = vi.fn();
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ einblick, einblickBeenden: beenden }),
}));

const freigabe = (stufe: 'ansehen' | 'mitarbeiten') => ({
  id: 'f1', company_id: 'perl', name: 'Perl Installationen', grund: 'Rechnung',
  notzugang: false, stufe, gilt_bis: new Date(Date.now() + 3_600_000).toISOString(),
});

beforeEach(() => {
  einblick = null;
});

describe('Das Band der Supportsitzung', () => {
  it('sagt bei „mitarbeiten“, was im Einblick nicht geht', () => {
    einblick = freigabe('mitarbeiten');
    render(<Supportsitzung />);
    const band = screen.getByRole('status');
    expect(band).toHaveTextContent('MITARBEITEN in Perl Installationen');
    expect(band).toHaveTextContent('deine Änderungen treffen echte Daten dieses Betriebs');
    expect(band).toHaveTextContent(
      'Rechnungen und Stornos, Scheine, Baustellennummer ändern, Urlaub, Krankmeldungen, Betriebsurlaub und Datensicherung gehen im Einblick nicht.',
    );
    // Seit B2 gehen sie — das Band darf sie nicht mehr als Grenze nennen.
    for (const geht of ['Einsätze', 'Angebote', 'Nummern']) {
      expect(band).not.toHaveTextContent(geht);
    }
  });

  it('bleibt bei „ansehen“ bei dem einen Satz', () => {
    einblick = freigabe('ansehen');
    render(<Supportsitzung />);
    const band = screen.getByRole('status');
    expect(band).toHaveTextContent('nur lesend. Änderungen weist die Datenbank ab.');
    expect(band).not.toHaveTextContent(/gehen im Einblick nicht/);
  });

  it('fehlt ohne Einblick ganz', () => {
    render(<Supportsitzung />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
