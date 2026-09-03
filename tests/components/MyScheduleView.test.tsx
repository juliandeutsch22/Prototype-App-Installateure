import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Assignment, EinsatzMaterial, Project, Vacation } from '@/types';

/**
 * „Mein Einsatzplan" — die Ansicht, in der der Monteur sieht, wo er in den
 * nächsten Tagen hin muss. Bis hierher ohne eigenen Test.
 *
 * Sie zeigt jetzt zusätzlich die Rüstliste, und zwar AUCH FÜR KOMMENDE TAGE:
 * den Bus lädt man am Vorabend. Wer erst am Einsatzmorgen erfährt, was
 * mitzunehmen ist, steht um sieben vor einem Lager, in dem etwas fehlt.
 */

const HEUTE = '2026-09-15';
const MORGEN = '2026-09-16';

const BAUSTELLEN: Project[] = [
  { id: 'p1', companyId: 'perl', projectNumber: 'B-001', customerName: 'Familie Huber', status: 'Aktiv' } as Project,
  { id: 'p2', companyId: 'perl', projectNumber: 'B-002', customerName: 'Gemeinde Neudorf', status: 'Aktiv' } as Project,
];

const EINSAETZE: Assignment[] = [
  { id: 'a1', companyId: 'perl', date: HEUTE, projectNumber: 'B-001', userId: 'm1', userName: 'Anton', comment: 'Bad' },
  { id: 'a2', companyId: 'perl', date: MORGEN, projectNumber: 'B-002', userId: 'm1', userName: 'Anton' },
];

/** Welcher Tag gerade abgefragt wird — die Ansicht lädt je gewähltem Tag. */
const geholt: { tage: string[] } = { tage: [] };
const listen: Record<string, (EinsatzMaterial & { id: string })[]> = {};

vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForUserInRange: vi.fn(async () => EINSAETZE),
  listUpcomingAssignments: vi.fn(async () => EINSAETZE),
}));
vi.mock('@/lib/db/projects', () => ({
  listProjectsByNumbers: vi.fn(async () => BAUSTELLEN),
}));
vi.mock('@/lib/db/vacations', () => ({
  listOwnVacations: vi.fn(async () => [] as Vacation[]),
}));
vi.mock('@/lib/db/einsatzMaterial', () => ({
  listEinsatzMaterialForDate: vi.fn(async (_c: string, tag: string) => {
    geholt.tage.push(tag);
    return listen[tag] ?? [];
  }),
  ladenUmschalten: vi.fn(async () => undefined),
}));

const authWert = {
  user: { uid: 'm1', email: 'm1@perl.at', name: 'Anton Berger', role: 'Mitarbeiter' as const, companyId: 'perl', docId: 'm1' },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: MyScheduleView } = await import('@/features/assignments/MyScheduleView');

function zeichne() {
  return render(
    <MemoryRouter>
      <MyScheduleView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15, 8, 0, 0));
  geholt.tage = [];
  for (const k of Object.keys(listen)) delete listen[k];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Mein Einsatzplan — der Einsatz selbst', () => {
  it('zeigt den heutigen Einsatz mit Kunde und Kommentar', async () => {
    zeichne();
    const karte = (await screen.findByText(/Einsätze am/)).closest('section')!;
    // Der Kundenname kommt aus einem zweiten, spaeteren Ladevorgang — bis
    // dahin steht die Baustellennummer da. Deshalb warten statt sofort lesen.
    expect((await within(karte).findAllByText(/Familie Huber/)).length).toBeGreaterThan(0);
    expect(within(karte).getByText('Bad')).toBeInTheDocument();
  });

  it('führt mit Baustelle und Rolle in die Zeiterfassung', async () => {
    // Ein vergessener Helfer-Haken kostet den falschen Verrechnungssatz.
    zeichne();
    await screen.findByText('Bad');
    expect(screen.getAllByRole('link', { name: 'Zeit erfassen' })[0]).toHaveAttribute('href', '/time');
  });
});

describe('Mein Einsatzplan — die Rüstliste', () => {
  it('zeigt, was für heute mitzunehmen ist', async () => {
    listen[HEUTE] = [
      {
        id: 'perl_2026-09-15_B-001', companyId: 'perl', date: HEUTE, projectNumber: 'B-001',
        uids: ['m1'],
        positionen: [{ id: 'p1', name: 'Eckventil 1/2', menge: 3, einheit: 'Stk' }],
        geladen: {},
      } as EinsatzMaterial & { id: string },
    ];
    zeichne();
    expect(await screen.findByText(/Eckventil 1\/2/)).toBeInTheDocument();
    expect(screen.getByText(/noch 1 von 1/)).toBeInTheDocument();
  });

  it('holt die Liste des GEWÄHLTEN Tages, nicht nur die von heute', async () => {
    /**
     * Der Vorabend ist der eigentliche Zweck: wer erst am Einsatzmorgen
     * erfährt, was mitzunehmen ist, steht um sieben vor einem Lager, in dem
     * etwas fehlt.
     */
    zeichne();
    await screen.findByText('Bad');
    expect(geholt.tage).toContain(HEUTE);

    geholt.tage = [];
    await userEvent.click(screen.getByRole('button', { name: /16\./ }));
    await waitFor(() => expect(geholt.tage).toContain(MORGEN));
  });

  it('zeigt an einem Tag ohne Liste keinen leeren Materialblock', async () => {
    // Ein leerer Block sähe aus wie „nichts mitzunehmen" statt „nichts
    // geplant" — und das sind zwei verschiedene Aussagen.
    zeichne();
    await screen.findByText('Bad');
    expect(screen.queryByText('Material')).toBeNull();
  });
});
