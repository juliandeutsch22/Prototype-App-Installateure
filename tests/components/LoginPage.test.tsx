import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';
import type { CurrentUser } from '@/types';

/**
 * DER KREISEL AUF DEM ANMELDEKNOPF.
 *
 * Bei einer geglückten Anmeldung endet er dadurch, dass diese Seite
 * VERSCHWINDET: `user` ist gesetzt, der Verweis führt ins Dashboard. Für den
 * Weg, der nicht dorthin führt, war nie ein Ende vorgesehen — scheitert das
 * Laden des Profils, steht die Meldung darüber, und der Knopf dreht sich
 * weiter.
 *
 * Zu sehen war das auf dem ersten Bild des Plattform-Fehlers am 09.09.2026:
 * rote Meldung, darunter der laufende Kreisel. Und es trifft nicht nur den
 * globalen Administrator, sondern JEDE gescheiterte Anmeldung — auch den
 * Monteur, dessen Profil im Funkloch nicht geladen werden konnte.
 */

const anmelden = vi.fn(async () => undefined);
let authFehler: string | null = null;
let angemeldet: CurrentUser | null = null;

vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    signIn: anmelden,
    user: angemeldet,
    error: authFehler,
    resetPassword: vi.fn(async () => undefined),
  }),
}));
vi.mock('@/components/BrandLogo', () => ({ default: () => null }));

const { default: LoginPage } = await import('@/features/auth/LoginPage');

function zeige() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

const knopf = () => screen.getByRole('button', { name: /Anmelden/ });

async function anmeldeversuch() {
  const nutzer = userEvent.setup();
  await nutzer.type(screen.getByLabelText(/E-Mail/), 'petra@perl.at');
  await nutzer.type(screen.getByLabelText(/Passwort/), 'geheim');
  await nutzer.click(knopf());
}

beforeEach(() => {
  anmelden.mockClear();
  authFehler = null;
  angemeldet = null;
});

describe('Der Anmeldeknopf', () => {
  it('dreht sich, solange die Anmeldung läuft', async () => {
    // Ohne das wüsste niemand, ob der Druck angekommen ist.
    let loesen: () => void = () => undefined;
    anmelden.mockImplementation(() => new Promise<undefined>((gut) => {
      loesen = () => gut(undefined);
    }));
    zeige();
    await anmeldeversuch();

    expect(knopf()).toBeDisabled();
    loesen();
  });

  it('hört auf, sobald das Laden des Profils scheitert', async () => {
    /*
      DER GEMELDETE FEHLER. Vorher lief der Kreisel weiter, obwohl über ihm
      die Meldung stand — ein zweiter Versuch sah aus wie der erste, und
      niemand wusste, ob die App noch arbeitet oder längst aufgegeben hat.
    */
    const { rerender } = zeige();
    await anmeldeversuch();
    expect(knopf()).toBeDisabled();

    // Was danach passiert: der Auth-Kontext meldet den Fehlschlag.
    authFehler = 'Die Anmeldedaten konnten nicht geladen werden.';
    rerender(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(knopf()).not.toBeDisabled());
  });

  it('dreht sich beim ZWEITEN Versuch wieder, obwohl die Meldung verschwindet', async () => {
    /*
      Der Auth-Kontext raeumt seine Meldung zu Beginn jedes Durchlaufs weg
      (`setError(null)`). Endete der Kreisel bei JEDER Aenderung dieser
      Meldung statt nur bei einer neuen, hoerte er also genau dann auf, wenn
      der zweite Versuch gerade erst beginnt — und der Knopf saehe untaetig
      aus, waehrend er arbeitet.
    */
    const zeichne = (r: (u: React.ReactElement) => void) =>
      r(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>,
      );

    const { rerender } = zeige();
    await anmeldeversuch();

    authFehler = 'Die Anmeldedaten konnten nicht geladen werden.';
    zeichne(rerender);
    await waitFor(() => expect(knopf()).not.toBeDisabled());

    // Zweiter Anlauf: die alte Meldung faellt weg, die Anmeldung laeuft.
    let loesen: () => void = () => undefined;
    anmelden.mockImplementation(() => new Promise<undefined>((gut) => {
      loesen = () => gut(undefined);
    }));
    await userEvent.setup().click(knopf());
    authFehler = null;
    zeichne(rerender);

    expect(knopf()).toBeDisabled();
    loesen();
  });

  it('hört auch auf, wenn Kennwort oder Adresse falsch sind', async () => {
    // Dieser Weg ging schon vorher — er darf nicht mit verloren gehen.
    anmelden.mockRejectedValue(new Error('auth/wrong-password'));
    zeige();
    await anmeldeversuch();

    expect(await screen.findByText(/E-Mail oder Passwort prüfen/)).toBeInTheDocument();
    expect(knopf()).not.toBeDisabled();
  });
});
