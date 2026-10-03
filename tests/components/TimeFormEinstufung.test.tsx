import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';
import type { Einstufung } from '@/lib/einstufung';

/**
 * Helfer-Kennzeichen und Einstufung in der Zeitmaske (Entscheidung 03.10.2026).
 *
 * Beim eingestuften Helfer und beim Lehrling folgt das Kennzeichen der
 * Einstufung. Vorher konnte der Haken aus dem Einsatzplan beim Lehrling den
 * Lehrlingssatz verdrängen, und ein Helfer ohne Haken zählte ins
 * Projekt-Budget.
 */

const anlegen = vi.fn<(a0: string, a1: Partial<TimeEntry>) => Promise<string>>(async () => 'confirmed');
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (firma: string, daten: Partial<TimeEntry>) => anlegen(firma, daten),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({
  default: ({ onChange, value }: { onChange: (nr: string) => void; value: string }) => (
    <input aria-label="Baustelle" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

let einstufung: Einstufung | null = null;
// Je Einstufung EIN festes Objekt — ein neues bei jedem Aufruf hiesse Neuladen ohne Ende.
const auth = new Map<string, { user: AppUser; company: { id: string; name: string } }>();
function authWert() {
  const k = String(einstufung);
  if (!auth.has(k)) {
    auth.set(k, {
      user: {
        uid: 'u1', email: 'x@perl.at', name: 'Monteur', role: 'Mitarbeiter', companyId: 'perl', docId: 'u1', einstufung,
      } as unknown as AppUser,
      company: { id: 'perl', name: 'Perl Installationen' },
    });
  }
  return auth.get(k)!;
}
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert() }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

/** „Zeit erfassen“ am geplanten Einsatz — mit dem Haken aus dem Einsatzplan. */
function vomEinsatz(asHelper: boolean) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/time', state: { projectNumber: 'B-1', asHelper } }]}>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function buchen() {
  await userEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
  await waitFor(() => expect(anlegen).toHaveBeenCalled());
  return anlegen.mock.calls[0][1];
}

beforeEach(() => {
  einstufung = null;
  anlegen.mockClear();
});

describe('Helfer-Kennzeichen nach Einstufung', () => {
  it('der Lehrling bucht ohne Kennzeichen, auch wenn der Einsatz eines trägt', async () => {
    einstufung = 'lehrling';
    vomEinsatz(true);
    expect(await screen.findByLabelText('Baustelle')).toHaveValue('B-1');
    expect(screen.queryByLabelText(/Einsatz als Helfer/)).toBeNull();
    expect(await buchen()).toMatchObject({ projectNumber: 'B-1', isHelper: false });
  });

  it('der eingestufte Helfer bucht immer mit Kennzeichen — ohne Haken zur Wahl', async () => {
    einstufung = 'helfer';
    vomEinsatz(false);
    expect(await screen.findByLabelText('Baustelle')).toHaveValue('B-1');
    expect(screen.queryByLabelText(/Einsatz als Helfer/)).toBeNull();
    expect(await buchen()).toMatchObject({ projectNumber: 'B-1', isHelper: true });
  });

  it('Gegenprobe: der Facharbeiter behält den Haken und seine Wahl', async () => {
    einstufung = 'facharbeiter';
    vomEinsatz(true);
    const haken = await screen.findByLabelText(/Einsatz als Helfer/);
    expect(haken).toBeChecked();
    expect(await buchen()).toMatchObject({ isHelper: true });
  });

  it('Gegenprobe: ohne Einstufung bleibt alles wie bisher', async () => {
    vomEinsatz(false);
    const haken = await screen.findByLabelText(/Einsatz als Helfer/);
    await userEvent.click(haken);
    expect(await buchen()).toMatchObject({ isHelper: true });
  });
});
