import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GenehmigungsAbwesenheit } from '@/lib/db/vacations';

const laden = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/vacations', () => ({ listGenehmigungsAbwesenheiten: laden }));
import Monatsabwesenheiten from '@/features/vacations/Monatsabwesenheiten';

const daten: GenehmigungsAbwesenheit[] = [
  { userId: 'a', name: 'Anna', von: '2026-10-07', bis: '2026-10-09', grund: 'Urlaub', zeiten: null },
  { userId: 'a', name: 'Anna', von: '2026-10-08', bis: '2026-10-08', grund: 'ZA', zeiten: '13:00–17:00' },
  { userId: 'b', name: 'Berta', von: '2026-10-08', bis: '2026-10-08', grund: null, zeiten: null },
];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
  laden.mockReset().mockResolvedValue(daten);
});
afterEach(() => vi.useRealTimers());

describe('Monatsübersicht', () => {
  it('zählt Personen einmal und nennt Uhrzeiten sowie nur freigegebene Gründe', async () => {
    render(<Monatsabwesenheiten stand={0} />);
    expect(await screen.findByRole('button', { name: /8\. Oktober.*2 Personen abwesend/ })).toBeInTheDocument();
    expect(screen.getAllByText('Anna')).toHaveLength(1);
    expect(screen.getByText(/Urlaub; ZA · 13:00–17:00/)).toBeInTheDocument();
    expect(screen.getByText('Berta').parentElement).toHaveTextContent('Berta · abwesend');
    expect(laden).toHaveBeenCalledWith('2026-10-01', '2026-10-31');
  });
  it('blättert mit richtigen Monatsgrenzen und hält den gewählten Monat beim Aktualisieren', async () => {
    const h = render(<Monatsabwesenheiten stand={0} />);
    await screen.findByText('Anna');
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    await waitFor(() => expect(laden).toHaveBeenLastCalledWith('2026-11-01', '2026-11-30'));
    h.rerender(<Monatsabwesenheiten stand={1} />);
    await waitFor(() => expect(laden).toHaveBeenCalledTimes(3));
    expect(laden).toHaveBeenLastCalledWith('2026-11-01', '2026-11-30');
    expect(screen.getByText('November 2026')).toBeInTheDocument();
  });
  it('gibt einen Fehler nicht als Monat ohne Abwesenheiten aus', async () => {
    laden.mockRejectedValueOnce(new Error('Übersicht nicht erreichbar'));
    render(<Monatsabwesenheiten stand={0} />);
    expect(await screen.findByText('Übersicht nicht erreichbar')).toBeInTheDocument();
    expect(screen.queryByText('An diesem Tag ist keine Abwesenheit eingetragen.')).not.toBeInTheDocument();
  });
  it('verwirft die Antwort eines inzwischen verlassenen Monats', async () => {
    let altFertig!: (daten: GenehmigungsAbwesenheit[]) => void;
    laden.mockImplementationOnce(() => new Promise((resolve) => { altFertig = resolve; }))
      .mockResolvedValueOnce([{ ...daten[1], userId: 'c', name: 'Clara', von: '2026-11-01', bis: '2026-11-01' }]);
    render(<Monatsabwesenheiten stand={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    await screen.findByText('Clara');
    await act(async () => { altFertig(daten); });
    expect(screen.getByText('Clara')).toBeInTheDocument();
    expect(screen.queryByText('Anna')).not.toBeInTheDocument();
  });
});
