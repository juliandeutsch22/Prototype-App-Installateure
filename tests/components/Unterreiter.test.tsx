import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    // Administration, nicht Geschäftsführung: die Module stehen seit dem
    // 07.09.2026 allein der Administration offen. Geprüft wird hier der
    // MECHANISMUS der Leiste — die Grenze selbst steht in
    // `navigation-routen.test.ts` und in den Rules.
    rolle = 'Administrator';
    zeige('/settings');
    await userEvent.click(await screen.findByRole('link', { name: 'Module' }));
    expect(await screen.findByText('Module-Inhalt')).toBeInTheDocument();
    expect(screen.queryByText('Meldungen-Inhalt')).not.toBeInTheDocument();
  });

  it('zeigt auch bei vielen Unterseiten Reiter, keine Auswahlliste', async () => {
    // Paket 6 hatte am Telefon ab vier Unterseiten ein Feld „Bereich" statt
    // der Reiter. Aus dem Betrieb (24.09.2026): passt nicht zum Rest der App.
    // Die Leiste läuft am Telefon seitlich wie Material, Lager und Urlaub.
    rolle = 'Administrator';
    zeige('/settings/meldungen');
    const leiste = await screen.findByRole('navigation', { name: 'Bereiche' });
    expect(screen.queryByLabelText('Bereich')).toBeNull();
    expect(leiste.className).toMatch(/overflow-x-auto/);
    expect(leiste.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    const namen = within(leiste).getAllByRole('link').map((l) => l.textContent);
    expect(namen).toEqual(expect.arrayContaining(['Mein Konto', 'Module', 'Fehler']));
    await userEvent.click(within(leiste).getByRole('link', { name: 'Module' }));
    expect(await screen.findByText('Module-Inhalt')).toBeInTheDocument();
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
    // Siehe oben: die Modulseite gehört der Administration.
    rolle = 'Administrator';
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
