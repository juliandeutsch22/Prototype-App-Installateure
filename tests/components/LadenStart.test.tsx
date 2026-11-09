import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  DER ERSTE BILDSCHIRM BEIM APP-START (Empfehlung 1 aus
  `docs/ui-umbau/messung-nachher.md`, umgesetzt 18.10.2026).

  „Anmeldung wird geprüft …“ ist das Erste, was die App zeigt. Mit der
  Verzögerung aller Ladeanzeigen (200 ms, gegen das Aufblitzen) zählte der
  Browser ihn nicht als erste Anzeige — sie kam 0,5 s später mit der Hülle.
  Er erscheint deshalb sofort; jede andere Ladeanzeige bleibt verzögert.
*/
const auth = { user: null as null | { role: string }, loading: true };
vi.mock('@/app/AuthContext', () => ({ useAuth: () => auth }));

const { RequireAuth } = await import('@/app/guards');
const { LoadingState } = await import('@/components/States');

describe('Ladeanzeige beim App-Start', () => {
  it('zeigt „Anmeldung wird geprüft“ ohne Verzögerung', () => {
    render(
      <MemoryRouter>
        <RequireAuth>
          <p>Inhalt</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Anmeldung wird geprüft …');
    expect(status).not.toHaveClass('laden-verzoegert');
  });

  /*
    IN DER LINIE „LOT“ (09.11.2026): vorher eine kleine Zeile oben auf weißem
    Grund. Jetzt der Zeichentisch der App mit der Marke in der Mitte.
  */
  it('steht auf dem Zeichentisch der App, mit der Marke über dem Lot', () => {
    render(
      <MemoryRouter>
        <RequireAuth>
          <p>Inhalt</p>
        </RequireAuth>
      </MemoryRouter>,
    );
    const status = screen.getByRole('status');
    const flaeche = status.closest('.hauptflaeche');
    expect(flaeche).not.toBeNull();
    expect(flaeche).toHaveClass('start-laden');
    expect(screen.getByRole('img', { name: 'Senklot' })).toBeInTheDocument();
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument();
  });

  it('Gegenprobe: jede andere Ladeanzeige erscheint weiter verzögert', () => {
    render(<LoadingState label="Wird geladen …" />);
    expect(screen.getByRole('status')).toHaveClass('laden-verzoegert');
  });
});
