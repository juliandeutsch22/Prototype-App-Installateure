import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Role, TimeEntry } from '@/types';

/**
 * Urlaub in der Zeiterfassung — nur noch als Antrag.
 *
 * Der Monteur beantragt ihn auf der Seite Urlaub und bekommt ihn hier nicht
 * mehr angeboten. Das Büro trägt ihn ein, und daraus wird ein genehmigter
 * Antrag. Ein Tag aus einem genehmigten Antrag ist gesperrt. Und ein Tag ohne
 * Uhrzeiten scheitert nicht mehr am Speichern (vorher: `''` statt `null`).
 */

const anlegen = vi.fn<unknown[], Promise<string>>(async () => 'confirmed');
const aendern = vi.fn<unknown[], Promise<string>>(async () => 'confirmed');
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => anlegen(...a),
  updateTimeEntryOhneEmpfang: (...a: unknown[]) => aendern(...a),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
const eintragen = vi.fn();
vi.mock('@/lib/db/abwesenheiten', () => ({
  krankmeldungSpeichern: vi.fn(),
  urlaubEintragen: (...a: unknown[]) => eintragen(...a),
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert = {
  user: { uid: 'ich', name: 'Brigitte Büro', role: 'Buchhaltung' as Role, companyId: 'perl' },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

const gespeichert = vi.fn();
const max = { id: 'm', uid: 'max', name: 'Max', role: 'Mitarbeiter', companyId: 'perl', email: '' } as AppUser;

function zeichne(p: { entry?: TimeEntry & { id: string }; staff?: AppUser[] } = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={gespeichert} entry={p.entry} staff={p.staff} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const optionen = () =>
  Array.from((screen.getByLabelText('Status') as HTMLSelectElement).options).map((o) => o.value);

beforeEach(() => {
  anlegen.mockClear();
  aendern.mockClear();
  gespeichert.mockClear();
  eintragen.mockReset();
  eintragen.mockResolvedValue({ id: 'v1', tage: 4, uebersprungen: 1 });
  authWert.user = { ...authWert.user, role: 'Buchhaltung' };
});

describe('Urlaub in der Zeiterfassung', () => {
  it('bietet dem Monteur keinen Urlaub an — er beantragt ihn', () => {
    authWert.user = { ...authWert.user, role: 'Mitarbeiter' };
    zeichne();
    expect(optionen()).not.toContain('Urlaub');
  });

  it('das Büro trägt Urlaub für den gewählten Mitarbeiter als genehmigten Antrag ein', async () => {
    zeichne({ staff: [max] });
    await userEvent.selectOptions(screen.getByLabelText(/^Mitarbeiter/), 'max');
    await userEvent.clear(screen.getByLabelText(/^Datum/));
    await userEvent.type(screen.getByLabelText(/^Datum/), '2027-02-22');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Urlaub');
    const bis = screen.getByLabelText(/^Urlaub bis/);
    expect(bis).toHaveValue('2027-02-22');
    await userEvent.clear(bis);
    await userEvent.type(bis, '2027-02-26');
    await userEvent.click(screen.getByRole('button', { name: 'Urlaub eintragen' }));
    await waitFor(() =>
      expect(eintragen).toHaveBeenCalledWith({
        userId: 'max', von: '2027-02-22', bis: '2027-02-26', notiz: '', name: 'Brigitte Büro',
      }),
    );
    expect(anlegen).not.toHaveBeenCalled();
    expect(gespeichert).toHaveBeenCalled();
    expect(screen.getByLabelText('Status')).toHaveValue('Anwesend');
    expect(
      (await screen.findAllByText(/Urlaub für Max eingetragen — 4 Tage, 1 schon gebucht und übersprungen/)).length,
    ).toBeGreaterThan(0);
  });

  it('zeigt den Grund des Servers', async () => {
    eintragen.mockRejectedValueOnce(new Error('Im Zeitraum ist kein Arbeitstag mehr frei — an jedem steht schon etwas'));
    zeichne();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Urlaub');
    await userEvent.click(screen.getByRole('button', { name: 'Urlaub eintragen' }));
    expect(await screen.findByText(/kein Arbeitstag mehr frei/)).toBeInTheDocument();
    expect(gespeichert).not.toHaveBeenCalled();
  });

  it('bietet Urlaub beim Bearbeiten eines anderen Eintrags nicht an', () => {
    zeichne({ entry: { id: 'e1', companyId: 'perl', userId: 'max', date: '2027-02-01', status: 'Anwesend',
      startTime: '07:00', endTime: '16:00' } as TimeEntry & { id: string } });
    expect(optionen()).not.toContain('Urlaub');
  });

  it('sperrt einen Tag aus einem genehmigten Antrag', () => {
    zeichne({ entry: { id: 'e1', companyId: 'perl', userId: 'max', date: '2027-02-22', status: 'Urlaub',
      vacationId: 'v1' } as TimeEntry & { id: string } });
    expect(screen.getByText(/gehört zu einem genehmigten Antrag und ändert sich nur über ihn/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
  });

  it('bucht einen ganztägigen Zeitausgleich ohne Uhrzeiten', async () => {
    zeichne({ staff: [max] });
    await userEvent.selectOptions(screen.getByLabelText(/^Mitarbeiter/), 'max');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Zeitausgleich');
    await userEvent.click(screen.getByRole('button', { name: 'Zeit buchen' }));
    await waitFor(() => expect(anlegen).toHaveBeenCalled());
    const eintrag = anlegen.mock.calls[0][1] as TimeEntry;
    expect(eintrag).toMatchObject({ status: 'Zeitausgleich', startTime: '', endTime: '' });
  });
});
