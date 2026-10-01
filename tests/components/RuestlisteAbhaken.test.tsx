import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Nachtest 01.10.2026 — Rüstliste: mit „eingeladen“ bucht die Datenbank den
 * Lagerabgang. Zurücknehmen geht nur am selben Tag; danach über die Retoure.
 */
const umschalten = vi.fn(async () => undefined);
vi.mock('@/lib/db/einsatzMaterial', () => ({ ladenUmschalten: (...a: unknown[]) => umschalten(...(a as [])) }));
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'm1', name: 'Max', companyId: 'perl', role: 'Mitarbeiter' } }),
}));
vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => '2026-10-01' };
});

const { default: RuestlisteAbhaken } = await import('@/features/assignments/RuestlisteAbhaken');

const POS = [
  { id: 'a', name: 'Kupferrohr 15', menge: 10, einheit: 'm', materialId: 'k1' },
  { id: 'b', name: 'Pressfitting', menge: 4, einheit: 'Stk', materialId: 'k2' },
];

beforeEach(() => umschalten.mockClear());

describe('Rüstliste abhaken', () => {
  it('sagt, dass vom Lager abgebucht ist, und lässt heute zurücknehmen', async () => {
    const heute = new Date('2026-10-01T06:12:00').getTime();
    render(<RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS}
      geladen={{ a: { von: 'Max', am: heute, gebucht: 10, material: 'k1' } }} />);
    expect(screen.getByText(/eingeladen von Max · vom Lager abgebucht/)).toBeInTheDocument();
    const box = screen.getByLabelText(/Kupferrohr 15/);
    expect(box).not.toBeDisabled();
    await userEvent.click(box);
    expect(umschalten).toHaveBeenCalledWith('perl', '2026-10-01', 'PR-1', 'a', false, 'Max');
  });

  it('von gestern lässt sich nicht mehr zurücknehmen — Retoure', () => {
    const gestern = new Date('2026-09-30T06:12:00').getTime();
    render(<RuestlisteAbhaken date="2026-09-30" projectNumber="PR-1" positionen={POS}
      geladen={{ a: { von: 'Max', am: gestern, gebucht: 10, material: 'k1' } }} />);
    const box = screen.getByLabelText(/Kupferrohr 15/);
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute('title', expect.stringMatching(/nur am selben Tag/));
  });

  it('erklärt den Haken', () => {
    render(<RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS} geladen={{}} />);
    expect(screen.getByText(/Der Haken bucht Lagermaterial vom Bestand ab/)).toBeInTheDocument();
  });
});
