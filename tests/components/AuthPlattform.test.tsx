import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * DER WEG DES GLOBALEN ADMINISTRATORS DURCH DIE ANMELDUNG.
 *
 * AUS DEM BETRIEB GEMELDET, 09.09.2026: „Ich habe einen globalen Admin nach
 * deiner Anleitung angelegt, aber es kam diese Meldung" — „Die Anmeldedaten
 * konnten nicht geladen werden. Das liegt meist am Empfang."
 *
 * Der globale Administrator hat absichtlich kein `users`-Dokument. Die Regel
 * dafür lautet `allow read: if ownsExisting()`, und die liest
 * `resource.data.companyId`. Bei einem Dokument, das es NICHT GIBT, ist
 * `resource` leer: die Regel ist nicht erfüllt, und Firestore antwortet mit
 * PERMISSION_DENIED. `getDoc` liefert also keinen leeren Schnappschuss,
 * sondern WIRFT.
 *
 * Die Prüfung auf den Claim stand hinter dem Abruf, im Zweig „kein Profil
 * gefunden". Dorthin kam er nie — der Fehler landete im Auffangblock, und auf
 * dem Anmeldebildschirm stand eine Meldung, die auf ein Netzproblem zeigt, wo
 * keines ist.
 *
 * WARUM DIESE DATEI ÜBERHAUPT ENTSTEHT. `AuthContext` war die letzte
 * ungeprüfte tragende Datei der App. Der Fehler war eine Frage der
 * REIHENFOLGE, nicht der Formel — eine reine Funktion hätte ihn nicht fangen
 * können. Deshalb wird hier der echte Provider gefahren, mit einem
 * nachgebauten Firebase darunter.
 */

/** Was `getDoc` tut, wenn nach dem users-Dokument gefragt wird. */
let usersAbruf: () => Promise<unknown> = () =>
  Promise.reject(new Error('FirebaseError: Missing or insufficient permissions.'));
const gefragtNach = vi.fn();

/** Die Claims des angemeldeten Kontos. */
let claims: Record<string, unknown> = {};
let abgemeldet = false;

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    cb({
      uid: 'global',
      email: 'betreiber@example.at',
      getIdTokenResult: () => Promise.resolve({ claims }),
    });
    return () => undefined;
  },
  signOut: () => {
    abgemeldet = true;
    return Promise.resolve();
  },
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  browserLocalPersistence: {},
  browserSessionPersistence: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, sammlung: string, id: string) => ({ sammlung, id }),
  getDoc: (ref: { sammlung: string }) => {
    gefragtNach(ref.sammlung);
    return usersAbruf();
  },
  // Der Zwischenspeicher ist auf einem frischen Gerät leer — wie bei Google
  // ist das ein Fehler, keine Leere.
  getDocFromCache: () => Promise.reject(new Error('Failed to get document from cache.')),
}));

vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }));
vi.mock('@/lib/db/company', () => ({ getCompany: () => Promise.resolve(null) }));
vi.mock('@/lib/tenant', () => ({ applyBranding: vi.fn() }));

const { AuthProvider, useAuth } = await import('@/app/AuthContext');

function Anzeige() {
  const { plattformAdmin, loading, error, user } = useAuth();
  if (loading) return <p>lädt</p>;
  return (
    <div>
      <p>plattform: {String(plattformAdmin)}</p>
      <p>benutzer: {user ? user.name : 'keiner'}</p>
      {error && <p>fehler: {error}</p>}
    </div>
  );
}

function zeige() {
  return render(
    <AuthProvider>
      <Anzeige />
    </AuthProvider>,
  );
}

beforeEach(() => {
  claims = {};
  abgemeldet = false;
  gefragtNach.mockClear();
  usersAbruf = () =>
    Promise.reject(new Error('FirebaseError: Missing or insufficient permissions.'));
});

describe('Anmeldung als globaler Administrator', () => {
  it('kommt hinein, obwohl es kein Benutzerprofil gibt', async () => {
    /*
      DER GEMELDETE FEHLER. Vorher stand hier „Die Anmeldedaten konnten nicht
      geladen werden. Das liegt meist am Empfang" — und das Konto blieb
      draussen.
    */
    claims = { plattformAdmin: true };
    zeige();

    expect(await screen.findByText('plattform: true')).toBeInTheDocument();
    expect(screen.queryByText(/fehler:/)).not.toBeInTheDocument();
    expect(screen.getByText('benutzer: keiner')).toBeInTheDocument();
  });

  it('fragt gar nicht erst nach dem users-Dokument', async () => {
    // Es gibt keines, und die Regel weist die Frage danach ab. Sie zu stellen
    // hiesse, eine Absage einzuholen, um sie dann zu deuten.
    claims = { plattformAdmin: true };
    zeige();

    await screen.findByText('plattform: true');
    expect(gefragtNach).not.toHaveBeenCalled();
  });

  it('meldet ihn nicht ab', async () => {
    // Der Zweig „kein Profil" wirft das Konto hinaus. Für dieses Konto wäre
    // das eine Endlosschleife: anmelden, hinausgeworfen werden, von vorn.
    claims = { plattformAdmin: true };
    zeige();

    await screen.findByText('plattform: true');
    expect(abgemeldet).toBe(false);
  });

  it('zählt nur der echte Claim, nicht ein ähnlich aussehender Wert', async () => {
    claims = { plattformAdmin: 'ja' };
    zeige();

    expect(await screen.findByText(/fehler:/)).toBeInTheDocument();
    expect(screen.getByText('plattform: false')).toBeInTheDocument();
  });
});

describe('Anmeldung ohne diesen Claim', () => {
  it('sagt weiterhin, wenn die Abfrage wirklich scheitert', async () => {
    /*
      Die Meldung bleibt für den Fall, für den sie gedacht war: erste
      Anmeldung auf einem Gerät, und das Netz antwortet nicht. Sie darf nur
      nicht mehr für ein Konto erscheinen, dem gar nichts fehlt.
    */
    zeige();
    expect(await screen.findByText(/fehler:/)).toBeInTheDocument();
    expect(screen.getByText('plattform: false')).toBeInTheDocument();
  });

  it('lässt einen gewöhnlichen Benutzer unverändert durch', async () => {
    usersAbruf = () =>
      Promise.resolve({
        exists: () => true,
        id: 'u1',
        data: () => ({
          name: 'Max Mustermann',
          role: 'Mitarbeiter',
          companyId: 'perl',
          email: 'max@perl.at',
        }),
      });
    zeige();

    await waitFor(() => expect(screen.getByText('benutzer: Max Mustermann')).toBeInTheDocument());
    expect(screen.getByText('plattform: false')).toBeInTheDocument();
    expect(screen.queryByText(/fehler:/)).not.toBeInTheDocument();
  });
});
