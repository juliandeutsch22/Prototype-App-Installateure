import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, TimeEntry, Vacation } from '@/types';

/**
 * Urlaub war bisher ein Tagesstatus in der Zeiterfassung: jeder konnte ihn
 * sich selbst eintragen, genehmigt war er damit nicht, und niemand hatte den
 * Überblick. Diese Tests halten fest, was der Antrag daraus macht.
 *
 * Der wichtigste davon ist der dritte: eine Genehmigung, die die Tage NICHT
 * ins Zeitkonto schreibt, wäre nur die halbe Sache — der Mitarbeiter müsste
 * seinen genehmigten Urlaub ein zweites Mal von Hand eintragen, und bis dahin
 * meldete die Startseite zwei Wochen lang „Zeit fehlt".
 */

const antraege: (Vacation & { id: string })[] = [];
const eintraege: (TimeEntry & { id: string })[] = [];

const monteur: AppUser = {
  id: 'm1',
  companyId: 'perl',
  uid: 'm1',
  name: 'Max Mustermann',
  email: 'max@perl.at',
  role: 'Mitarbeiter',
  workDays: [1, 2, 3, 4, 5],
  yearlyVacationDays: 25,
};

/**
 * Mit Parametern TYPISIERT, nicht benannt: sonst leitet TypeScript ein leeres
 * Tupel ab und der Zugriff auf `mock.calls[0][4]` scheitert im Build.
 */
const createVacation = vi.fn<[string, unknown], Promise<string>>(async () => 'v-neu');
const approveVacation = vi.fn<
  [string, Vacation, AppUser, { uid: string; name: string }, Set<string>],
  Promise<{ angelegt: number; uebersprungen: number }>
>(async () => ({ angelegt: 5, uebersprungen: 0 }));
const rejectVacation = vi.fn<
  [string, { uid: string; name: string }, string],
  Promise<void>
>(async () => undefined);

vi.mock('@/lib/db/vacations', () => ({
  listOwnVacations: vi.fn(async () => antraege.filter((v) => v.userId === rolle.uid)),
  listOpenVacations: vi.fn(async () => antraege.filter((v) => v.status === 'Beantragt')),
  createVacation: (c: string, v: unknown) => createVacation(c, v),
  deleteVacation: vi.fn(async () => undefined),
  approveVacation: (...a: unknown[]) =>
    approveVacation(...(a as Parameters<typeof approveVacation>)),
  rejectVacation: (...a: unknown[]) =>
    rejectVacation(...(a as Parameters<typeof rejectVacation>)),
  cancelApprovedVacation: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => [monteur]),
  getUserByUid: vi.fn(async () => monteur),
}));
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesInRange: vi.fn(async () => eintraege),
}));

/** Wer gerade angemeldet ist — je Test umgestellt. */
let rolle = {
  uid: 'm1',
  email: 'max@perl.at',
  name: 'Max Mustermann',
  role: 'Mitarbeiter' as AppUser['role'],
  companyId: 'perl',
  docId: 'm1',
};
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: rolle,
    company: { id: 'perl', name: 'Perl Installationen' },
    loading: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    reloadCompany: vi.fn(),
  }),
}));

const { default: VacationsView } = await import('@/features/vacations/VacationsView');

function zeichne() {
  return render(
    <ToastProvider>
      <VacationsView />
    </ToastProvider>,
  );
}

/** Ein Datumsfeld setzen — `type()` taugt dafuer nicht. */
async function datum(label: string, wert: string) {
  const feld = screen.getByLabelText(label) as HTMLInputElement;
  const nutzer = userEvent.setup();
  await nutzer.clear(feld);
  await nutzer.type(feld, wert);
}

beforeEach(() => {
  createVacation.mockClear();
  approveVacation.mockClear().mockResolvedValue({ angelegt: 5, uebersprungen: 0 });
  rejectVacation.mockClear();
  antraege.length = 0;
  eintraege.length = 0;
  rolle = { ...rolle, uid: 'm1', name: 'Max Mustermann', role: 'Mitarbeiter', docId: 'm1' };
});

