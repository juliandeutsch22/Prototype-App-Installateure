import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Terminiert jemand eine Baustelle in den Betriebsurlaub, steht es beim
 * Datum — als Hinweis, nicht als Sperre.
 */
const abfrage = vi.fn(async (_c: string, von: string, bis: string) =>
  von <= '2026-12-31' && bis >= '2026-12-28'
    ? [{ id: 'b1', companyId: 'perl', von: '2026-12-28', bis: '2026-12-31', bezeichnung: 'Weihnachten', urlaubAbbuchen: true }]
    : [],
);
vi.mock('@/lib/db/abwesenheiten', () => ({
  listBetriebsurlaubeImZeitraum: (c: string, v: string, b: string) => abfrage(c, v, b),
}));

const { default: BetriebsurlaubHinweis } = await import('@/features/projects/BetriebsurlaubHinweis');

describe('Betriebsurlaub beim Baustellendatum', () => {
  it('nennt ihn, wenn der Zeitraum hineinreicht', async () => {
    render(<BetriebsurlaubHinweis companyId="perl" von="2026-12-20" bis="2027-01-10" />);
    expect(await screen.findByRole('status')).toHaveTextContent('Weihnachten (28.12.–31.12.)');
  });

  it('schweigt ausserhalb', async () => {
    render(<BetriebsurlaubHinweis companyId="perl" von="2026-11-02" bis="2026-11-20" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('nimmt ohne Ende nur den Beginn', async () => {
    render(<BetriebsurlaubHinweis companyId="perl" von="2026-12-29" bis="" />);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(abfrage).toHaveBeenLastCalledWith('perl', '2026-12-29', '2026-12-29');
  });

  it('fragt ohne Beginn gar nicht', async () => {
    abfrage.mockClear();
    render(<BetriebsurlaubHinweis companyId="perl" von="" bis="" />);
    expect(abfrage).not.toHaveBeenCalled();
  });
});
