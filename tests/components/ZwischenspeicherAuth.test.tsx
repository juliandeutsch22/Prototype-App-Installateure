import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

/**
 * DER ZWISCHENSPEICHER GEHÖRT DEM, DER ANGEMELDET IST (Stufe 3).
 *
 * Auf dem geteilten Werkstatt-Tablet meldet sich nach der Geschäftsführung
 * der Monteur an. Was sie zuletzt gesehen hat, darf ihm nicht aus dem
 * Zwischenspeicher entgegenkommen. `AuthContext` meldet jeden Wechsel an
 * `zwischenspeicherFuer`; hier wird geprüft, dass er es auch tut.
 *
 * Gegenprobe: ohne den Layout-Effekt im `AuthContext` bleibt der Stand des
 * Vorgängers stehen.
 */

const PROFIL = {
  uid: 'gf1',
  email: 'chefin@perl.at',
  name: 'Eva Perl',
  role: 'Geschäftsführung',
  companyId: 'perl',
  docId: 'gf1',
};

let melden: ((w: unknown) => void) | null = null;

vi.mock('@/lib/auth/sitzung', async () => {
  const kern = await import('@/lib/auth/kern');
  return {
    zweiterFaktorBedarf: () => Promise.resolve('keiner'),
    InactiveUserError: kern.InactiveUserError,
    beiAenderung: (ruf: (w: unknown) => void) => {
      melden = ruf;
      ruf({ uid: 'gf1', email: 'chefin@perl.at' });
      return () => undefined;
    },
    istPlattformAdmin: () => Promise.resolve(false),
    abmelden: vi.fn(async () => undefined),
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

const { AuthProvider, useAuth } = await import('@/app/AuthContext');
const { liveGeneration, liveLesen, liveMerken, speicherNutzer } = await import('@/lib/liveSpeicher');

function Wer() {
  const { user } = useAuth();
  return <p>{user ? user.name : 'keiner'}</p>;
}

describe('Zwischenspeicher und Anmeldung', () => {
  it('gehört dem Angemeldeten — und ist nach dem Abmelden leer', async () => {
    render(
      <AuthProvider>
        <Wer />
      </AuthProvider>,
    );
    expect(await screen.findByText('Eva Perl')).toBeInTheDocument();
    expect(speicherNutzer()).toBe('gf1@perl');

    // Was die Geschäftsführung gesehen hat.
    liveMerken('invoices|perl|{}', [{ id: 'r1' }], liveGeneration());
    expect(liveLesen('invoices|perl|{}')).toEqual([{ id: 'r1' }]);

    // Die Sitzung endet.
    await act(async () => { melden?.(null); });
    expect(await screen.findByText('keiner')).toBeInTheDocument();
    expect(speicherNutzer()).toBeNull();
    expect(liveLesen('invoices|perl|{}')).toBeUndefined();
  });
});
