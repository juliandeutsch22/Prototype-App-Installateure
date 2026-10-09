import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Termin } from '@/types';

/**
 * „Termin ändern“ im Seitenfenster der Einsatzplanung (Runde 4, Auftrag
 * 4.4). Dasselbe Formular wie in „Tag planen“; wer Termine nur sehen darf,
 * bekommt dasselbe Fenster schreibgeschützt — die Rechte bleiben, wie sie
 * sind (Auftrag 1.5).
 */

vi.mock('@/lib/db/termine', () => ({
  terminAnlegen: vi.fn(async () => 'neu'),
  terminAendern: vi.fn(async () => undefined),
  terminLoeschen: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => []) }));
vi.mock('@/lib/db/projects', () => ({
  listRecentProjects: vi.fn(async () => []),
  listProjectsByNumbers: vi.fn(async () => []),
}));
const authWert = { user: { uid: 'x', companyId: 'perl', name: 'X', role: 'Projektleiter' } };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TerminFenster } = await import('@/features/termine/TerminFenster');

const PERSONEN = [{ uid: 'u1', name: 'Max Mustermann', role: 'Mitarbeiter', active: true }] as AppUser[];
const LIEFERUNG: Termin = {
  id: 't1', companyId: 'perl', art: 'Lieferung', datum: '2026-10-06', zeitVon: '08:00', zeitBis: '10:00',
  projectNumber: 'B-1', teilnehmer: ['u1'], ortName: 'Familie Huber', ortAdresse: 'Ringstraße 3', notiz: 'Zwei Paletten',
};

function zeige(termin: Termin | null) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TerminFenster termin={termin} datum="2026-10-07" personen={PERSONEN} onClose={() => undefined} onGeaendert={() => undefined} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('TerminFenster', () => {
  it('wer Termine schreiben darf: „Termin ändern“ mit dem Formular und „Termin löschen“', () => {
    authWert.user.role = 'Projektleiter';
    zeige(LIEFERUNG);
    const f = within(screen.getByRole('dialog', { name: 'Termin ändern' }));
    expect(f.getByRole('combobox', { name: 'Art' })).toHaveValue('Lieferung');
    expect(f.getByRole('button', { name: 'Änderung speichern' })).toBeInTheDocument();
    expect(f.getByRole('button', { name: /löschen$/ })).toBeInTheDocument();
  });

  it('wer nur sehen darf: dasselbe Fenster schreibgeschützt — die Angaben als Text, kein Speichern, kein Löschen', () => {
    authWert.user.role = 'Buchhaltung';
    zeige(LIEFERUNG);
    const f = within(screen.getByRole('dialog', { name: 'Termin' }));
    expect(f.getByText('Lieferung (Aviso)')).toBeInTheDocument();
    expect(f.getByText('08:00–10:00')).toBeInTheDocument();
    expect(f.getByText(/Familie Huber · B-1/)).toBeInTheDocument();
    expect(f.getByText('Max Mustermann')).toBeInTheDocument();
    expect(f.getByText('Zwei Paletten')).toBeInTheDocument();
    expect(f.queryByRole('combobox')).toBeNull();
    expect(f.queryByRole('textbox')).toBeNull();
    expect(f.queryByRole('button', { name: /speichern|löschen/i })).toBeNull();
  });

  it('„Termin anlegen“ mit dem Tag vorbelegt', () => {
    authWert.user.role = 'Geschäftsführung';
    zeige(null);
    const f = within(screen.getByRole('dialog', { name: 'Termin anlegen' }));
    expect(f.getByLabelText(/^Tag/)).toHaveValue('2026-10-07');
    expect(f.queryByRole('button', { name: /löschen/ })).toBeNull();
  });
});
