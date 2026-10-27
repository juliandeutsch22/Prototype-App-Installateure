import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Testbericht Runde 6, 8.4 (27.10.2026): „Abmelden“ meldet nur dieses Gerät
 * ab, „Auf allen Geräten abmelden“ jedes. Ein Gerät, dessen Anmeldung
 * anderswo beendet wurde, fragt beim Zurückkommen in den Vordergrund nach und
 * zeigt dann die Anmeldemaske mit dem Grund — statt bis zum nächsten
 * Erneuern des Tokens leere Listen.
 */

const abmelden = vi.fn<(ueberall?: boolean) => Promise<void>>(async () => undefined);
const sitzungAnderswoBeendet = vi.fn(async () => false);
let wechsel: (w: unknown) => void = () => undefined;

const PROFIL = {
  uid: 'm1',
  email: 'max@perl.at',
  name: 'Max Mustermann',
  role: 'Mitarbeiter',
  companyId: 'perl',
  docId: 'm1',
};

vi.mock('@/lib/auth/sitzung', async () => {
  const kern = await import('@/lib/auth/kern');
  return {
    zweiterFaktorBedarf: () => Promise.resolve('keiner'),
    InactiveUserError: kern.InactiveUserError,
    beiAenderung: (ruf: (w: unknown) => void) => {
      wechsel = ruf;
      ruf({ uid: 'm1', email: 'max@perl.at' });
      return () => undefined;
    },
    istPlattformAdmin: () => Promise.resolve(false),
    abmelden: (ueberall?: boolean) => abmelden(ueberall),
    sitzungAnderswoBeendet: () => sitzungAnderswoBeendet(),
    anmelden: vi.fn(),
    passwortZuruecksetzen: vi.fn(),
    profilSchnell: () => Promise.resolve(PROFIL),
    profilVomServer: () => Promise.resolve(PROFIL),
    firmaSchnell: () => Promise.resolve(null),
    profilMerken: vi.fn(),
  };
});
vi.mock('@/lib/db/company', () => ({ getCompany: () => Promise.resolve(null) }));
vi.mock('@/lib/tenant', () => ({ applyBranding: vi.fn() }));
vi.mock('@/lib/db/support', () => ({
  offeneFreigaben: () => Promise.resolve([]),
  zugriffMelden: vi.fn(),
}));
vi.mock('@/lib/push', () => ({ disablePush: vi.fn(async () => undefined) }));

const { AuthProvider, useAuth } = await import('@/app/AuthContext');

function Ansicht() {
  const { user, error, signOut } = useAuth();
  if (!user) return <p>{error ?? 'abgemeldet'}</p>;
  return (
    <>
      <button type="button" onClick={() => void signOut()}>Abmelden</button>
      <button type="button" onClick={() => void signOut(true)}>Überall</button>
    </>
  );
}

function zeige() {
  return render(<AuthProvider><Ansicht /></AuthProvider>);
}

async function vordergrund() {
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
}

beforeEach(() => {
  abmelden.mockClear();
  sitzungAnderswoBeendet.mockReset().mockResolvedValue(false);
});

describe('Abmelden: dieses Gerät oder alle', () => {
  it('„Abmelden“ meldet nur dieses Gerät ab', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await waitFor(() => expect(abmelden).toHaveBeenCalledWith(false));
  });

  it('„Auf allen Geräten“ meldet überall ab', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Überall' }));
    await waitFor(() => expect(abmelden).toHaveBeenCalledWith(true));
  });
});

describe('Anderswo abgemeldet', () => {
  it('fragt beim Zurückkommen nach — lebt die Anmeldung, bleibt alles', async () => {
    zeige();
    await screen.findByRole('button', { name: 'Abmelden' });
    await vordergrund();
    await waitFor(() => expect(sitzungAnderswoBeendet).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  });

  it('ist sie anderswo beendet, steht die Anmeldemaske mit dem Grund da', async () => {
    sitzungAnderswoBeendet.mockImplementation(async () => {
      // Wie supabase-js: das lokale Abmelden meldet die Änderung.
      wechsel(null);
      return true;
    });
    zeige();
    await screen.findByRole('button', { name: 'Abmelden' });
    await vordergrund();
    expect(await screen.findByText(/auf einem anderen Gerät beendet/)).toBeInTheDocument();
  });

  it('fragt höchstens einmal je Minute', async () => {
    zeige();
    await screen.findByRole('button', { name: 'Abmelden' });
    await vordergrund();
    await vordergrund();
    await vordergrund();
    await waitFor(() => expect(sitzungAnderswoBeendet).toHaveBeenCalledTimes(1));
  });
});