describe('Urlaubsantrag', () => {
  it('reicht den Zeitraum in ARBEITSTAGEN ein', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByLabelText('Von');

    // Mo 26.10. bis Fr 30.10.2026 — mit Nationalfeiertag am 26.
    await datum('Von', '2026-10-26');
    await datum('Bis (einschließlich)', '2026-10-30');

    /**
     * Vier, nicht fünf. Der 26. Oktober ist Nationalfeiertag; ihn als
     * Urlaubstag zu zählen nähme dem Mitarbeiter jedes Jahr Tage weg.
     */
    expect(screen.getByText(/4 Arbeitstage/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));

    const eingereicht = createVacation.mock.calls[0][1] as Vacation;
    expect(eingereicht.tage).toBe(4);
    expect(eingereicht.status).toBe('Beantragt');
    expect(eingereicht.userId).toBe('m1');
  });

  it('faengt eine Ueberschneidung mit dem eigenen Antrag ab', async () => {
    antraege.push({
      id: 'v1',
      companyId: 'perl',
      userId: 'm1',
      userName: 'Max Mustermann',
      von: '2026-10-26',
      bis: '2026-10-30',
      tage: 4,
      status: 'Genehmigt',
    });
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByLabelText('Von');

    await datum('Von', '2026-10-28');
    await datum('Bis (einschließlich)', '2026-11-02');
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));

    // Freundlicher hier als beim Genehmigenden — und es ist fast immer ein
    // Versehen.
    expect(await screen.findByText(/Überschneidet sich/)).toBeInTheDocument();
    expect(createVacation).not.toHaveBeenCalled();
  });

  it('zeigt dem Antragsteller den Stand und den Grund einer Ablehnung', async () => {
    antraege.push({
      id: 'v2',
      companyId: 'perl',
      userId: 'm1',
      userName: 'Max Mustermann',
      von: '2026-07-06',
      bis: '2026-07-10',
      tage: 5,
      status: 'Abgelehnt',
      entschiedenVonName: 'Julian Deutsch',
      grund: 'In der Woche läuft die Baustelle Neudorf an.',
    });
    zeichne();

    /**
     * „Abgelehnt" allein ist keine Auskunft, sondern eine Kränkung. Wer
     * entschieden hat und warum, gehört sichtbar dazu.
     */
    expect(await screen.findByText(/Abgelehnt von Julian Deutsch/)).toHaveTextContent(
      'Baustelle Neudorf',
    );
  });

  it('zeigt einem Monteur KEINE Genehmigungsliste', async () => {
    antraege.push({
      id: 'v3',
      companyId: 'perl',
      userId: 'kollege',
      userName: 'Franz Huber',
      von: '2026-07-06',
      bis: '2026-07-10',
      tage: 5,
      status: 'Beantragt',
    });
    zeichne();
    await screen.findByLabelText('Von');
    // Die harte Grenze steht in firestore.rules; die Oberflaeche soll die
    // Moeglichkeit erst gar nicht anbieten.
    expect(screen.queryByText(/Offene Anträge/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Genehmigen' })).not.toBeInTheDocument();
  });
});

describe('Urlaub genehmigen', () => {
  beforeEach(() => {
    rolle = {
      ...rolle,
      uid: 'chef',
      name: 'Julian Deutsch',
      role: 'Geschäftsführung',
      docId: 'chef',
    };
    antraege.push({
      id: 'v9',
      companyId: 'perl',
      userId: 'm1',
      userName: 'Max Mustermann',
      von: '2026-07-06',
      bis: '2026-07-10',
      tage: 5,
      status: 'Beantragt',
    });
  });

  it('traegt die Tage beim Genehmigen ins Zeitkonto ein', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Max Mustermann');

    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));

    /**
     * DER EIGENTLICHE PUNKT. Ohne die Zeiteinträge wäre der Urlaub für die
     * Stundenrechnung unsichtbar: der Saldo zöge für jeden Tag das Tagessoll
     * ab, und die Startseite meldete eine Woche lang „Zeit fehlt".
     */
    expect(approveVacation).toHaveBeenCalled();
    const [, antrag, mitarbeiter, entscheider] = approveVacation.mock.calls[0];
    expect(antrag.id).toBe('v9');
    // Die Arbeitstage des BETROFFENEN, nicht die des Genehmigenden: sonst
    // bekaeme ein Teilzeitmitarbeiter fuenf Tage statt drei abgezogen.
    expect(mitarbeiter.workDays).toEqual([1, 2, 3, 4, 5]);
    expect(entscheider.name).toBe('Julian Deutsch');
  });

  it('ueberschreibt bereits gebuchte Tage NICHT', async () => {
    // An einem Tag des Zeitraums ist schon gearbeitet worden.
    eintraege.push({
      id: 'e1',
      companyId: 'perl',
      userId: 'm1',
      date: '2026-07-08',
      status: 'Anwesend',
    } as TimeEntry & { id: string });
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Max Mustermann');

    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));

    /**
     * Eine erfasste Arbeitsleistung darf eine Genehmigung nicht stillschweigend
     * wegwerfen. Der belegte Tag wird übersprungen — und das erfährt die
     * Funktion über diese Menge.
     */
    const belegt = approveVacation.mock.calls[0][4];
    expect(belegt.has('2026-07-08')).toBe(true);
  });

  it('verlangt fuer eine Ablehnung einen Grund', async () => {
    const nutzer = userEvent.setup();
    // Der Genehmigende bricht die Nachfrage ab.
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null);
    zeichne();
    await screen.findByText('Max Mustermann');

    await nutzer.click(screen.getByRole('button', { name: 'Ablehnen' }));
    expect(rejectVacation).not.toHaveBeenCalled();

    // Und mit Grund geht es durch.
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Baustelle Neudorf läuft an.');
    await nutzer.click(screen.getByRole('button', { name: 'Ablehnen' }));
    expect(rejectVacation).toHaveBeenCalledWith(
      'v9',
      { uid: 'chef', name: 'Julian Deutsch' },
      'Baustelle Neudorf läuft an.',
    );
  });
});
