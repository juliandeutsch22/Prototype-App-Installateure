import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry } from '@/types';

/**
 * Eine Buchung auf mehrere Baustellen aufteilen (10.10.2026) — in der
 * Buchungsmaske beim Bearbeiten. Vorgeschlagen werden die Baustellen aus dem
 * Einsatzplan und von den eigenen Scheinen des Tages.
 *
 * Gegenproben: eine neue Buchung, eine verrechnete, eine über Mitternacht und
 * eine mit ungespeicherten Änderungen bieten das Aufteilen nicht an.
 */

const MONTEUR = 'u1';
const aufteilen = vi.fn<(id: string, teile: unknown[]) => Promise<string[]>>(async () => ['n1', 'n2']);

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  zeitAufteilen: (id: string, teile: unknown[]) => aufteilen(id, teile),
  DuplicateEntryError: class extends Error {},
}));
const EINSAETZE = [
  { id: 'a1', date: '2026-10-06', projectNumber: 'B-1' },
  { id: 'a2', date: '2026-10-06', projectNumber: 'B-2' },
];
const einsaetze = vi.fn(async (): Promise<unknown[]> => EINSAETZE);
vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForUserInRange: () => einsaetze(),
}));
vi.mock('@/lib/db/workSheets', () => ({
  listWorkSheetsInRange: vi.fn(async () => [
    { id: 's1', datum: '2026-10-06', projectNumber: 'B-3', erstelltVonUid: MONTEUR, status: 'Unterschrieben' },
    // Ein fremder und ein verworfener Schein schlagen nichts vor.
    { id: 's2', datum: '2026-10-06', projectNumber: 'B-9', erstelltVonUid: 'anderer', status: 'Unterschrieben' },
    { id: 's3', datum: '2026-10-06', projectNumber: 'B-8', erstelltVonUid: MONTEUR, status: 'Verworfen' },
    // Vom Büro für ihn geschrieben: er steht in den Zeitzeilen.
    { id: 's4', datum: '2026-10-06', projectNumber: 'B-4', erstelltVonUid: 'buero', status: 'Unterschrieben',
      zeiten: [{ mitarbeiter: 'max  Mustermann', minuten: 60 }] },
  ]),
}));
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

const TAG = {
  id: 't1', companyId: 'perl', userId: MONTEUR, userName: 'Max Mustermann', date: '2026-10-06',
  status: 'Anwesend', startTime: '07:00', endTime: '16:00', breakDuration: 30,
  projectNumber: 'B-1', customerName: 'Familie Huber',
} as unknown as TimeEntry & { id: string };

const gespeichert = vi.fn();
function zeichne(entry?: TimeEntry & { id: string }) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={gespeichert} entry={entry} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  aufteilen.mockClear();
  gespeichert.mockClear();
  einsaetze.mockImplementation(async () => EINSAETZE);
});

describe('Buchung aufteilen', () => {
  it('schlägt Einsatzplan und Scheine vor, zeigt die Uhrzeiten und teilt in einem Schritt', async () => {
    zeichne(TAG);
    fireEvent.click(screen.getByRole('button', { name: 'Auf mehrere Baustellen aufteilen …' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('Weitere Baustelle 1')).toHaveValue('B-2'));
    expect(within(dialog).getByLabelText('Weitere Baustelle 2')).toHaveValue('B-3');
    expect(within(dialog).getByLabelText('Weitere Baustelle 3')).toHaveValue('B-4');
    expect(within(dialog).queryByLabelText('Weitere Baustelle 4')).toBeNull();

    const stunden = within(dialog).getAllByLabelText('Stunden');
    fireEvent.change(stunden[0], { target: { value: '2' } });
    fireEvent.change(stunden[1], { target: { value: '1,5' } });
    expect(within(dialog).getByText(/07:00–12:30 · 05:00 Std\. · 30 Min\. Pause/)).toBeInTheDocument();
    expect(within(dialog).getByText(/12:30–14:30 · 02:00 Std\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/14:30–16:00 · 01:30 Std\./)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Aufteilen' }));
    await waitFor(() => expect(aufteilen).toHaveBeenCalledWith('t1', [
      { projectNumber: 'B-2', minuten: 120 }, { projectNumber: 'B-3', minuten: 90 },
    ]));
    await waitFor(() => expect(gespeichert).toHaveBeenCalled());
  });

  it('Gegenprobe: zu viele Stunden — der Grund steht da, geteilt wird nicht', async () => {
    zeichne(TAG);
    fireEvent.click(screen.getByRole('button', { name: 'Auf mehrere Baustellen aufteilen …' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('Weitere Baustelle 1')).toHaveValue('B-2'));
    fireEvent.change(within(dialog).getAllByLabelText('Stunden')[0], { target: { value: '9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aufteilen' }));
    expect((await within(dialog).findAllByText(/bleibt keine Zeit/)).length).toBeGreaterThan(0);
    expect(aufteilen).not.toHaveBeenCalled();
  });

  it('kommen die Vorschläge später als die erste Eingabe, bleibt die Eingabe stehen', async () => {
    let antworten: (v: unknown[]) => void = () => undefined;
    einsaetze.mockImplementation(() => new Promise((r) => { antworten = r; }));
    zeichne(TAG);
    fireEvent.click(screen.getByRole('button', { name: 'Auf mehrere Baustellen aufteilen …' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Weitere Baustelle 1'), { target: { value: 'B-7' } });
    fireEvent.change(within(dialog).getByLabelText('Stunden'), { target: { value: '2' } });
    antworten(EINSAETZE);
    await new Promise((r) => setTimeout(r, 20));
    expect(within(dialog).getByLabelText('Weitere Baustelle 1')).toHaveValue('B-7');
    expect(within(dialog).queryByLabelText('Weitere Baustelle 2')).toBeNull();
  });

  it('Gegenprobe: neu, verrechnet, über Mitternacht — kein Aufteilen', () => {
    const { unmount } = zeichne();
    expect(screen.queryByRole('button', { name: /aufteilen/ })).toBeNull();
    unmount();
    const v = zeichne({ ...TAG, isBilled: true, invoiceNumber: 'RE-1' });
    expect(screen.queryByRole('button', { name: /aufteilen/ })).toBeNull();
    v.unmount();
    zeichne({ ...TAG, startTime: '20:00', endTime: '02:00' });
    expect(screen.queryByRole('button', { name: /aufteilen/ })).toBeNull();
  });

  it('Gegenprobe: mit ungespeicherter Änderung erst speichern', () => {
    zeichne(TAG);
    fireEvent.change(screen.getByLabelText(/^Bis/), { target: { value: '17:00' } });
    expect(screen.queryByRole('button', { name: /aufteilen/ })).toBeNull();
    expect(screen.getByText(/zuerst speichern/)).toBeInTheDocument();
  });
});
