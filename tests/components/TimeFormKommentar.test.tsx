import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Role } from '@/types';

/**
 * Das Kommentarfeld sagt, dass es auf den Schein geht (offene Punkte A6).
 *
 * Der Handwerksschein desselben Tages schlägt den Kommentar der eigenen
 * Buchung als Tätigkeit vor — auf einem Beleg, den der Kunde unterschreibt.
 * Das Feld sagt das, aber nur dort, wo es stimmt.
 */

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: vi.fn(),
  updateTimeEntryOhneEmpfang: vi.fn(),
  eintraegeAmTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/lib/db/abwesenheiten', () => ({ krankmeldungSpeichern: vi.fn() }));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

const authWert: {
  user: { uid: string; name: string; role: Role; companyId: string };
  company: { id: string; name: string; modules?: Record<string, boolean> };
} = {
  user: { uid: 'ich', name: 'Max Monteur', role: 'Mitarbeiter', companyId: 'perl' },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authWert.company = { id: 'perl', name: 'Perl Installationen' };
});

describe('Das Kommentarfeld der Zeitbuchung', () => {
  it('sagt bei einer Anwesenheit, dass der Text am Schein vorgeschlagen wird', () => {
    zeichne();
    expect(screen.getByLabelText('Kommentar / Tätigkeiten (wird am Schein vorgeschlagen)')).toBeInTheDocument();
  });

  it('Gegenprobe: ohne Handwerksscheine sagt es das nicht', () => {
    authWert.company = { ...authWert.company, modules: { scheine: false } };
    zeichne();
    expect(screen.getByLabelText('Kommentar / Tätigkeiten')).toBeInTheDocument();
  });

  it('bei Krank bleibt es die Anmerkung ohne Diagnose', async () => {
    zeichne();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Krank');
    expect(screen.getByLabelText('Anmerkung (freiwillig, keine Diagnose)')).toBeInTheDocument();
  });
});
