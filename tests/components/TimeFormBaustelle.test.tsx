import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Prüflauf 25.09.2026, P1-07: die Baustelle ist Pflicht — auch wenn das
 * Auswahlfeld selbst nicht prüfen kann.
 *
 * Die Pflicht hing allein am `required` des Auswahlfelds. Solange es lädt,
 * ist es gesperrt, und ein gesperrtes Feld prüft der Browser nicht; im
 * Fehlerzustand steht gar keines da. Die Attrappe hier ist genau dieser Fall:
 * es gibt kein Feld. „Anwesend" ging dann ohne Baustelle durch.
 *
 * Und „Wie zuletzt" übernahm die Baustelle, aber nicht den Kundennamen, wenn
 * die Auswahl den Datensatz (noch) nicht kannte.
 */

const MONTEUR = 'u1';
const buchen = vi.fn<unknown[], Promise<string>>(async () => 'confirmed');

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => buchen(...a),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert = {
  user: {
    uid: MONTEUR,
    email: 'max@perl.at',
    name: 'Max Mustermann',
    role: 'Mitarbeiter' as const,
    companyId: 'perl',
    docId: MONTEUR,
  } as unknown as AppUser,
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

const letzter = {
  id: 't0',
  companyId: 'perl',
  userId: MONTEUR,
  userName: 'Max Mustermann',
  date: '2026-09-24',
  status: 'Anwesend',
  startTime: '07:30',
  endTime: '15:30',
  breakDuration: 30,
  projectNumber: 'B-007',
  customerName: 'Familie Huber',
} as unknown as TimeEntry;

function zeichne(lastEntry?: TimeEntry) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} lastEntry={lastEntry} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  buchen.mockClear();
});

describe('Baustelle beim Buchen', () => {
  it('bucht „Anwesend" nicht ohne Baustelle, auch wenn kein Auswahlfeld prüft', async () => {
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: /buchen|speichern/i }));
    expect(await screen.findByText('Bitte eine Baustelle wählen.')).toBeInTheDocument();
    expect(buchen).not.toHaveBeenCalled();
  });

  it('übernimmt mit „Wie zuletzt" auch den Kundennamen', async () => {
    zeichne(letzter);
    fireEvent.click(screen.getByRole('button', { name: /Wie zuletzt/ }));
    fireEvent.click(screen.getByRole('button', { name: /buchen|speichern/i }));
    await waitFor(() => expect(buchen).toHaveBeenCalled());
    const eintrag = buchen.mock.calls[0][1] as Partial<TimeEntry>;
    expect(eintrag.projectNumber).toBe('B-007');
    expect(eintrag.customerName).toBe('Familie Huber');
  });
});
