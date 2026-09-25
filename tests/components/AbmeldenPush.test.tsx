import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Prüflauf 25.09.2026, P1-18: Abmelden meldet auch das Gerät von Push ab.
 *
 * Vorher blieb die Push-Marke beim abgemeldeten Konto stehen. Auf dem
 * geteilten Baustellen-Tablet bekam der Kollege, der sich danach anmeldete,
 * die Meldungen des Vorgängers — Abwesenheiten eingeschlossen. Scheitert das
 * Abmelden der Marke, darf das die Abmeldung selbst nicht aufhalten.
 */

const reihenfolge: string[] = [];
const abmelden = vi.fn(async () => {
  reihenfolge.push('abmelden');
});
const disablePush = vi.fn(async (uid: string) => {
  reihenfolge.push(`push:${uid}`);
});

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
    InactiveUserError: kern.InactiveUserError,
    beiAenderung: (ruf: (w: unknown) => void) => {
      ruf({ uid: 'm1', email: 'max@perl.at' });
      return () => undefined;
    },
    istPlattformAdmin: () => Promise.resolve(false),
    abmelden: () => abmelden(),
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
vi.mock('@/lib/push', () => ({ disablePush: (uid: string) => disablePush(uid) }));

const { AuthProvider, useAuth } = await import('@/app/AuthContext');

function Knopf() {
  const { user, signOut } = useAuth();
  if (!user) return <p>keiner</p>;
  return (
    <button type="button" onClick={() => void signOut()}>
      Abmelden
    </button>
  );
}

function zeige() {
  return render(
    <AuthProvider>
      <Knopf />
    </AuthProvider>,
  );
}

beforeEach(() => {
  reihenfolge.length = 0;
  abmelden.mockClear();
  disablePush.mockReset().mockImplementation(async (uid: string) => {
    reihenfolge.push(`push:${uid}`);
  });
});

describe('Abmelden und Push', () => {
  it('meldet zuerst das Gerät von Push ab, dann das Konto', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await waitFor(() => expect(abmelden).toHaveBeenCalled());
    expect(reihenfolge).toEqual(['push:m1', 'abmelden']);
  });

  it('meldet auch dann ab, wenn das Abmelden der Push-Marke scheitert', async () => {
    disablePush.mockRejectedValue(new Error('offline'));
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await waitFor(() => expect(abmelden).toHaveBeenCalled());
  });
});
