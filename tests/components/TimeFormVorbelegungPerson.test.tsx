import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser } from '@/types';

/**
 * „Zeit erfassen“ an einem Tag ohne Buchung (Mitarbeiterübersicht, Runde 4,
 * Entscheidung R4-0 Frage 3): dasselbe Formular wie die Hauptaktion, mit
 * Person UND Tag vorbelegt. Die Person kommt nur aus `staff` — für jemanden,
 * der dort nicht steht, wird nichts vorbelegt.
 */

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert = {
  user: { uid: 'chefin', email: 'c@perl.at', name: 'Petra Perl', role: 'Geschäftsführung' as const, companyId: 'perl', docId: 'chefin' },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

const max = { id: 'u1', uid: 'u1', name: 'Max Mustermann', role: 'Mitarbeiter', active: true } as AppUser;
const lena = { id: 'u2', uid: 'u2', name: 'Lena Pichler', role: 'Mitarbeiter', active: true } as AppUser;

function zeichne(props: Partial<Parameters<typeof TimeForm>[0]>) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Vorbelegung der Person beim Erfassen für jemanden', () => {
  it('wählt die Person und den Tag vor', async () => {
    zeichne({ staff: [max, lena], vorbelegung: { userId: 'u2', date: '2026-10-07' } });
    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('Mitarbeiter')).toHaveValue('u2'));
    expect(screen.getByLabelText<HTMLInputElement>(/Datum/)).toHaveValue('2026-10-07');
    // Von und Bis bleiben auf dem gewohnten Stand.
    expect(screen.getByLabelText<HTMLInputElement>(/^Von/)).toHaveValue('07:00');
  });

  it('Gegenprobe: ohne Vorbelegung steht „— wählen —“', async () => {
    zeichne({ staff: [max, lena] });
    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('Mitarbeiter')).toHaveValue(''));
  });

  it('Gegenprobe: eine Person, die nicht zur Auswahl steht, wird nicht vorbelegt', async () => {
    zeichne({ staff: [max], vorbelegung: { userId: 'u2', date: '2026-10-07' } });
    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('Mitarbeiter')).toHaveValue(''));
  });

  it('ohne Auswahl (eigene Buchung) ändert die Angabe nichts', async () => {
    zeichne({ vorbelegung: { userId: 'u2', date: '2026-10-07' } });
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>(/Datum/)).toHaveValue('2026-10-07'));
    expect(screen.queryByLabelText('Mitarbeiter')).not.toBeInTheDocument();
  });
});
