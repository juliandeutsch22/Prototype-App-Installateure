import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser } from '@/types';

/**
 * Was der Monteur im Keller liest.
 *
 * DIE MELDUNG IST DER GANZE PUNKT. Ob eine Buchung wartet oder angekommen ist,
 * sieht man ihr nicht an — die App muss es sagen, und sie muss dabei die
 * Wahrheit sagen. Sechs Stufen lang stand dort „wird automatisch gesendet",
 * während nichts vorgemerkt war und die Buchung verlorenging.
 *
 * Geprüft wird hier die MASKE, nicht das Ausgangsfach: dass sie den Stand, den
 * die Datenschicht zurückgibt, in den richtigen Satz übersetzt.
 * `tests/supabase/ohneEmpfang.test.ts` prüft, dass der Stand stimmt.
 */

const MONTEUR = 'u1';
const buchen = vi.fn(async () => 'confirmed');

vi.mock('@/lib/db/timeEntries', () => ({
  createTimeEntryOhneEmpfang: (...a: unknown[]) => buchen(...(a as [])),
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

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TimeForm onSaved={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function buchenKlicken() {
  fireEvent.click(screen.getByRole('button', { name: /buchen|speichern/i }));
  await waitFor(() => expect(buchen).toHaveBeenCalled());
}

beforeEach(() => {
  buchen.mockReset();
});

describe('Die Maske meldet, was wirklich geschah', () => {
  it('sagt „wird automatisch gesendet", wenn die Buchung vorgemerkt ist', async () => {
    buchen.mockResolvedValue('queued');
    zeichne();
    await buchenKlicken();

    expect(await screen.findByText(/wird automatisch gesendet/)).toBeInTheDocument();
  });

  it('verspricht nichts, wenn die Buchung angekommen ist', async () => {
    /*
      DIE GEGENPROBE, und sie ist keine Formsache: ein „wird nachgesendet" über
      einer längst geschriebenen Buchung lässt den Monteur warten, ob sie
      ankommt — und beim nächsten Mal glaubt er dem Satz auch dann nicht, wenn
      er stimmt.
    */
    buchen.mockResolvedValue('confirmed');
    zeichne();
    await buchenKlicken();

    expect(await screen.findByText(/^Zeit gebucht$/)).toBeInTheDocument();
    expect(screen.queryByText(/wird automatisch gesendet/)).not.toBeInTheDocument();
  });
});
