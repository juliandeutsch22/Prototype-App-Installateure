import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Zeitjournal from '@/features/time/Zeitjournal';
import type { ZeitAenderung } from '@/lib/db/zeitjournal';

const laden = vi.fn();
vi.mock('@/lib/db/zeitjournal', () => ({ listZeitjournal: (...a: unknown[]) => laden(...a) }));
const eintrag: ZeitAenderung = { id: 'j1', userId: 'u1', userName: 'Milan', datum: '2026-10-07',
  art: 'geaendert', durchName: 'Julia', createdAt: Date.parse('2026-10-08T08:00:00Z'),
  vorher: { end_time: '16:00:00' }, nachher: { end_time: '17:00:00' } };
beforeEach(() => laden.mockReset());
it('zeigt Bearbeiter und echte Vorher-/Nachher-Werte sowie gelöschte Buchungen', async () => {
  laden.mockResolvedValue({ zeilen: [eintrag, { ...eintrag, id: 'j2', art: 'geloescht', nachher: undefined }], naechste: null });
  render(<Zeitjournal companyId="perl" userId="u1" />);
  expect(await screen.findByText('16:00 → 17:00')).toBeInTheDocument();
  expect(screen.getByText(/Milan · 07.10.2026 · Gelöscht/)).toBeInTheDocument();
  expect(screen.getAllByText(/Julia/)).toHaveLength(2);
});
it('meldet einen Fehler, behauptet keinen leeren Bestand und erlaubt einen neuen Versuch', async () => {
  laden.mockRejectedValueOnce(new Error('Nicht erreichbar')).mockResolvedValueOnce({ zeilen: [eintrag], naechste: null });
  render(<Zeitjournal companyId="perl" />);
  expect(await screen.findByText('Nicht erreichbar')).toBeInTheDocument();
  expect(screen.queryByText('Noch keine Änderungen protokolliert.')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /Erneut/ }));
  expect(await screen.findByText('16:00 → 17:00')).toBeInTheDocument();
});
it('hängt weitere Ereignisse an und lässt bereits geladene Einträge stehen', async () => {
  laden.mockResolvedValueOnce({ zeilen: [eintrag], naechste: { id: 'j1', zeit: '2026-10-08T08:00:00Z' } })
    .mockResolvedValueOnce({ zeilen: [{ ...eintrag, id: 'j2', userName: 'Max' }], naechste: null });
  render(<Zeitjournal companyId="perl" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Weitere Änderungen laden' }));
  expect(await screen.findByText(/Max ·/)).toBeInTheDocument();
  expect(screen.getByText(/Milan ·/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Weitere Änderungen laden' })).toBeNull();
});
