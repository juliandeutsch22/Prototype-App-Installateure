import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Role, TimeEntry } from '@/types';
import type { Einstufung } from '@/lib/einstufung';

/**
 * Berufsschule in der Zeiterfassung (Testbericht 30.09.2026, 4.1 Punkt 4).
 *
 * Vorher blieb dem Lehrling nur „Urlaub“ (falsch) oder eine fehlende Buchung,
 * die als offener Tag angemahnt wurde. Jetzt gibt es den Status — nur für
 * Lehrlinge, auch als Zeitraum, eingetragen über die Datenbank.
 */

const anlegen = vi.fn<(...args: unknown[]) => Promise<string>>(async () => 'confirmed');
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => anlegen(...a),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
const eintragen = vi.fn();
vi.mock('@/lib/db/abwesenheiten', () => ({
  berufsschuleEintragen: (...a: unknown[]) => eintragen(...a),
  krankmeldungSpeichern: vi.fn(),
  urlaubEintragen: vi.fn(),
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert: {
  user: { uid: string; name: string; role: Role; companyId: string; einstufung?: Einstufung | null };
  company: { id: string; name: string };
} = {
  user: { uid: 'ich', name: 'Lena Lehrling', role: 'Mitarbeiter', companyId: 'perl', einstufung: 'lehrling' },
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
  gespeichert.mockClear();
  eintragen.mockReset();
  eintragen.mockResolvedValue({ tage: 5, angelegt: 5, uebersprungen: 0 });
  authWert.user = { uid: 'ich', name: 'Lena Lehrling', role: 'Mitarbeiter', companyId: 'perl', einstufung: 'lehrling' };
});

describe('Berufsschule', () => {
  it('trägt einen Blocklehrgang als Zeitraum ein — keinen Zeiteintrag', async () => {
    zeichne();
    await userEvent.clear(screen.getByLabelText(/^Datum/));
    await userEvent.type(screen.getByLabelText(/^Datum/), '2026-10-05');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Berufsschule');
    const bis = screen.getByLabelText(/^Berufsschule bis/);
    expect(bis).toHaveValue('2026-10-05');
    await userEvent.clear(bis);
    await userEvent.type(bis, '2026-10-09');
    await userEvent.click(screen.getByRole('button', { name: 'Berufsschule eintragen' }));
    await waitFor(() =>
      expect(eintragen).toHaveBeenCalledWith({ userId: null, von: '2026-10-05', bis: '2026-10-09', notiz: '' }),
    );
    expect(anlegen).not.toHaveBeenCalled();
    expect(gespeichert).toHaveBeenCalled();
    expect(screen.getByLabelText('Status')).toHaveValue('Anwesend');
    expect((await screen.findAllByText(/Berufsschule eingetragen — 5 Tage/)).length).toBeGreaterThan(0);
  });

  it('gibt es nur für Lehrlinge', () => {
    authWert.user = { ...authWert.user, einstufung: 'facharbeiter' };
    zeichne();
    expect(optionen()).not.toContain('Berufsschule');
  });

  it('das Büro trägt für einen Lehrling ein — und nur für ihn', async () => {
    authWert.user = { uid: 'buero', name: 'Bea Büro', role: 'Buchhaltung', companyId: 'perl', einstufung: null };
    const person = (uid: string, name: string, einstufung: Einstufung | null) =>
      ({ id: uid, uid, name, role: 'Mitarbeiter', companyId: 'perl', email: '', einstufung }) as AppUser;
    zeichne({ staff: [person('lena', 'Lena', 'lehrling'), person('max', 'Max', null)] });
    await userEvent.selectOptions(screen.getByLabelText(/^Mitarbeiter/), 'max');
    expect(optionen()).not.toContain('Berufsschule');
    await userEvent.selectOptions(screen.getByLabelText(/^Mitarbeiter/), 'lena');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Berufsschule');
    await userEvent.click(screen.getByRole('button', { name: 'Berufsschule eintragen' }));
    await waitFor(() => expect(eintragen).toHaveBeenCalledWith(expect.objectContaining({ userId: 'lena' })));
  });

  it('zeigt den Grund des Servers', async () => {
    eintragen.mockRejectedValueOnce(new Error('Selbst eintragen geht bis 14 Tage zurück (ab 16.09.2026). Was davor liegt, trägt das Büro ein.'));
    zeichne();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Berufsschule');
    await userEvent.click(screen.getByRole('button', { name: 'Berufsschule eintragen' }));
    expect(await screen.findByText(/Selbst eintragen geht bis 14 Tage zurück/)).toBeInTheDocument();
    expect(gespeichert).not.toHaveBeenCalled();
  });
});
