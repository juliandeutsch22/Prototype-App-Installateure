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

/*
  SEIT DEM 14.09.2026 GEGEN DIE NAHT, NICHT GEGEN FIREBASE.

  `AuthContext` spricht nicht mehr mit einem SDK, sondern mit
  `lib/auth/sitzung` — und die entscheidet, ob Firebase oder Supabase
  antwortet. Damit prüft diese Datei, was sie immer prüfen wollte: die
  REIHENFOLGE der Entscheidungen im Provider, unabhängig davon, wer darunter
  liegt. Vorher war sie an Firebase gebunden und hätte nach dem Umschalten
  eine Frage beantwortet, die niemand mehr stellt.
*/

/** Was der Profilabruf tut. Vorgabe: abgewiesen, wie bei einem Konto ohne Zeile. */
let profilAbruf: () => Promise<unknown> = () =>
  Promise.reject(new Error('Missing or insufficient permissions.'));
const gefragtNachProfil = vi.fn();

/** Trägt das Token den Plattform-Anspruch? */
let plattform = false;
let abgemeldet = false;

vi.mock('@/lib/auth/sitzung', async () => {
  const kern = await import('@/lib/auth/kern');
  return {
    InactiveUserError: kern.InactiveUserError,
    beiAenderung: (ruf: (w: unknown) => void) => {
      ruf({ uid: 'global', email: 'betreiber@example.at' });
      return () => undefined;
    },
    istPlattformAdmin: () => Promise.resolve(plattform),
    abmelden: () => {
      abgemeldet = true;
      return Promise.resolve();
    },
    anmelden: vi.fn(),
    passwortZuruecksetzen: vi.fn(),
    profilSchnell: () => Promise.resolve(null),
    profilVomServer: () => {
      gefragtNachProfil();
      return profilAbruf();
    },
    firmaSchnell: () => Promise.resolve(null),
    profilMerken: vi.fn(),
  };
});

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
  plattform = false;
  abgemeldet = false;
  gefragtNachProfil.mockClear();
  profilAbruf = () => Promise.reject(new Error('Missing or insufficient permissions.'));
});

describe('Anmeldung als globaler Administrator', () => {
  it('kommt hinein, obwohl es kein Benutzerprofil gibt', async () => {
    /*
      DER GEMELDETE FEHLER. Vorher stand hier „Die Anmeldedaten konnten nicht
      geladen werden. Das liegt meist am Empfang" — und das Konto blieb
      draussen.
    */
    plattform = true;
    zeige();

    expect(await screen.findByText('plattform: true')).toBeInTheDocument();
    expect(screen.queryByText(/fehler:/)).not.toBeInTheDocument();
    expect(screen.getByText('benutzer: keiner')).toBeInTheDocument();
  });

  it('fragt gar nicht erst nach dem users-Dokument', async () => {
    // Es gibt keines, und die Regel weist die Frage danach ab. Sie zu stellen
    // hiesse, eine Absage einzuholen, um sie dann zu deuten.
    plattform = true;
    zeige();

    await screen.findByText('plattform: true');
    expect(gefragtNachProfil).not.toHaveBeenCalled();
  });

  it('meldet ihn nicht ab', async () => {
    // Der Zweig „kein Profil" wirft das Konto hinaus. Für dieses Konto wäre
    // das eine Endlosschleife: anmelden, hinausgeworfen werden, von vorn.
    plattform = true;
    zeige();

    await screen.findByText('plattform: true');
    expect(abgemeldet).toBe(false);
  });

  it('ohne Anspruch geht er den gewöhnlichen Weg — und bekommt dessen Meldung', async () => {
    /*
      Die Gegenprobe. Wer den Anspruch NICHT trägt, soll nicht versehentlich
      hineinkommen, sondern am fehlenden Profil scheitern — mit der Meldung,
      die dafür da ist.

      Dass nur der WÖRTLICHE Anspruch zählt und nicht ein ähnlich aussehender
      Wert, entscheidet seit dem 14.09.2026 die Naht und nicht mehr diese
      Datei; geprüft wird es in `tests/unit/plattformAnspruch.test.ts`, für
      beide Anmeldungen einzeln.
    */
    plattform = false;
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
    // Die Naht liefert ein fertiges Profil — welche Datenbank es geformt hat,
    // ist an dieser Stelle bewusst nicht mehr zu sehen.
    profilAbruf = () =>
      Promise.resolve({
        uid: 'u1',
        docId: 'u1',
        name: 'Max Mustermann',
        role: 'Mitarbeiter',
        companyId: 'perl',
        email: 'max@perl.at',
      });
    zeige();

    await waitFor(() => expect(screen.getByText('benutzer: Max Mustermann')).toBeInTheDocument());
    expect(screen.getByText('plattform: false')).toBeInTheDocument();
    expect(screen.queryByText(/fehler:/)).not.toBeInTheDocument();
  });
});
