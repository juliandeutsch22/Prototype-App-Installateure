import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Vacation } from '@/types';

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
 * Tupel ab und der Zugriff auf `mock.calls[0][0]` scheitert im Build.
 */
const createVacation = vi.fn<[string, unknown], Promise<string>>(async () => 'v-neu');

/**
 * Entschieden wird SERVERSEITIG. Der Browser schickt nur, welcher Antrag wie
 * entschieden wird — er darf die Zeiteinträge des Antragstellers weder lesen
 * noch schreiben.
 */
const callUrlaubEntscheiden = vi.fn<
  [
    {
      vacationId: string;
      entscheidung: 'Genehmigt' | 'Abgelehnt' | 'Storniert';
      grund?: string;
      entscheiderName?: string;
    },
  ],
  Promise<{ data: { status: string; angelegt: number; uebersprungen: number; entfernt: number } }>
>(async () => ({ data: { status: 'Genehmigt', angelegt: 5, uebersprungen: 0, entfernt: 0 } }));

vi.mock('@/lib/db/vacations', () => ({
  listOwnVacations: vi.fn(async () => antraege.filter((v) => v.userId === rolle.uid)),
  listOpenVacations: vi.fn(async () => antraege.filter((v) => v.status === 'Beantragt')),
  createVacation: (c: string, v: unknown) => createVacation(c, v),
  deleteVacation: vi.fn(async () => undefined),
}));
vi.mock('@/lib/functions', () => ({
  callUrlaubEntscheiden: (a: unknown) =>
    callUrlaubEntscheiden(...([a] as Parameters<typeof callUrlaubEntscheiden>)),
}));
vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => monteur),
}));

/** Wer die Genehmigenden sind — je Test umgestellt. */
let genehmiger: string[] | undefined;

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
    company: { id: 'perl', name: 'Perl Installationen', vacationApprovers: genehmiger },
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
  callUrlaubEntscheiden
    .mockClear()
    .mockResolvedValue({ data: { status: 'Genehmigt', angelegt: 5, uebersprungen: 0, entfernt: 0 } });
  antraege.length = 0;
  genehmiger = undefined;
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

  it('laesst den SERVER entscheiden, nicht den Browser', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Max Mustermann');

    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));

    /**
     * DER KERN. Die Genehmigung muss nachsehen, an welchen Tagen der
     * Antragsteller schon gebucht hat, und dann fremde Zeiteinträge schreiben.
     * Beides darf ein Genehmigender nicht selbst — Zeiteinträge tragen
     * Kranken- und Urlaubstage und damit Gesundheitsdaten nach Art. 9 DSGVO.
     * Der Browser schickt deshalb nur, WELCHER Antrag wie entschieden wird.
     */
    expect(callUrlaubEntscheiden).toHaveBeenCalledWith({
      vacationId: 'v9',
      entscheidung: 'Genehmigt',
      grund: undefined,
      entscheiderName: 'Julian Deutsch',
    });
  });

  it('meldet zurueck, wenn Tage uebersprungen wurden', async () => {
    callUrlaubEntscheiden.mockResolvedValue({
      data: { status: 'Genehmigt', angelegt: 4, uebersprungen: 1, entfernt: 0 },
    });
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Max Mustermann');

    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));

    /**
     * Eine erfasste Arbeitsleistung darf eine Genehmigung nicht stillschweigend
     * wegwerfen — und wenn ein Tag deshalb ausgelassen wurde, muss es jemand
     * erfahren.
     */
    expect(await screen.findByText(/1 übersprungen/)).toBeInTheDocument();
  });

  it('verlangt fuer eine Ablehnung einen Grund', async () => {
    const nutzer = userEvent.setup();
    // Der Genehmigende bricht die Nachfrage ab.
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null);
    zeichne();
    await screen.findByText('Max Mustermann');

    await nutzer.click(screen.getByRole('button', { name: 'Ablehnen' }));
    expect(callUrlaubEntscheiden).not.toHaveBeenCalled();

    // Und mit Grund geht es durch.
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Baustelle Neudorf läuft an.');
    await nutzer.click(screen.getByRole('button', { name: 'Ablehnen' }));
    expect(callUrlaubEntscheiden).toHaveBeenCalledWith({
      vacationId: 'v9',
      entscheidung: 'Abgelehnt',
      grund: 'Baustelle Neudorf läuft an.',
      entscheiderName: 'Julian Deutsch',
    });
  });
});

/**
 * Wer entscheiden darf, ist eine betriebliche Festlegung und keine
 * Eigenschaft der Rolle. Die Oberflaeche muss ihr folgen — die harte Grenze
 * steht in firestore.rules und in der Cloud Function.
 */
describe('Genehmigende aus den Einstellungen', () => {
  beforeEach(() => {
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

  it('zeigt die Liste einer eingetragenen Verwaltungskraft', async () => {
    rolle = { ...rolle, uid: 'buero', name: 'Frau Wagner', role: 'Verwaltung', docId: 'buero' };
    genehmiger = ['buero'];
    zeichne();
    expect(await screen.findByText(/Offene Anträge/)).toBeInTheDocument();
  });

  it('zeigt sie NICHT, wenn dieselbe Person nicht daraufsteht', async () => {
    rolle = { ...rolle, uid: 'buero', name: 'Frau Wagner', role: 'Verwaltung', docId: 'buero' };
    genehmiger = ['jemand-anderer'];
    zeichne();
    await screen.findByLabelText('Von');
    expect(screen.queryByText(/Offene Anträge/)).not.toBeInTheDocument();
  });

  it('nimmt der Buchhaltung die Liste, sobald jemand anderer bestimmt ist', async () => {
    // Die Festlegung ERSETZT den Ausgangszustand, sie ergaenzt ihn nicht.
    rolle = { ...rolle, uid: 'buch', name: 'Herr Bauer', role: 'Buchhaltung', docId: 'buch' };
    genehmiger = ['buero'];
    zeichne();
    await screen.findByLabelText('Von');
    expect(screen.queryByText(/Offene Anträge/)).not.toBeInTheDocument();
  });

  it('laesst die Geschaeftsfuehrung immer entscheiden', async () => {
    /**
     * Waere sie abwaehlbar, koennte eine Fehleingabe den ganzen Betrieb
     * aussperren — und niemand koennte sie zuruecknehmen.
     */
    rolle = { ...rolle, uid: 'chef', name: 'Julian Deutsch', role: 'Geschäftsführung', docId: 'chef' };
    genehmiger = ['buero'];
    zeichne();
    expect(await screen.findByText(/Offene Anträge/)).toBeInTheDocument();
  });
});
