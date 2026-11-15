import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

/**
 * K6 (Durchsicht 15.11.2026): wird die Zwei-Faktor-Pflicht eingeschaltet,
 * während die Buchhalterin angemeldet ist, führt die App sie sofort zur
 * Einrichtung — statt sie bis zum Erneuern des Tokens (bis zu einer Stunde)
 * in einer leeren App arbeiten zu lassen.
 *
 * GEGENPROBE (Erwartung): ohne den Effekt in `AuthContext` fragt die App
 * den Bedarf nur beim Anmeldeereignis — „beim Zurückkommen“ und „jede
 * Minute“ sind rot; „ein Monteur“ ist in beiden Fassungen grün.
 */

const bedarf = vi.fn<() => Promise<string>>(async () => 'keiner');
let rolle = 'Buchhaltung';

vi.mock('@/lib/auth/sitzung', async () => {
  const kern = await import('@/lib/auth/kern');
  const profil = () => ({
    uid: 'b1', email: 'eva@perl.at', name: 'Eva Buch', role: rolle, companyId: 'perl', docId: 'b1',
  });
  return {
    zweiterFaktorBedarf: () => bedarf(),
    InactiveUserError: kern.InactiveUserError,
    beiAenderung: (ruf: (w: unknown) => void) => {
      ruf({ uid: 'b1', email: 'eva@perl.at', sitzung: 'token-1' });
      return () => undefined;
    },
    istPlattformAdmin: () => Promise.resolve(false),
    abmelden: vi.fn(async () => undefined),
    sitzungAnderswoBeendet: () => Promise.resolve(false),
    anmelden: vi.fn(),
    passwortZuruecksetzen: vi.fn(),
    profilSchnell: () => Promise.resolve(profil()),
    profilVomServer: () => Promise.resolve(profil()),
    firmaSchnell: () => Promise.resolve(null),
    profilMerken: vi.fn(),
  };
});
vi.mock('@/lib/db/company', () => ({ getCompany: () => Promise.resolve(null) }));
vi.mock('@/lib/tenant', () => ({ applyBranding: vi.fn() }));
vi.mock('@/lib/db/support', () => ({ offeneFreigaben: () => Promise.resolve([]), zugriffMelden: vi.fn() }));
vi.mock('@/lib/push', () => ({ disablePush: vi.fn(async () => undefined) }));

const { AuthProvider, useAuth } = await import('@/app/AuthContext');

function Ansicht() {
  const { user, zweiterFaktor } = useAuth();
  if (zweiterFaktor !== 'keiner') return <p>Zweiter Faktor: {zweiterFaktor}</p>;
  return <p>{user ? `angemeldet als ${user.name}` : 'abgemeldet'}</p>;
}

let takte: Array<() => void> = [];

beforeEach(() => {
  bedarf.mockReset().mockResolvedValue('keiner');
  rolle = 'Buchhaltung';
  takte = [];
  const echt = window.setInterval.bind(window);
  vi.spyOn(window, 'setInterval').mockImplementation(((fn: () => void, ms?: number) => {
    if (ms === 60_000) {
      takte.push(fn);
      return 4711;
    }
    return echt(fn, ms);
  }) as typeof window.setInterval);
});

afterEach(() => vi.restoreAllMocks());

async function angemeldet() {
  render(<AuthProvider><Ansicht /></AuthProvider>);
  expect(await screen.findByText('angemeldet als Eva Buch')).toBeInTheDocument();
}

describe('Die Pflicht mitten in der Sitzung', () => {
  it('beim Zurückkommen in den Vordergrund: fehlt der Faktor jetzt, steht die Einrichtung da', async () => {
    await angemeldet();
    bedarf.mockResolvedValue('einrichten');
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(await screen.findByText('Zweiter Faktor: einrichten')).toBeInTheDocument();
  });

  it('jede Minute, solange die App sichtbar ist — auch ohne dass jemand wegschaut', async () => {
    await angemeldet();
    await waitFor(() => expect(takte).toHaveLength(1));
    bedarf.mockResolvedValue('einrichten');
    await act(async () => { takte[0](); });
    expect(await screen.findByText('Zweiter Faktor: einrichten')).toBeInTheDocument();
  });

  it('bleibt gleich, solange kein Faktor fehlt: die App läuft weiter', async () => {
    await angemeldet();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('angemeldet als Eva Buch')).toBeInTheDocument();
  });

  it('ein Monteur fällt nicht unter die Pflicht — für ihn wird nicht nachgefragt', async () => {
    rolle = 'Mitarbeiter';
    render(<AuthProvider><Ansicht /></AuthProvider>);
    await screen.findByText('angemeldet als Eva Buch');
    const nachAnmeldung = bedarf.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(bedarf.mock.calls.length).toBe(nachAnmeldung);
    expect(takte).toHaveLength(0);
  });
});
