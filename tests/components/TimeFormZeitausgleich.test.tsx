import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Role, TimeEntry } from '@/types';

/**
 * Zeitausgleich in der Zeiterfassung.
 *
 * DER MONTEUR BEANTRAGT, DAS BÜRO BUCHT. Stünde „Zeitausgleich" in seiner
 * Auswahl, ginge er am Genehmigenden vorbei. Das Büro dagegen trägt ihn
 * nach — ganztags oder für einige Stunden.
 */

const anlegen = vi.fn<unknown[], Promise<string>>(async () => 'confirmed');
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => anlegen(...a),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

// EIN Objekt, nicht eines je Aufruf: die Maske lädt die Tagesbuchungen neu,
// sobald sich der Nutzer ändert — ein frisches Objekt je Rendern wäre eine
// Endlosschleife.
const authWert = {
  user: { uid: 'ich', name: 'Brigitte Büro', role: 'Buchhaltung' as Role, companyId: 'perl' },
  company: { id: 'perl', name: 'Perl Installationen' },
};
let rolle: Role = 'Buchhaltung';
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

function zeichne(entry?: TimeEntry & { id: string }) {
  authWert.user = { ...authWert.user, role: rolle };
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} entry={entry} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const optionen = () =>
  Array.from((screen.getByLabelText('Status') as HTMLSelectElement).options).map((o) => o.value);

beforeEach(() => {
  anlegen.mockClear();
  rolle = 'Buchhaltung';
});

describe('Zeitausgleich — wer ihn direkt bucht', () => {
  it('das Büro hat ihn in der Auswahl', () => {
    zeichne();
    expect(optionen()).toContain('Zeitausgleich');
  });

  it('der Monteur nicht — er beantragt ihn', () => {
    rolle = 'Mitarbeiter';
    zeichne();
    expect(optionen()).not.toContain('Zeitausgleich');
  });

  it('ein gebuchter ZA verschwindet beim Bearbeiten nicht aus der Auswahl', () => {
    rolle = 'Mitarbeiter';
    zeichne({
      id: 'z1', companyId: 'perl', userId: 'ich', date: '2026-09-01', status: 'Zeitausgleich',
    });
    expect(optionen()).toContain('Zeitausgleich');
    expect(screen.getByLabelText('Status')).toHaveValue('Zeitausgleich');
  });
});

describe('Zeitausgleich — was gebucht wird', () => {
  it('ganztags: ohne Zeiten und ohne Pause', async () => {
    zeichne();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Zeitausgleich');
    await userEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1]).toMatchObject({
      status: 'Zeitausgleich', startTime: '', endTime: '', breakDuration: 0,
    });
  });

  it('stundenweise: mit Von und Bis', async () => {
    zeichne();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Zeitausgleich');
    await userEvent.click(screen.getByLabelText('Nur einige Stunden'));
    const von = screen.getByLabelText(/Frei von/);
    const bis = screen.getByLabelText(/Frei bis/);
    await userEvent.clear(von);
    await userEvent.type(von, '13:00');
    await userEvent.clear(bis);
    await userEvent.type(bis, '17:00');
    await userEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));
    expect(anlegen.mock.calls[0][1]).toMatchObject({
      status: 'Zeitausgleich', startTime: '13:00', endTime: '17:00',
    });
  });

  it('lehnt „bis vor von" ab, statt es zu buchen', async () => {
    zeichne();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Zeitausgleich');
    await userEvent.click(screen.getByLabelText('Nur einige Stunden'));
    const bis = screen.getByLabelText(/Frei bis/);
    await userEvent.clear(bis);
    await userEvent.type(bis, '06:00');
    await userEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    expect(await screen.findByText(/„Frei bis" nach „Frei von"/)).toBeInTheDocument();
    expect(anlegen).not.toHaveBeenCalled();
  });
});
