import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Supportsitzung from '@/components/Supportsitzung';

/**
 * Das Band, das der SUPPORT in einem fremden Betrieb sieht.
 *
 * PRÜFLAUF 25.09.2026 (P3-14). Die Oberfläche zeigt dem Support die Knöpfe
 * eines Administrators — aber was die App über eine Datenbankfunktion
 * erledigt, holt den Betrieb aus dem Anmeldekonto, und ein Plattformkonto hat
 * keinen. Solche Knöpfe scheitern. Das Band sagt es, bevor jemand es am
 * Telefon mit dem Kunden ausprobiert.
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
  it('sagt bei „mitarbeiten", was im Einblick nicht geht', () => {
    einblick = freigabe('mitarbeiten');
    render(<Supportsitzung />);
    const band = screen.getByRole('status');
    expect(band).toHaveTextContent('MITARBEITEN in Perl Installationen');
    expect(band).toHaveTextContent('deine Änderungen treffen echte Daten dieses Betriebs');
    expect(band).toHaveTextContent(/Was über den Server läuft .* geht im Einblick nicht/);
  });

  it('bleibt bei „ansehen" bei dem einen Satz', () => {
    einblick = freigabe('ansehen');
    render(<Supportsitzung />);
    const band = screen.getByRole('status');
    expect(band).toHaveTextContent('nur lesend. Änderungen weist die Datenbank ab.');
    expect(band).not.toHaveTextContent(/geht im Einblick nicht/);
  });

  it('fehlt ohne Einblick ganz', () => {
    render(<Supportsitzung />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
