import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser } from '@/types';
import { todayStr } from '@/lib/time';

/**
 * DER NÄCHSTE SCHRITT NACH DEM BUCHEN (B5, E83): wer eine Zeit auf eine
 * Baustelle gebucht hat, schreibt oft gleich den Schein. Die Meldung trägt
 * den Weg dorthin — mit Baustelle und Tag.
 */

const buchen = vi.fn(async () => 'confirmed');
vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => buchen(...(a as [])),
  updateTimeEntryOhneEmpfang: vi.fn(async () => 'confirmed'),
  eintraegeAmTag: vi.fn(async () => []),
  eintraegeUmDenTag: vi.fn(async () => []),
  DuplicateEntryError: class extends Error {},
}));
vi.mock('@/components/BaustellenSelect', () => ({ default: () => null }));

let scheineAn = true;
vi.mock('@/lib/useModule', async (orig) => ({
  ...(await orig<typeof import('@/lib/useModule')>()),
  useModul: (m: string) => (m === 'scheine' ? scheineAn : true),
}));

const authWert = {
  user: { uid: 'u1', email: 'max@perl.at', name: 'Max Mustermann', role: 'Mitarbeiter' as const, companyId: 'perl', docId: 'u1' } as unknown as AppUser,
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false, error: null, signIn: vi.fn(), signOut: vi.fn(), resetPassword: vi.fn(), reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: TimeForm } = await import('@/features/time/TimeForm');

function Ziel() {
  const ort = useLocation();
  return <p>Schein für {ort.search}</p>;
}

function zeichne() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/', state: { projectNumber: 'B-001' } }]}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<TimeForm onSaved={vi.fn()} />} />
          <Route path="/worksheet" element={<Ziel />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  buchen.mockReset().mockResolvedValue('confirmed');
  scheineAn = true;
});

describe('Nach dem Buchen: „Schein schreiben“', () => {
  it('die Meldung führt zum Schein dieser Baustelle und dieses Tages', async () => {
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: /buchen|speichern/i }));
    await waitFor(() => expect(buchen).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Schein schreiben' }));
    expect(await screen.findByText(`Schein für ?projekt=B-001&datum=${todayStr()}`)).toBeInTheDocument();
  });

  it('merkt sich die Baustelle als zuletzt benutzt', async () => {
    localStorage.removeItem('senklot:zuletzt-baustelle:perl:u1');
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: /buchen|speichern/i }));
    await waitFor(() => expect(buchen).toHaveBeenCalled());
    await screen.findByText(/^Zeit gebucht$/);
    expect(localStorage.getItem('senklot:zuletzt-baustelle:perl:u1')).toBe('B-001');
  });

  it('Gegenprobe: ohne Scheine im Betrieb keine solche Meldung', async () => {
    scheineAn = false;
    zeichne();
    fireEvent.click(screen.getByRole('button', { name: /buchen|speichern/i }));
    await waitFor(() => expect(buchen).toHaveBeenCalled());
    expect(await screen.findByText(/^Zeit gebucht$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Schein schreiben' })).toBeNull();
  });
});
