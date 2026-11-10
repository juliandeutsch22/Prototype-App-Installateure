import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { TimeEntry } from '@/types';

/**
 * DER ZWEITE TIMER-ABSCHNITT OHNE BAUSTELLE (Befund 09.11.2026).
 *
 * Ein Arbeitstag mit dem Timer, ohne Baustelle: 07:00–12:00, Pause,
 * 12:30–16:00. „Abschnitte prüfen“ öffnet je Abschnitt diese Maske. Der
 * erste war gebucht, der zweite meldete „Für diesen Tag ist bereits gebucht.
 * Eine weitere Buchung braucht eine Baustelle …“ und ließ sich nicht
 * speichern — der Nachmittag fehlte im Zeitkonto. Mit Uhrzeit auf beiden
 * Seiten sind die zwei Einträge auseinanderzuhalten; ohne Uhrzeit bleibt die
 * Sperre (zweiter Test).
 */

const UID = 'u1';
const TAG = '2026-11-09';

const amTag: (TimeEntry & { id: string })[] = [];
const eintraegeAmTag = vi.fn(async () => amTag);

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: () => eintraegeAmTag(),
  eintraegeUmDenTag: () => eintraegeAmTag(),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert = {
  user: {
    uid: UID,
    email: 'max@perl.at',
    name: 'Max Mustermann',
    role: 'Mitarbeiter' as const,
    companyId: 'perl',
    docId: UID,
  },
  company: { id: 'perl', name: 'Perl Installationen', modules: ['zeiterfassung'] },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

function vormittag(startTime?: string, endTime?: string): TimeEntry & { id: string } {
  return {
    id: 'vormittag',
    companyId: 'perl',
    date: TAG,
    status: 'Anwesend',
    userId: UID,
    userName: 'Max Mustermann',
    projectNumber: '',
    startTime,
    endTime,
  } as TimeEntry & { id: string };
}

type Speichern = (e: Partial<TimeEntry>) => Promise<'confirmed'>;

function zeichne(speichernMit: Speichern) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm
          baustelleFrei
          vorbelegung={{ date: TAG, startTime: '12:30', endTime: '16:00', breakDuration: 0, projectNumber: '' }}
          speichernMit={speichernMit}
          onSaved={vi.fn()}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  amTag.length = 0;
  eintraegeAmTag.mockClear();
});

describe('Timer-Abschnitt ohne Baustelle', () => {
  it('der Nachmittag nach dem gebuchten Vormittag lässt sich buchen', async () => {
    amTag.push(vormittag('07:00', '12:00'));
    const speichernMit = vi.fn<Speichern>(async () => 'confirmed');
    zeichne(speichernMit);
    await waitFor(() => expect(eintraegeAmTag).toHaveBeenCalled());

    await userEvent.setup().click(await screen.findByRole('button', { name: /speichern|buchen|erfassen/i }));

    await waitFor(() => expect(speichernMit).toHaveBeenCalledTimes(1));
    expect(speichernMit.mock.calls[0][0]).toMatchObject({ date: TAG, startTime: '12:30', endTime: '16:00' });
    expect(screen.queryByText(/braucht eine Baustelle/)).not.toBeInTheDocument();
  });

  it('gegen einen Eintrag ohne Uhrzeit bleibt die Sperre', async () => {
    // Der ursprüngliche Zweck der Regel: zwei Einträge ohne Baustelle und
    // ohne Uhrzeit sind nicht auseinanderzuhalten.
    amTag.push(vormittag());
    const speichernMit = vi.fn<Speichern>(async () => 'confirmed');
    zeichne(speichernMit);
    await waitFor(() => expect(eintraegeAmTag).toHaveBeenCalled());

    await userEvent.setup().click(await screen.findByRole('button', { name: /speichern|buchen|erfassen/i }));

    expect(await screen.findByText(/braucht eine Baustelle/)).toBeInTheDocument();
    expect(speichernMit).not.toHaveBeenCalled();
  });
});
