import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * DER APP-START FRAGT EINMAL (Ladezeit, 19.10.2026).
 *
 * Gemessen im Wasserfall der Startseite: Zweitfaktor, Profil und Firma kamen
 * je zweimal über das Netz. Supabase meldet beim Start dieselbe Sitzung
 * zweimal kurz hintereinander (`INITIAL_SESSION`, dann `SIGNED_IN`), und jede
 * Meldung lud alles. Dazu warteten Profil und Firma hinter der Frage nach dem
 * zweiten Faktor.
 *
 * Gegenprobe: gegen den Stand davor ist das Profil zweimal gefragt und erst,
 * wenn der zweite Faktor geantwortet hat (rot). Gleich bleibt: ein neues
 * Token lädt nach, und wem der zweite Faktor fehlt, der bekommt kein Profil.
 */

type Wer = { uid: string; email: string; sitzung?: string } | null;
let ruf: ((w: Wer) => void) | null = null;
const profilVomServer = vi.fn(async () => ({
  uid: 'u1', docId: 'u1', email: 'gf@perl.at', name: 'Chefin', role: 'Geschäftsführung', companyId: 'perl',
}));
let faktorFertig: ((b: string) => void) | null = null;
let bedarfSofort: string | null = 'keiner';
const zweiterFaktorBedarf = vi.fn(() =>
  bedarfSofort ? Promise.resolve(bedarfSofort) : new Promise<string>((r) => { faktorFertig = r; }));

vi.mock('@/lib/auth/sitzung', async () => {
  const kern = await import('@/lib/auth/kern');
  return {
    zweiterFaktorBedarf: () => zweiterFaktorBedarf(),
    InactiveUserError: kern.InactiveUserError,
    beiAenderung: (r: typeof ruf) => {
      ruf = r;
      return () => undefined;
    },
    istPlattformAdmin: () => Promise.resolve(false),
    abmelden: vi.fn(),
    anmelden: vi.fn(),
    passwortZuruecksetzen: vi.fn(),
    profilSchnell: () => Promise.resolve(null),
    profilVomServer: () => profilVomServer(),
    firmaSchnell: () => Promise.resolve(null),
    profilMerken: vi.fn(),
  };
});
vi.mock('@/lib/db/company', () => ({ getCompany: () => Promise.resolve({ id: 'perl', name: 'Perl Installationen' }) }));
vi.mock('@/lib/tenant', () => ({ applyBranding: vi.fn() }));
vi.mock('@/lib/db/support', () => ({ offeneFreigaben: vi.fn(), zugriffMelden: vi.fn() }));
vi.mock('@/lib/db/pg/ohneEmpfang', () => ({ ausgangsfachKonto: vi.fn() }));

const { AuthProvider, useAuth } = await import('@/app/AuthContext');

function Anzeige() {
  const { user, loading, zweiterFaktor } = useAuth();
  if (loading) return <p>lädt</p>;
  return <p>{user ? `angemeldet: ${user.name}` : `ohne Profil (${zweiterFaktor})`}</p>;
}

const zeige = () => render(<MemoryRouter><AuthProvider><Anzeige /></AuthProvider></MemoryRouter>);
const ruhe = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => {
  profilVomServer.mockClear();
  zweiterFaktorBedarf.mockClear();
  bedarfSofort = 'keiner';
  faktorFertig = null;
});

describe('App-Start', () => {
  it('dieselbe Sitzung zweimal zugleich gemeldet: Zweitfaktor und Profil einmal gefragt', async () => {
    zeige();
    await act(async () => {
      ruf!({ uid: 'u1', email: 'gf@perl.at', sitzung: 'token-1' });
      ruf!({ uid: 'u1', email: 'gf@perl.at', sitzung: 'token-1' });
    });
    await ruhe();
    expect(await screen.findByText('angemeldet: Chefin')).toBeInTheDocument();
    expect(zweiterFaktorBedarf).toHaveBeenCalledTimes(1);
    expect(profilVomServer).toHaveBeenCalledTimes(1);
  });

  it('Gleichbleiben: ein neues Token zieht nach, auch während der erste Lauf noch geht', async () => {
    zeige();
    await act(async () => {
      ruf!({ uid: 'u1', email: 'gf@perl.at', sitzung: 'token-1' });
      ruf!({ uid: 'u1', email: 'gf@perl.at', sitzung: 'token-2' });
    });
    await ruhe();
    expect(profilVomServer).toHaveBeenCalledTimes(2);
  });

  it('Gleichbleiben: dieselbe Sitzung später noch einmal gemeldet (Tab zurück) — still nachgezogen wie bisher', async () => {
    zeige();
    await act(async () => { ruf!({ uid: 'u1', email: 'gf@perl.at', sitzung: 'token-1' }); });
    await ruhe();
    await act(async () => { ruf!({ uid: 'u1', email: 'gf@perl.at', sitzung: 'token-1' }); });
    await ruhe();
    expect(profilVomServer).toHaveBeenCalledTimes(2);
  });

  it('das Profil ist schon unterwegs, während der zweite Faktor gefragt wird', async () => {
    bedarfSofort = null;
    zeige();
    await act(async () => { ruf!({ uid: 'u1', email: 'gf@perl.at', sitzung: 'token-1' }); });
    await ruhe();
    expect(faktorFertig).not.toBeNull();
    expect(profilVomServer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('lädt')).toBeInTheDocument();
    await act(async () => { faktorFertig!('keiner'); });
    expect(await screen.findByText('angemeldet: Chefin')).toBeInTheDocument();
  });

  it('Gleichbleiben: fehlt der zweite Faktor, wird das vorab geholte Profil verworfen', async () => {
    bedarfSofort = null;
    zeige();
    await act(async () => { ruf!({ uid: 'u1', email: 'gf@perl.at', sitzung: 'token-1' }); });
    await ruhe();
    await act(async () => { faktorFertig!('einrichten'); });
    await ruhe();
    expect(screen.getByText('ohne Profil (einrichten)')).toBeInTheDocument();
  });
});
