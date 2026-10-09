import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * RUNDE 4: die Einsatzplanung ohne Reiterleiste. Ihr Umschalter „Woche |
 * Monat | Tag“ steht in der Steuerung der Seite; die Leiste darüber hieß zwei
 * Wege und einen doppelten Titel. Routen, Rechte und die Weiterleitung des
 * nackten Pfads bleiben — und alle anderen Bereiche behalten ihre Leiste.
 */

vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1', companyId: 'c1', name: 'Test', role: 'Projektleiter' }, company: {} }),
}));

const { default: Unterreiter } = await import('@/components/Unterreiter');

function zeige(pfad: string, ohneLeiste: boolean) {
  return render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route
          path="/assignments/*"
          element={
            <Unterreiter
              basis="/assignments"
              ohneLeiste={ohneLeiste}
              elemente={{ woche: <p>Woche-Inhalt</p>, tag: <p>Tag-Inhalt</p> }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Unterreiter ohne Leiste (Einsatzplanung, Runde 4)', () => {
  it('zeichnet keine Reiterleiste — die Unterseiten bleiben unter ihren Adressen erreichbar', async () => {
    zeige('/assignments/tag', true);
    expect(await screen.findByText('Tag-Inhalt')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Bereiche' })).toBeNull();
  });

  it('der nackte Pfad führt weiter auf die Woche', async () => {
    zeige('/assignments', true);
    expect(await screen.findByText('Woche-Inhalt')).toBeInTheDocument();
  });

  it('Gegenprobe: ohne die Angabe steht die Leiste wie bisher (alle anderen Bereiche)', async () => {
    zeige('/assignments/woche', false);
    expect(await screen.findByRole('navigation', { name: 'Bereiche' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tag planen' })).toBeInTheDocument();
  });
});
