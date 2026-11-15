import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  V1 (Durchsicht 15.11.2026): beim Genehmigen eines Urlaubs und beim Erfassen
  einer Krankmeldung steht, ob die Person im Zeitraum eingeteilt ist — mit
  dem Sprung in den Plan, für wen ihn planen darf. Gegenprobe: vorher stand
  das nirgends.
*/
let darfPlanen = true;
let einsaetze: { date: string; projectNumber: string }[] = [];
const gefragt = vi.fn();
vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForUserInRange: async (...a: unknown[]) => { gefragt(...a); return einsaetze; },
}));

const { default: EingeteiltHinweis } = await import('@/features/assignments/EingeteiltHinweis');

const zeige = (an = true) => render(
  <MemoryRouter>
    <EingeteiltHinweis companyId="perl" an={an} darfPlanen={darfPlanen} uid="u1" von="2026-09-02" bis="2026-09-04" />
  </MemoryRouter>,
);

beforeEach(() => {
  darfPlanen = true;
  einsaetze = [];
  gefragt.mockClear();
});

describe('EingeteiltHinweis (V1)', () => {
  it('nennt die Tage und führt in die Woche', async () => {
    einsaetze = [
      { date: '2026-09-02', projectNumber: 'B-1' }, { date: '2026-09-02', projectNumber: 'B-2' }, { date: '2026-09-04', projectNumber: 'B-1' },
    ];
    zeige();
    expect(await screen.findByText(/An 2 Tagen eingeteilt: Mi 02\.09\., Fr 04\.09\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Im Plan ansehen' })).toHaveAttribute('href', '/assignments/woche?woche=2026-W36&tag=2026-09-02');
    expect(gefragt).toHaveBeenCalledWith('perl', 'u1', '2026-09-02', '2026-09-04');
  });

  it('die Buchhaltung sieht den Satz ohne Weg, den sie nicht gehen kann', async () => {
    darfPlanen = false;
    einsaetze = [{ date: '2026-09-03', projectNumber: 'B-1' }];
    zeige();
    expect(await screen.findByText(/An einem Tag eingeteilt: Do 03\.09\./)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('bleibt gleich: ohne Einsatz steht nichts da; ohne Einsatzplanung wird nicht gefragt', async () => {
    const { container, unmount } = zeige();
    await waitFor(() => expect(gefragt).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();
    gefragt.mockClear();
    einsaetze = [{ date: '2026-09-03', projectNumber: 'B-1' }];
    const aus = zeige(false);
    expect(aus.container).toBeEmptyDOMElement();
    expect(gefragt).not.toHaveBeenCalled();
  });
});
