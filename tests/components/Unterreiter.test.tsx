import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Role } from '@/types';

/**
 * Mehrere Ansichten unter einem Reiter.
 *
 * Die Datenseite (welche Unterseite gehört wem) steht in
 * `tests/unit/navigation-routen.test.ts`. Hier geht es um das, was man nur
 * durch Rendern sieht:
 *
 *  - kommt man beim nackten Reiterpfad überhaupt irgendwo an,
 *  - verschwindet die Leiste, wenn es nur eine Unterseite gibt,
 *  - was passiert bei einer Adresse, die diese Rolle nicht sehen darf.
 *
 * Der letzte Punkt ist der eigentliche Grund für diese Datei: eine Unterseite
 * auszublenden nimmt nur den Weg weg, nicht die Adresse.
 */

let rolle: Role = 'Mitarbeiter';
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1', companyId: 'c1', name: 'Test', role: rolle } }),
}));

const { default: Unterreiter } = await import('@/components/Unterreiter');

const ELEMENTE = {
  meldungen: <p>Meldungen-Inhalt</p>,
  saetze: <p>Saetze-Inhalt</p>,
  module: <p>Module-Inhalt</p>,
};

function zeige(pfad: string) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route
          path="/settings/*"
          element={<Unterreiter basis="/settings" elemente={ELEMENTE} />}
        />
        <Route path="/" element={<p>Startseite</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Unterreiter', () => {
  it('bringt den nackten Reiterpfad auf die erste erlaubte Unterseite', async () => {
    rolle = 'Geschäftsführung';
    zeige('/settings');
    expect(await screen.findByText('Meldungen-Inhalt')).toBeInTheDocument();
  });

  it('wechselt ueber die Leiste', async () => {
    rolle = 'Geschäftsführung';
    zeige('/settings');
    await userEvent.click(await screen.findByRole('link', { name: 'Module' }));
    expect(await screen.findByText('Module-Inhalt')).toBeInTheDocument();
    expect(screen.queryByText('Meldungen-Inhalt')).not.toBeInTheDocument();
  });

  it('zeigt dem Monteur keine Leiste, weil er nur eine Unterseite hat', async () => {
    /**
     * Ein Reiter, der genau eine Wahlmöglichkeit anbietet, ist keine
     * Navigation, sondern Zierrat — und auf dem Telefon kostet er eine ganze
     * Zeile.
     */
    rolle = 'Mitarbeiter';
    zeige('/settings');
    expect(await screen.findByText('Meldungen-Inhalt')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Bereiche' })).not.toBeInTheDocument();
  });

  it('laesst den Monteur nicht ueber die Adresse an die Saetze', async () => {
    /**
     * DER PUNKT DIESER DATEI. Die Unterseite aus der Leiste zu nehmen genügt
     * nicht: ein weitergegebener Link führte sonst hinein. Umgeleitet wird auf
     * seine eigene Seite, nicht auf „Kein Zugriff" — er hat nichts Verbotenes
     * versucht, er hat einen Link angeklickt.
     */
    rolle = 'Mitarbeiter';
    zeige('/settings/saetze');
    expect(await screen.findByText('Meldungen-Inhalt')).toBeInTheDocument();
    expect(screen.queryByText('Saetze-Inhalt')).not.toBeInTheDocument();
  });

  it('faengt auch eine Adresse ab, die es gar nicht gibt', async () => {
    rolle = 'Geschäftsführung';
    zeige('/settings/gibtsnicht');
    expect(await screen.findByText('Meldungen-Inhalt')).toBeInTheDocument();
  });

  it('kommt auch durch die DREI Ebenen der echten App hindurch', async () => {
    /**
     * In der App liegen drei `<Routes>` ineinander: `/*` fürs Layout,
     * darin `/settings/*`, darin die Unterseite. Jede Ebene muss auf `*`
     * enden, sonst findet die innerste nichts mehr — und der Reiter fiele
     * kommentarlos auf die Startseite zurück. Die Prüfungen darüber
     * benutzen nur zwei Ebenen und würden das nicht bemerken.
     */
    rolle = 'Geschäftsführung';
    render(
      <MemoryRouter initialEntries={['/settings/module']}>
        <Routes>
          <Route
            path="/*"
            element={
              <Routes>
                <Route
                  path="/settings/*"
                  element={<Unterreiter basis="/settings" elemente={ELEMENTE} />}
                />
                <Route path="*" element={<p>Startseite</p>} />
              </Routes>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Module-Inhalt')).toBeInTheDocument();
  });
});
