import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Role } from '@/types';
import { RequireModul } from '@/app/guards';

/**
 * Ein abgeschaltetes Modul — und wer es wieder einschalten kann.
 *
 * PRÜFLAUF 25.09.2026 (P3-19). Die Geschäftsführung bekam den Link „Unter
 * ‚Module' wieder einschalten". Module schaltet aber nur die Administration
 * (Trigger `firmeneinstellungen_geschuetzt`), und `/settings/module` steht
 * nur ihr offen: der Link endete bei „Kein Zugriff".
 */

let rolle: Role = 'Administrator';
const auth = {
  get user() {
    return { uid: 'u1', companyId: 'perl', name: 'Jemand', role: rolle };
  },
  // Kein Modul eingeschaltet — das Lager ist also aus.
  company: { id: 'perl', name: 'Perl', modules: { material: false } },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => auth }));

function zeige() {
  return render(
    <MemoryRouter>
      <RequireModul id="material">
        <p>Inhalt</p>
      </RequireModul>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rolle = 'Administrator';
});

describe('Ein abgeschaltetes Modul', () => {
  it('die Administration bekommt den Weg zum Einschalten', () => {
    zeige();
    expect(screen.getByText(/ist ausgeschaltet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /wieder einschalten/ })).toHaveAttribute('href', '/settings/module');
  });

  it('die Geschäftsführung keinen Link ins Leere — sondern wer es kann', () => {
    rolle = 'Geschäftsführung';
    zeige();
    expect(screen.queryByRole('link', { name: /wieder einschalten/ })).not.toBeInTheDocument();
    expect(screen.getByText('Einschalten kann das die Administration unter „Module".')).toBeInTheDocument();
  });
});
