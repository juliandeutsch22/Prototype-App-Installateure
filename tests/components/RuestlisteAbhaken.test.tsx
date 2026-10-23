import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import { MemoryRouter } from 'react-router-dom';

/**
 * Nachtest 01.10.2026 — Rüstliste: mit „eingeladen“ bucht die Datenbank den
 * Lagerabgang. Zurücknehmen geht nur am selben Tag; danach über die Retoure.
 */
const umschalten = vi.fn<(...a: unknown[]) => Promise<number>>(async () => 0);
vi.mock('@/lib/db/einsatzMaterial', () => ({ ladenUmschalten: (...a: unknown[]) => umschalten(...a) }));
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

  // Runde 3, G15: der Haken bucht ab — und sagt es.
  it('bestätigt „eingeladen“ mit der abgebuchten Menge', async () => {
    umschalten.mockResolvedValueOnce(1);
    render(<ToastProvider><RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS} geladen={{}} /></ToastProvider>);
    await userEvent.click(screen.getByLabelText(/Pressfitting/));
    expect(await screen.findByText('1 Stk abgebucht')).toBeInTheDocument();
    expect(screen.getByText(/eingeladen von Max · vom Lager abgebucht/)).toBeInTheDocument();
  });

  it('sagt es, wenn nichts vom Lager abgebucht wurde', async () => {
    umschalten.mockResolvedValueOnce(0);
    render(<ToastProvider><RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS} geladen={{}} /></ToastProvider>);
    await userEvent.click(screen.getByLabelText(/Kupferrohr 15/));
    expect(await screen.findByText('Eingeladen — nichts vom Lager abgebucht')).toBeInTheDocument();
  });

  it('bestätigt das Zurücknehmen als „Einladen zurückgenommen“, nicht als Retoure', async () => {
    umschalten.mockResolvedValueOnce(10);
    const heute = new Date('2026-10-01T06:12:00').getTime();
    render(<ToastProvider><RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS}
      geladen={{ a: { von: 'Max', am: heute, gebucht: 10, material: 'k1' } }} /></ToastProvider>);
    await userEvent.click(screen.getByLabelText(/Kupferrohr 15/));
    expect(await screen.findByText('Einladen zurückgenommen — 10 m wieder im Lager')).toBeInTheDocument();
  });

  it('meldet bei einem Fehlschlag nichts als erledigt', async () => {
    umschalten.mockRejectedValueOnce(new Error('Abhaken darf nur, wer für diesen Einsatz eingeteilt ist'));
    render(<ToastProvider><RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS} geladen={{}} /></ToastProvider>);
    await userEvent.click(screen.getByLabelText(/Pressfitting/));
    expect(await screen.findByRole('alert')).toHaveTextContent(/eingeteilt/);
    expect(screen.queryByText(/abgebucht/)).not.toBeInTheDocument();
  });
});

/*
  „ÜBRIGES ZURÜCKGEBEN“ (20.10.2026): der Satz sagte „über die Retoure“, und
  die lag im „⋯“ einer anderen Seite. Jetzt führt ein Verweis dorthin, mit
  der Baustelle des Einsatzes.
*/
describe('Rüstliste — Übriges zurückgeben', () => {
  const heute = new Date('2026-10-01T06:12:00').getTime();

  it('führt nach dem Einladen zur Rückgabe mit dieser Baustelle', () => {
    render(
      <MemoryRouter>
        <RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1/A" positionen={POS}
          geladen={{ a: { von: 'Max', am: heute, gebucht: 10, material: 'k1' } }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Übriges zurückgeben/ }))
      .toHaveAttribute('href', '/material?retoure=1&baustelle=PR-1%2FA');
  });

  it('Gleichbleiben: ohne Eingeladenes, nur zum Ansehen oder ohne Adressleiste kein Verweis', () => {
    const { unmount } = render(
      <MemoryRouter>
        <RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS} geladen={{}} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /Übriges zurückgeben/ })).toBeNull();
    unmount();
    const zweite = render(
      <MemoryRouter>
        <RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS} abhakbar={false}
          geladen={{ a: { von: 'Max', am: heute, gebucht: 10, material: 'k1' } }} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /Übriges zurückgeben/ })).toBeNull();
    zweite.unmount();
    // Eine Einzelansicht ohne Router (wie die übrigen Prüfungen hier) bricht nicht.
    render(<RuestlisteAbhaken date="2026-10-01" projectNumber="PR-1" positionen={POS}
      geladen={{ a: { von: 'Max', am: heute, gebucht: 10, material: 'k1' } }} />);
    expect(screen.queryByRole('link', { name: /Übriges zurückgeben/ })).toBeNull();
  });
});
