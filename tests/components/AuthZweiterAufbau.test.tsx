import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Testbericht 30.09.2026, H9 — Klicks und Eingaben gehen nach dem Laden
 * verloren.
 *
 * GEMESSEN (im Code nachgestellt): die Anmeldung meldet sich beim Start und
 * danach mehrmals (erste Sitzung, Anmeldung, jede Token-Erneuerung, beim
 * Zurückkehren in den Tab). Jede Meldung setzte `loading` wieder auf wahr —
 * und `RequireAuth` zeigt dann nur den Ladebalken: die ganze Seite wurde
 * abgebaut und neu aufgebaut. Getippter Text war weg, ein Klick in diesem
 * Moment traf nichts. Danach kamen Profil und Firma als NEUE Objekte, und
 * jede Ansicht, die an ihnen hängt, lud und setzte ihr Formular neu.
 */

let ruf: ((w: { uid: string; email: string } | null) => void) | null = null;
const profil = () => ({
  uid: 'u1', docId: 'u1', email: 'max@perl.at', name: 'Max', role: 'Buchhaltung', companyId: 'perl',
});
const firma = () => ({ id: 'perl', name: 'Perl Installationen' });

vi.mock('@/lib/auth/sitzung', async () => {
  const kern = await import('@/lib/auth/kern');
  return {
    InactiveUserError: kern.InactiveUserError,
    beiAenderung: (r: typeof ruf) => {
      ruf = r;
      r!({ uid: 'u1', email: 'max@perl.at' });
      return () => undefined;
    },
    // Wie im Betrieb: eine Netzrunde, bevor die Antwort da ist.
    istPlattformAdmin: () => new Promise((r) => setTimeout(() => r(false), 30)),
    abmelden: vi.fn(),
    anmelden: vi.fn(),
    passwortZuruecksetzen: vi.fn(),
    // Jedes Mal ein NEUES Objekt mit demselben Inhalt — wie aus Speicher und Netz.
    profilSchnell: () => Promise.resolve(profil()),
    profilVomServer: () => Promise.resolve(profil()),
    firmaSchnell: () => Promise.resolve(firma()),
    profilMerken: vi.fn(),
  };
});
vi.mock('@/lib/db/company', () => ({ getCompany: () => Promise.resolve(firma()) }));
vi.mock('@/lib/tenant', () => ({ applyBranding: vi.fn() }));
vi.mock('@/lib/db/support', () => ({ offeneFreigaben: vi.fn(), zugriffMelden: vi.fn() }));
vi.mock('@/lib/db/pg/ohneEmpfang', () => ({ ausgangsfachKonto: vi.fn() }));

const { AuthProvider, useAuth } = await import('@/app/AuthContext');
const { RequireAuth } = await import('@/app/guards');

let aufgebaut = 0;
let geladen = 0;

/** Eine Ansicht, wie viele in der App: lädt an `user` und `company`, hat ein Feld. */
function Formular() {
  const { user, company } = useAuth();
  const [wofuer, setWofuer] = useState('');
  useEffect(() => {
    aufgebaut += 1;
  }, []);
  useEffect(() => {
    geladen += 1;
  }, [user, company]);
  return (
    <label>
      Wofür
      <input value={wofuer} onChange={(e) => setWofuer(e.target.value)} />
    </label>
  );
}

function zeige() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RequireAuth>
          <Formular />
        </RequireAuth>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  aufgebaut = 0;
  geladen = 0;
});

describe('Eine weitere Meldung der Anmeldung für denselben Nutzer', () => {
  it('baut die Seite nicht ab — Getipptes bleibt stehen', async () => {
    zeige();
    const feld = await screen.findByLabelText('Wofür');
    await userEvent.type(feld, 'Rechnung 1502 prüfen');

    // Token erneuert, Tab wieder im Vordergrund — und mitten in der Netzrunde:
    await act(async () => {
      ruf!({ uid: 'u1', email: 'max@perl.at' });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(screen.queryByText('Anmeldung wird geprüft …')).not.toBeInTheDocument();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(screen.queryByText('Anmeldung wird geprüft …')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Wofür')).toHaveValue('Rechnung 1502 prüfen');
    expect(aufgebaut).toBe(1);
  });

  it('lädt nicht neu, solange Profil und Firma dieselben sind', async () => {
    zeige();
    await screen.findByLabelText('Wofür');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    const nachDemStart = geladen;
    expect(nachDemStart).toBe(1);

    await act(async () => {
      ruf!({ uid: 'u1', email: 'max@perl.at' });
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(geladen).toBe(nachDemStart);
  });
});
