import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Den Schein nachtragen, wenn der Tag schon gebucht ist (10.10.2026): die
 * neue Zeit wird zwischen die Tagesbuchung eingefügt. Die Maske sagt vorher,
 * was aus der anderen Buchung wird, und bucht über `zeitEinfuegen` in einem
 * Zug.
 *
 * Gegenproben: ohne Überschneidung bucht sie wie bisher; in eine verrechnete
 * Buchung fügt sie nichts ein und sagt warum.
 */

const MONTEUR = 'u1';
const einfuegen = vi.fn<(e: unknown) => Promise<string>>(async () => 'neu-1');
const anlegen = vi.fn<(c: string, e: unknown) => Promise<'confirmed'>>(async () => 'confirmed');
let tag: unknown[] = [];

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (c: string, e: unknown) => anlegen(c, e),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => tag),
  listOwnEntriesInRange: vi.fn(async () => []),
  zeitAufteilen: vi.fn(),
  zeitEinfuegen: (e: unknown) => einfuegen(e),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/lib/db/assignments', () => ({ listAssignmentsForUserInRange: vi.fn(async () => []) }));
vi.mock('@/lib/db/workSheets', () => ({ listWorkSheetsInRange: vi.fn(async () => []) }));
vi.mock('@/components/BaustellenSelect', () => ({
  default: ({ id, label, value, onChange }: { id: string; label?: string; value: string; onChange: (nr: string) => void }) => (
    <input id={id} aria-label={label ?? 'Baustelle'} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('@/lib/db/arbeitszeitGrenzen', () => ({ getGeburtsdatum: vi.fn(async () => null) }));

const authWert = {
  user: {
    uid: MONTEUR, email: 'max@perl.at', name: 'Max Mustermann', role: 'Mitarbeiter' as const,
    companyId: 'perl', docId: MONTEUR,
  } as unknown as AppUser,
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false, error: null, signIn: vi.fn(), signOut: vi.fn(), resetPassword: vi.fn(), reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

const TAGESBUCHUNG = {
  id: 't1', companyId: 'perl', userId: MONTEUR, userName: 'Max Mustermann', date: '2026-10-06',
  status: 'Anwesend', startTime: '07:00', endTime: '16:00', breakDuration: 30,
  projectNumber: 'B-1', customerName: 'Familie Huber', isBilled: false,
} as unknown as TimeEntry;

const gespeichert = vi.fn();
/** Wie „Zeit nachtragen“ an einem Schein: Tag, Baustelle und Uhrzeiten vorbelegt. */
function nachtragen() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm
          onSaved={gespeichert}
          vorbelegung={{ date: '2026-10-06', projectNumber: 'B-2', startTime: '10:00', endTime: '12:00', breakDuration: 0 }}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  einfuegen.mockClear();
  anlegen.mockClear();
  gespeichert.mockClear();
  tag = [TAGESBUCHUNG];
});

describe('Zeit einfügen', () => {
  it('sagt vorher, was aus der Tagesbuchung wird, und fügt in einem Zug ein', async () => {
    nachtragen();
    expect(await screen.findByText(
      /wird beim Buchen dazwischen eingefügt: B-1 07:00–16:00 wird zu 07:00–10:00 und 12:00–16:00/,
    )).toBeInTheDocument();
    const knopf = screen.getByRole('button', { name: 'Zeit einfügen' });
    fireEvent.click(knopf);
    await waitFor(() => expect(einfuegen).toHaveBeenCalled());
    expect(einfuegen.mock.calls[0][0]).toMatchObject({
      date: '2026-10-06', status: 'Anwesend', startTime: '10:00', endTime: '12:00',
      projectNumber: 'B-2', userId: MONTEUR, userName: 'Max Mustermann', source: 'manual',
    });
    expect(anlegen).not.toHaveBeenCalled();
    await waitFor(() => expect(gespeichert).toHaveBeenCalled());
  });

  it('Gegenprobe: ohne Überschneidung wird gebucht wie bisher', async () => {
    tag = [{ ...TAGESBUCHUNG, startTime: '13:00', endTime: '16:00', breakDuration: 0 }];
    nachtragen();
    const knopf = await screen.findByRole('button', { name: 'Zeit buchen' });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/dazwischen eingefügt/)).toBeNull();
    fireEvent.click(knopf);
    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    expect(einfuegen).not.toHaveBeenCalled();
  });

  it('Gegenprobe: in eine verrechnete Buchung wird nichts eingefügt — und der Grund steht da', async () => {
    tag = [{ ...TAGESBUCHUNG, isBilled: true, invoiceNumber: 'RE-1' }];
    nachtragen();
    const knopf = await screen.findByRole('button', { name: 'Zeit buchen' });
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.click(knopf);
    expect(await screen.findByText(/ist schon verrechnet und bleibt, wie sie ist/)).toBeInTheDocument();
    expect(einfuegen).not.toHaveBeenCalled();
    expect(anlegen).not.toHaveBeenCalled();
  });

  it('gleich nach dem Buchen kennt die Maske die eben gebuchte Zeit — und bietet das Einfügen an', async () => {
    tag = [];
    render(
      <MemoryRouter>
        <ToastProvider>
          <TimeForm onSaved={gespeichert} />
        </ToastProvider>
      </MemoryRouter>,
    );
    const baustelle = await screen.findByLabelText('Baustelle');
    fireEvent.change(baustelle, { target: { value: 'B-1' } });
    fireEvent.change(screen.getByLabelText(/^Von/), { target: { value: '07:00' } });
    fireEvent.change(screen.getByLabelText(/^Bis/), { target: { value: '16:00' } });
    // Was die Datenbank danach liefert: die eben gebuchte Zeit.
    tag = [{ ...TAGESBUCHUNG, date: (screen.getByLabelText(/^Datum/) as HTMLInputElement).value }];
    fireEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Baustelle'), { target: { value: 'B-2' } });
    fireEvent.change(screen.getByLabelText(/^Von/), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText(/^Bis/), { target: { value: '12:00' } });
    expect(await screen.findByText(/B-1 07:00–16:00 wird zu 07:00–10:00 und 12:00–16:00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zeit einfügen' })).toBeEnabled();
  });
});
