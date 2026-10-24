import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AppUser } from '@/types';

/**
 * Die Seite Sonderurlaub (A15, 24.10.2026) — für Betriebe ohne das Modul
 * Urlaub: Antrag in drei Arten, die eigene Liste, und fürs Büro das
 * Bestätigen. Dieselben Bausteine wie auf der Urlaubsseite.
 */

const eigene = vi.fn(async () => [{ id: 'f1', art: 'pflegefreistellung', von: '2026-11-02', bis: '2026-11-02', status: 'Beantragt' }]);
vi.mock('@/lib/db/freistellungen', () => ({ listEigeneFreistellungen: () => eigene() }));
vi.mock('@/lib/db/users', () => ({ getUserByUid: vi.fn(async () => ({ uid: 'u1', name: 'Max' })) }));
vi.mock('@/features/vacations/FreistellungFormular', () => ({
  default: ({ art }: { art: string }) => <p>Formular {art}</p>,
}));
vi.mock('@/features/vacations/FreistellungListe', () => ({
  default: ({ antraege }: { antraege: unknown[] }) => <p>Liste {antraege.length}</p>,
}));
vi.mock('@/features/vacations/FreistellungenBestaetigen', () => ({ default: () => <p>Bestätigen</p> }));

// Ein fester Anmeldestand wie im echten AuthContext: ein neues Objekt je
// Render würde das Laden der Seite endlos neu anstoßen.
const anmeldung = {
  user: { uid: 'u1', companyId: 'perl', name: 'Max', role: 'Mitarbeiter' as AppUser['role'] },
  company: { id: 'perl', name: 'Perl' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => anmeldung }));

const { default: SonderurlaubView } = await import('@/features/vacations/SonderurlaubView');
const zeige = () => render(<MemoryRouter><SonderurlaubView /></MemoryRouter>);

beforeEach(() => {
  anmeldung.user = { ...anmeldung.user, role: 'Mitarbeiter' };
});

describe('Sonderurlaub ohne das Modul Urlaub', () => {
  it('der Monteur stellt einen Antrag in drei Arten und sieht seine Anträge', async () => {
    zeige();
    expect(await screen.findByText('Formular dienstverhinderung')).toBeInTheDocument();
    expect(screen.getByText('Liste 1')).toBeInTheDocument();
    const art = screen.getByLabelText('Art') as HTMLSelectElement;
    expect([...art.options].map((o) => o.value)).toEqual(['dienstverhinderung', 'pflegefreistellung', 'unbezahlt']);
    fireEvent.change(art, { target: { value: 'pflegefreistellung' } });
    expect(await screen.findByText('Formular pflegefreistellung')).toBeInTheDocument();
    expect(screen.queryByText('Bestätigen')).toBeNull();
  });

  it('das Büro bestätigt auf derselben Seite', async () => {
    anmeldung.user = { ...anmeldung.user, role: 'Buchhaltung' };
    zeige();
    expect(await screen.findByText('Bestätigen')).toBeInTheDocument();
  });

  it('Gegenprobe: fehlen die Anträge, sagt es die Seite statt leer zu bleiben', async () => {
    eigene.mockRejectedValueOnce(new Error('kein Netz'));
    zeige();
    await waitFor(() => expect(screen.getByText(/kein Netz|nicht geladen/)).toBeInTheDocument());
  });
});
