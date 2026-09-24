import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Role, TimeEntry } from '@/types';

/**
 * Krank in der Zeiterfassung — ist eine Krankmeldung.
 *
 * Direkt gebucht stand „Krank" nur im Zeitkonto: nicht im Wochenplan, nicht
 * bei den Krankenständen des Büros. Jetzt legt die Maske eine Krankmeldung
 * an, und ein Tag, der zu einer gehört, wird nur über sie geändert.
 */

const anlegen = vi.fn<unknown[], Promise<string>>(async () => 'confirmed');
const aendern = vi.fn<unknown[], Promise<string>>(async () => 'confirmed');
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => anlegen(...a),
  updateTimeEntryOhneEmpfang: (...a: unknown[]) => aendern(...a),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
const melden = vi.fn();
vi.mock('@/lib/db/abwesenheiten', () => ({
  krankmeldungSpeichern: (...a: unknown[]) => melden(...a),
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert = {
  user: { uid: 'ich', name: 'Max Monteur', role: 'Mitarbeiter' as Role, companyId: 'perl' },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

const gespeichert = vi.fn();

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
  melden.mockReset();
  melden.mockResolvedValue({ id: 'k1', angelegt: 3, entfernt: 0, uebersprungen: 0 });
  authWert.user = { ...authWert.user, role: 'Mitarbeiter' };
});

describe('Krank in der Zeiterfassung', () => {
  it('legt eine Krankmeldung über mehrere Tage an — keinen Zeiteintrag', async () => {
    zeichne();
    await userEvent.clear(screen.getByLabelText(/^Datum/));
    await userEvent.type(screen.getByLabelText(/^Datum/), '2026-10-05');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Krank');
    const bis = screen.getByLabelText(/^Krank bis/);
    expect(bis).toHaveValue('2026-10-05');
    await userEvent.clear(bis);
    await userEvent.type(bis, '2026-10-07');
    await userEvent.type(screen.getByLabelText(/keine Diagnose/), 'Arzt ab Montag');
    await userEvent.click(screen.getByRole('button', { name: 'Krank melden' }));
    await waitFor(() =>
      expect(melden).toHaveBeenCalledWith({
        userId: null, von: '2026-10-05', bis: '2026-10-07', notiz: 'Arzt ab Montag', melderName: 'Max Monteur',
      }),
    );
    expect(anlegen).not.toHaveBeenCalled();
    expect(gespeichert).toHaveBeenCalled();
    expect(screen.getByLabelText('Status')).toHaveValue('Anwesend');
    expect((await screen.findAllByText(/Krankmeldung erfasst/)).length).toBeGreaterThan(0);
  });

  it('das Büro meldet für den gewählten Mitarbeiter krank', async () => {
    authWert.user = { ...authWert.user, role: 'Buchhaltung' };
    zeichne({ staff: [{ id: 'm', uid: 'max', name: 'Max', role: 'Mitarbeiter', companyId: 'perl', email: '' } as AppUser] });
    await userEvent.selectOptions(screen.getByLabelText(/^Mitarbeiter/), 'max');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Krank');
    await userEvent.click(screen.getByRole('button', { name: 'Krank melden' }));
    await waitFor(() => expect(melden).toHaveBeenCalledWith(expect.objectContaining({ userId: 'max' })));
    expect((await screen.findAllByText(/Krankmeldung für Max erfasst/)).length).toBeGreaterThan(0);
  });

  it('zeigt den Grund des Servers, etwa eine Überschneidung', async () => {
    melden.mockRejectedValueOnce(new Error('Überschneidet sich mit der Krankmeldung vom 05.10.2026 bis 07.10.2026'));
    zeichne();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Krank');
    await userEvent.click(screen.getByRole('button', { name: 'Krank melden' }));
    expect(await screen.findByText(/Überschneidet sich/)).toBeInTheDocument();
    expect(gespeichert).not.toHaveBeenCalled();
  });

  it('bietet „Krank" beim Bearbeiten eines anderen Eintrags nicht an', () => {
    zeichne({ entry: { id: 'e1', companyId: 'perl', userId: 'ich', date: '2026-10-01', status: 'Anwesend',
      startTime: '07:00', endTime: '16:00' } as TimeEntry & { id: string } });
    expect(optionen()).not.toContain('Krank');
  });

  it('sperrt einen Tag, der zu einer Krankmeldung gehört', async () => {
    zeichne({ entry: { id: 'e1', companyId: 'perl', userId: 'ich', date: '2026-10-05', status: 'Krank',
      krankmeldungId: 'k1' } as TimeEntry & { id: string } });
    expect(screen.getByText(/gehört zu einer Krankmeldung und wird nur über sie geändert/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeDisabled();
    expect(aendern).not.toHaveBeenCalled();
  });
});
