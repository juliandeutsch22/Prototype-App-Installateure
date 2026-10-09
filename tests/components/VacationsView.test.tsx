import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
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
const createVacation = vi.fn<(a0: string, a1: unknown) => Promise<string>>(async () => 'v-neu');

/**
 * Entschieden wird SERVERSEITIG. Der Browser schickt nur, welcher Antrag wie
 * entschieden wird — er darf die Zeiteinträge des Antragstellers weder lesen
 * noch schreiben.
 */
// Die Signatur steht am Doppelgänger, nicht an seinen Parametern: der Test
// liest später, MIT WELCHER Id gelöscht wurde.
const deleteVacation = vi.fn<(a0: string) => Promise<void>>(async () => undefined);

const callUrlaubEntscheiden = vi.fn<(a0: {
      vacationId: string;
      entscheidung: 'Genehmigt' | 'Abgelehnt' | 'Storniert';
      grund?: string;
      entscheiderName?: string;
    }) => Promise<{ status: string; angelegt: number; uebersprungen: number; entfernt: number }>>(async () => ({ status: 'Genehmigt', angelegt: 5, uebersprungen: 0, entfernt: 0 }));

vi.mock('@/lib/db/vacations', () => ({
  // Nach der GEFRAGTEN Person — die Genehmigenden laden auch die Urlaube
  // der Antragsteller, für deren Resturlaub.
  listOwnVacations: vi.fn(async (_b: string, uid: string) => antraege.filter((v) => v.userId === uid)),
  listOpenVacations: vi.fn(async () => antraege.filter((v) => v.status === 'Beantragt')),
  createVacation: (c: string, v: unknown) => createVacation(c, v),
  deleteVacation: (id: string) => deleteVacation(id),
  /*
    DAS ENTSCHEIDEN LAG BIS ZUM 19.09. IN `lib/functions.ts`, weil es unter
    Firestore eine Cloud Function war. Es ist ein Aufruf an die Datenbank
    geworden und damit eine Funktion dieses Moduls — der Ersatz gehört
    deshalb in DENSELBEN Mock. Zwei `vi.mock` für einen Pfad überschreiben
    einander, und der zweite lud die echte Datei nach.
  */
  entscheiden: (a: unknown) =>
    callUrlaubEntscheiden(...([a] as Parameters<typeof callUrlaubEntscheiden>)),
}));
/** Die Belegschaft — je Test umgestellt, für die Frage „entscheidet jemand anderer?". */
let belegschaft: AppUser[] = [monteur];
/** Das eigene Profil — je Test umstellbar (G13: die Administration führt kein Zeitkonto). */
let eigenesProfil: AppUser = monteur;
/** Anträge auf Sonderurlaub — je Test setzbar (Plan 10.3). */
let freistellungen: Array<Record<string, unknown>> = [];
/** Bestätigte, die noch laufen (Liste „Bestätigt, noch nicht vorbei“). */
let laufendeFrei: Array<Record<string, unknown>> = [];
const freistellungBeantragen = vi.fn<(a: Record<string, unknown>) => Promise<string>>(async () => 'f-neu');
const freistellungEntscheiden = vi.fn<(d: Record<string, unknown>) => Promise<Record<string, unknown>>>(
  async () => ({ status: 'Bestätigt', angelegt: 1, uebersprungen: 0, entfernt: 0, nachweis: null, dateiBlieb: false }),
);
vi.mock('@/lib/db/freistellungen', () => ({
  listEigeneFreistellungen: vi.fn(async (_c: string, uid: string) => freistellungen.filter((f) => f.userId === uid)),
  listOffeneFreistellungen: vi.fn(async () => freistellungen.filter((f) => f.status === 'Beantragt')),
  listBestaetigteFreistellungenAb: vi.fn(async () => laufendeFrei),
  listFreistellungenVon: vi.fn(async (_c: string, uids: string[]) => freistellungen.filter((f) => uids.includes(f.userId as string))),
  freistellungBeantragen: (a: Record<string, unknown>) => freistellungBeantragen(a),
  freistellungEntscheiden: (d: Record<string, unknown>) => freistellungEntscheiden(d),
  freistellungZurueckziehen: vi.fn(async () => undefined),
  nachweisPruefen: () => null,
  nachweisHochladen: vi.fn(async () => 'pfad'),
  nachweisEntfernen: vi.fn(async () => undefined),
  nachweisAdresse: vi.fn(async () => 'https://beispiel'),
  nachweiseAufraeumen: vi.fn(async () => 0),
}));

/** Anpassungen des Urlaubsanspruchs — je Test setzbar. */
let anpassungen: Array<{ id: string; userId: string; urlaubsjahr: number; tage: number; grund: string }> = [];
vi.mock('@/lib/db/urlaubsanspruch', () => ({
  listAnpassungen: vi.fn(async (_c: string, uid?: string) =>
    anpassungen.filter((a) => !uid || a.userId === uid)),
}));

vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => eigenesProfil),
  listUsers: vi.fn(async () => belegschaft),
}));

const krankmeldungSpeichern = vi.fn<(a0: unknown) => Promise<unknown>>(
  async () => ({ id: 'k1', angelegt: 3, entfernt: 0, uebersprungen: 0 }),
);
let eigeneKrank: unknown[] = [];
let betriebsurlaube: unknown[] = [];
vi.mock('@/lib/db/abwesenheiten', () => ({
  listEigeneKrankmeldungen: vi.fn(async () => eigeneKrank),
  listKrankmeldungenAb: vi.fn(async () => []),
  krankmeldungSpeichern: (a: unknown) => krankmeldungSpeichern(a),
  krankmeldungLoeschen: vi.fn(async () => 0),
  listBetriebsurlaubeAb: vi.fn(async () => betriebsurlaube),
  betriebsurlaubAnlegen: vi.fn(),
  betriebsurlaubLoeschen: vi.fn(),
}));

let guthabenH = 10;
vi.mock('@/features/vacations/zeitguthaben', () => ({
  zeitguthabenLaden: vi.fn(async () => ({ saldoH: guthabenH, hasConfig: true, daysWithoutEntry: 0 })),
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
    <MemoryRouter>
      <ToastProvider>
        <VacationsView />
      </ToastProvider>
    </MemoryRouter>,
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
  anpassungen = [];
  freistellungen = [];
  laufendeFrei = [];
  freistellungBeantragen.mockClear();
  freistellungEntscheiden.mockClear();
  createVacation.mockClear();
  deleteVacation.mockClear();
  callUrlaubEntscheiden
    .mockClear()
    .mockResolvedValue({ status: 'Genehmigt', angelegt: 5, uebersprungen: 0, entfernt: 0 });
  antraege.length = 0;
  genehmiger = undefined;
  krankmeldungSpeichern.mockClear();
  eigeneKrank = [];
  betriebsurlaube = [];
  guthabenH = 10;
  belegschaft = [monteur];
  eigenesProfil = monteur;
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
    // Versehen. Seit dem Launch-Check (M5) steht es schon in der Vorschau.
    expect((await screen.findAllByText(/Überschneidet sich/)).length).toBeGreaterThan(0);
    expect(createVacation).not.toHaveBeenCalled();
  });

  it('nennt den Betriebsurlaub schon in der Vorschau, statt Tage zu zählen (Launch-Check, M5)', async () => {
    betriebsurlaube = [{ id: 'b1', companyId: 'perl', von: '2026-12-24', bis: '2027-01-06',
      bezeichnung: 'Weihnachten', urlaubAbbuchen: true }];
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByLabelText('Von');
    await datum('Von', '2026-12-21');
    await datum('Bis (einschließlich)', '2026-12-29');

    expect(screen.getByText(/Überschneidet sich mit dem Betriebsurlaub „Weihnachten“/)).toBeInTheDocument();
    expect(screen.queryByText(/Arbeitstage/)).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    expect(createVacation).not.toHaveBeenCalled();

    // Die Tage davor gehen.
    await datum('Bis (einschließlich)', '2026-12-23');
    expect(screen.getByText(/3 Arbeitstage/)).toBeInTheDocument();
  });

  it('wer im Betriebsurlaub arbeitet, beantragt dort ganz normal', async () => {
    betriebsurlaube = [{ id: 'b1', companyId: 'perl', von: '2026-12-24', bis: '2027-01-06',
      bezeichnung: 'Weihnachten', urlaubAbbuchen: true, ausgenommen: ['m1'] }];
    zeichne();
    await screen.findByLabelText('Von');
    await datum('Von', '2026-12-28');
    await datum('Bis (einschließlich)', '2026-12-30');
    expect(screen.getByText(/3 Arbeitstage/)).toBeInTheDocument();
  });

  it('leert die Maske nach dem Einreichen (Launch-Check, M5)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByLabelText('Von');
    await datum('Von', '2026-10-27');
    await datum('Bis (einschließlich)', '2026-10-30');
    await nutzer.type(screen.getByLabelText(/Anmerkung/), 'Hochzeit');
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    await vi.waitFor(() => expect(createVacation).toHaveBeenCalled());
    await vi.waitFor(() => expect((screen.getByLabelText(/Anmerkung/) as HTMLInputElement).value).toBe(''));
    expect((screen.getByLabelText('Von') as HTMLInputElement).value).not.toBe('2026-10-27');
    expect(screen.queryByText(/4 Arbeitstage/)).not.toBeInTheDocument();
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
      status: 'Genehmigt', angelegt: 4, uebersprungen: 1, entfernt: 0,
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

  it('sagt „im Zeitkonto“ nur, wo eines geführt wird (Launch-Check, M4)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Max Mustermann');
    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));
    expect(await screen.findByText('Genehmigt — 5 Tage im Zeitkonto eingetragen')).toBeInTheDocument();
  });

  it('beim Administrator ohne Zeitkonto nur „eingetragen“', async () => {
    belegschaft = [{ ...monteur, role: 'Administrator' }];
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Max Mustermann');
    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));
    expect(await screen.findByText('Genehmigt — 5 Tage eingetragen')).toBeInTheDocument();
  });

  it('verlangt fuer eine Ablehnung einen Grund — im Dialog der App', async () => {
    // Seit 24.09.2026 kein `window.prompt` mehr (Prüflauf, F7).
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Max Mustermann');

    // Abgebrochen: nichts entschieden.
    await nutzer.click(screen.getByRole('button', { name: 'Ablehnen' }));
    await nutzer.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Abbrechen' }));
    expect(callUrlaubEntscheiden).not.toHaveBeenCalled();

    // Ohne Grund: der Dialog bleibt offen und sagt es.
    await nutzer.click(screen.getByRole('button', { name: 'Ablehnen' }));
    let dialog = await screen.findByRole('dialog');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Ablehnen' }));
    expect(await within(dialog).findByText(/Bitte einen Grund angeben/)).toBeInTheDocument();
    expect(callUrlaubEntscheiden).not.toHaveBeenCalled();

    // Mit Grund geht es durch.
    dialog = screen.getByRole('dialog');
    await nutzer.type(within(dialog).getByLabelText('Grund'), 'Baustelle Neudorf läuft an.');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Ablehnen' }));
    await waitFor(() =>
      expect(callUrlaubEntscheiden).toHaveBeenCalledWith({
        vacationId: 'v9',
        entscheidung: 'Abgelehnt',
        grund: 'Baustelle Neudorf läuft an.',
        entscheiderName: 'Julian Deutsch',
      }),
    );
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

  // Analyse 03.10.2026, Paket 2 — wer entscheidet, sieht wartende Anträge zuerst.
  it('stellt wartende Anträge über das eigene Antragsformular', async () => {
    rolle = { ...rolle, uid: 'chef', name: 'Julian Deutsch', role: 'Geschäftsführung', docId: 'chef' };
    zeichne();
    const offen = await screen.findByText(/Offene Anträge \(1\)/);
    const formular = screen.getByText('Antrag stellen');
    expect(offen.compareDocumentPosition(formular) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Gegenprobe: ohne wartende Anträge steht die Liste nach dem Formular', async () => {
    antraege.splice(0, antraege.length);
    rolle = { ...rolle, uid: 'chef', name: 'Julian Deutsch', role: 'Geschäftsführung', docId: 'chef' };
    zeichne();
    const offen = await screen.findByText(/Offene Anträge \(0\)/);
    const formular = screen.getByText('Antrag stellen');
    expect(offen.compareDocumentPosition(formular) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getByText('Kein Antrag wartet auf eine Entscheidung.')).toBeInTheDocument();
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

/**
 * DER EIGENE ANTRAG (Launch-Check 25.09.2026, K4): die Geschäftsführung hatte
 * sich den eigenen Urlaub selbst genehmigt. Gibt es jemand anderen, der
 * entscheiden darf, entscheidet der — die Datenbank setzt es durch
 * (`app.urlaub_vier_augen`), die Liste zeigt es.
 */
describe('Über den eigenen Antrag entscheidet jemand anderer', () => {
  const chefin: AppUser = { ...monteur, id: 'chef', uid: 'chef', name: 'Julian Deutsch', role: 'Geschäftsführung' };
  const buero: AppUser = { ...monteur, id: 'buch', uid: 'buch', name: 'Herr Bauer', role: 'Buchhaltung' };

  beforeEach(() => {
    rolle = { ...rolle, uid: 'chef', name: 'Julian Deutsch', role: 'Geschäftsführung', docId: 'chef' };
    antraege.push({
      id: 'v-eigen',
      companyId: 'perl',
      userId: 'chef',
      userName: 'Julian Deutsch',
      von: '2026-08-03',
      bis: '2026-08-07',
      tage: 5,
      status: 'Beantragt',
    });
  });

  it('zeigt am eigenen Antrag keine Knöpfe, wenn die Buchhaltung entscheiden kann', async () => {
    belegschaft = [monteur, chefin, buero];
    zeichne();
    expect(await screen.findByText('Entscheidet jemand anderer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Genehmigen' })).not.toBeInTheDocument();
  });

  it('lässt entscheiden, wenn sonst niemand darf — der Antrag bliebe sonst für immer offen', async () => {
    belegschaft = [monteur, chefin];
    zeichne();
    expect(await screen.findByRole('button', { name: 'Genehmigen' })).toBeInTheDocument();
    expect(screen.queryByText('Entscheidet jemand anderer')).not.toBeInTheDocument();
  });

  it('zählt ein deaktiviertes Konto nicht als jemand anderen', async () => {
    belegschaft = [monteur, chefin, { ...buero, active: false }];
    zeichne();
    expect(await screen.findByRole('button', { name: 'Genehmigen' })).toBeInTheDocument();
  });
});

/**
 * ZURÜCKZIEHEN IST LÖSCHEN, und der Knopf heisst nicht danach.
 *
 * Er stand neben dem eigenen Antrag und entfernte ihn sofort — als einziger
 * Löschweg der App ohne Rückfrage, neben elf mit. Der Schaden eines
 * Fehlgriffs ist klein (der Antrag lässt sich neu stellen); die Ausnahme im
 * Verhalten ist es nicht, denn auf sie stellt sich niemand ein.
 */
describe('Einen eigenen Antrag zurückziehen', () => {
  function eigenerAntrag() {
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
  }

  it('fragt nach, bevor der Antrag verschwindet', async () => {
    const nutzer = userEvent.setup();
    eigenerAntrag();
    zeichne();

    await nutzer.click(await screen.findByRole('button', { name: 'Zurückziehen' }));
    // Der Dialog steht — und geschrieben ist noch nichts.
    expect(await screen.findByText('Antrag zurückziehen?')).toBeInTheDocument();
    expect(deleteVacation).not.toHaveBeenCalled();
  });

  it('nennt im Dialog den Zeitraum, um den es geht', async () => {
    // „Wollen Sie wirklich?" ohne Angabe, was gemeint ist, beantwortet
    // niemand bewusst — bei mehreren offenen Anträgen erst recht nicht.
    const nutzer = userEvent.setup();
    eigenerAntrag();
    zeichne();

    await nutzer.click(await screen.findByRole('button', { name: 'Zurückziehen' }));
    // Der Zeitraum steht auch in der Liste dahinter — geprüft wird der Text
    // IM Dialog, sonst bewiese der Test nur, dass die Liste geladen hat.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/06\.07\.2026/)).toBeInTheDocument();
  });

  it('zieht erst nach der Bestätigung zurück', async () => {
    const nutzer = userEvent.setup();
    eigenerAntrag();
    zeichne();

    await nutzer.click(await screen.findByRole('button', { name: 'Zurückziehen' }));
    const dialog = await screen.findByRole('dialog');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Zurückziehen' }));

    expect(deleteVacation).toHaveBeenCalledWith('v9');
  });

  it('und gar nicht, wenn man abbricht', async () => {
    const nutzer = userEvent.setup();
    eigenerAntrag();
    zeichne();

    await nutzer.click(await screen.findByRole('button', { name: 'Zurückziehen' }));
    const dialog = await screen.findByRole('dialog');
    await nutzer.click(within(dialog).getByRole('button', { name: /Abbrechen/i }));

    expect(deleteVacation).not.toHaveBeenCalled();
  });
});

/*
  BETRIEBSURLAUB IST KEIN ANTRAG (Rückmeldung vom 29.09.2026). Er stand
  unter „Meine Anträge" als „Genehmigt von …" mit „Zurücknehmen" daneben —
  für eine Person zurückgenommen, stünde sie im Wochenplan weiter als
  Betriebsurlaub da. Geändert wird er im Reiter „Betriebsurlaub"; die
  Datenbank lehnt das Zurücknehmen ebenfalls ab.
*/
describe('Betriebsurlaub unter „Meine Anträge“', () => {
  beforeEach(() => {
    rolle = { ...rolle, uid: 'chef', name: 'Julian Deutsch', role: 'Geschäftsführung', docId: 'chef' };
    antraege.push(
      {
        id: 'v-bu', companyId: 'perl', userId: 'chef', userName: 'Julian Deutsch',
        von: '2026-12-24', bis: '2027-01-08', tage: 9, status: 'Genehmigt',
        notiz: 'Weihnachten', entschiedenVonName: 'Elias Pierer', betriebsurlaubId: 'bu1',
      },
      {
        id: 'v-selbst', companyId: 'perl', userId: 'chef', userName: 'Julian Deutsch',
        von: '2026-08-03', bis: '2026-08-07', tage: 5, status: 'Genehmigt',
        entschiedenVonName: 'Herr Bauer',
      },
    );
  });

  it('nennt ihn Betriebsurlaub und bietet kein Zurücknehmen an — der eigene Urlaub schon', async () => {
    zeichne();
    expect(await screen.findByText('Betriebsurlaub · eingetragen von Elias Pierer')).toBeInTheDocument();
    expect(screen.queryByText(/Genehmigt von Elias Pierer/)).not.toBeInTheDocument();
    // Gegenprobe: der beantragte Urlaub daneben lässt sich zurücknehmen.
    expect(screen.getByText('Genehmigt von Herr Bauer')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Zurücknehmen' })).toHaveLength(1);
  });
});

/**
 * ZEITAUSGLEICH UND KRANKMELDUNG über dieselbe Maske.
 *
 * Gewünscht: Antragstyp Urlaub | ZA (ganzer Tag oder Stunden) |
 * Krankmeldung ohne Genehmigung; beim ZA ein Blick aufs Guthaben, grün wenn
 * es reicht, eine Warnung wenn nicht — aber keine Sperre.
 */
describe('Zeitausgleich beantragen', () => {
  async function zaWaehlen() {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByLabelText('Von');
    await nutzer.selectOptions(screen.getByLabelText('Art'), 'Zeitausgleich');
    return nutzer;
  }

  it('stundenweise: ein Tag, Von–Bis, die Stunden und das Guthaben gehen mit', async () => {
    const nutzer = await zaWaehlen();
    await nutzer.click(screen.getByLabelText(/Nur einige Stunden/));
    await datum('Tag', '2026-10-27');
    expect(await screen.findByText('ausreichend Zeitguthaben')).toBeInTheDocument();
    expect(screen.getByText('04:00 Std')).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    const v = createVacation.mock.calls[0][1] as Vacation;
    expect(v).toMatchObject({
      art: 'Zeitausgleich', von: '2026-10-27', bis: '2026-10-27', tage: 1,
      zaVon: '13:00', zaBis: '17:00', zaStunden: 4, saldoBeiAntrag: 10, status: 'Beantragt',
    });
  });

  it('ganztags: Arbeitstage mal Tagessoll', async () => {
    const nutzer = await zaWaehlen();
    await datum('Von', '2026-10-27');
    await datum('Bis (einschließlich)', '2026-10-28');
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    const v = createVacation.mock.calls[0][1] as Vacation;
    expect(v).toMatchObject({ art: 'Zeitausgleich', tage: 2, zaStunden: 16, zaVon: null, zaBis: null });
  });

  it('warnt, wenn das Guthaben nicht reicht — und lässt trotzdem beantragen', async () => {
    guthabenH = 2;
    const nutzer = await zaWaehlen();
    await datum('Von', '2026-10-27');
    await datum('Bis (einschließlich)', '2026-10-27');
    expect(await screen.findByText(/reicht nicht/)).toBeInTheDocument();
    expect(screen.queryByText('ausreichend Zeitguthaben')).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    expect(createVacation).toHaveBeenCalledTimes(1);
  });

  it('zählt einen genehmigten ZA nicht gegen den Urlaubsanspruch', async () => {
    antraege.push(
      { id: 'z', companyId: 'perl', userId: 'm1', userName: 'Max', von: '2026-03-02', bis: '2026-03-03',
        tage: 2, status: 'Genehmigt', art: 'Zeitausgleich', zaStunden: 16 },
      { id: 'u', companyId: 'perl', userId: 'm1', userName: 'Max', von: '2026-03-04', bis: '2026-03-04',
        tage: 1, status: 'Genehmigt', art: 'Urlaub' },
    );
    zeichne();
    expect(await screen.findByText(/genehmigt:/)).toHaveTextContent(/genehmigt: 1 von/);
    expect(screen.getByText(/ZA – 2 Tage \(16:00 Std\)/)).toBeInTheDocument();
  });

  it('zeigt dem Genehmigenden die Stunden und das Guthaben beim Antrag', async () => {
    rolle = { ...rolle, uid: 'chef', name: 'Chefin', role: 'Geschäftsführung', docId: 'chef' };
    antraege.push({
      id: 'z1', companyId: 'perl', userId: 'm1', userName: 'Max Mustermann', von: '2026-10-27',
      bis: '2026-10-27', tage: 1, status: 'Beantragt', art: 'Zeitausgleich',
      zaVon: '13:00', zaBis: '17:00', zaStunden: 4, saldoBeiAntrag: 2.5,
    });
    zeichne();
    expect(await screen.findByText(/ZA – 04:00 Std \(13:00–17:00\)/)).toBeInTheDocument();
    expect(screen.getByText(/Zeitguthaben beim Antrag: \+02:30 Std — reicht nicht/)).toBeInTheDocument();
  });
});

describe('Krank melden', () => {
  it('geht ohne Antrag direkt ins Zeitkonto', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByLabelText('Von');
    await nutzer.selectOptions(screen.getByLabelText('Art'), 'Krank');
    await datum('Krank ab', '2026-10-27');
    await datum('Voraussichtlich bis', '2026-10-29');
    await nutzer.click(screen.getByRole('button', { name: 'Krank melden' }));
    expect(krankmeldungSpeichern).toHaveBeenCalledWith(
      expect.objectContaining({ von: '2026-10-27', bis: '2026-10-29' }),
    );
    expect(createVacation).not.toHaveBeenCalled();
    expect(await screen.findByText(/3 Tage eingetragen/)).toBeInTheDocument();
  });

  it('eine vom Büro erfasste Krankmeldung sieht der Monteur nur an (Testbericht 30.09.2026, H8)', async () => {
    eigeneKrank = [{ id: 'k1', companyId: 'perl', userId: 'm1', userName: 'Max', von: '2026-10-27', bis: '2026-10-29',
      gemeldetVonUid: 'bu', gemeldetVonName: 'Brigitte' }];
    zeichne();
    expect(await screen.findByText('Vom Büro erfasst — ändert das Büro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ende ändern' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('eine laufende eigene Meldung: nur noch das Ende ändern, nicht löschen (H8)', async () => {
    eigeneKrank = [{ id: 'k1', companyId: 'perl', userId: 'm1', userName: 'Max', von: '2026-01-05', bis: '2099-01-09',
      gemeldetVonUid: 'm1', gemeldetVonName: 'Max' }];
    zeichne();
    expect(await screen.findByRole('button', { name: 'Ende ändern' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  it('zeigt die eigenen Krankmeldungen', async () => {
    eigeneKrank = [{ id: 'k1', companyId: 'perl', userId: 'm1', userName: 'Max', von: '2026-10-27', bis: '2026-10-29' }];
    zeichne();
    expect(await screen.findByText('Meine Krankmeldungen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ende ändern' })).toBeInTheDocument();
  });
});

describe('Reiter und Betriebsurlaub', () => {
  it('der Monteur sieht keine Büro-Reiter', async () => {
    zeichne();
    await screen.findByLabelText('Von');
    expect(screen.queryByRole('tab', { name: 'Krankenstände' })).not.toBeInTheDocument();
  });

  it('die Buchhaltung sieht Anträge, Krankenstände und Betriebsurlaub', async () => {
    rolle = { ...rolle, uid: 'bu', name: 'Brigitte', role: 'Buchhaltung', docId: 'bu' };
    const nutzer = userEvent.setup();
    zeichne();
    expect(await screen.findByRole('tab', { name: 'Anträge' })).toHaveAttribute('aria-selected', 'true');
    await nutzer.click(screen.getByRole('tab', { name: 'Betriebsurlaub' }));
    expect(await screen.findByLabelText(/Urlaubskonto aller aktiven Mitarbeiter belasten/)).toBeChecked();
    await nutzer.click(screen.getByRole('tab', { name: 'Krankenstände' }));
    expect(await screen.findByRole('button', { name: 'Krankmeldung erfassen' })).toBeInTheDocument();
  });

  it('nennt einen kommenden Betriebsurlaub beim Antrag', async () => {
    betriebsurlaube = [{ id: 'b1', companyId: 'perl', von: '2026-12-28', bis: '2026-12-31',
      bezeichnung: 'Weihnachten', urlaubAbbuchen: true }];
    zeichne();
    expect(await screen.findByText('Weihnachten')).toBeInTheDocument();
    expect(screen.getByText(/wird vom Urlaub abgebucht/)).toBeInTheDocument();
  });

  /*
    TESTBERICHT RUNDE 5, G12: der Hinweis stand bei jeder Antragsart, auch bei
    Krankmeldung und Pflegefreistellung. Er gehört zu Urlaub und
    Zeitausgleich — nur die beiden prüfen gegen den Betriebsurlaub.
  */
  it('nennt den Betriebsurlaub nur bei Urlaub und Zeitausgleich', async () => {
    betriebsurlaube = [{ id: 'b1', companyId: 'perl', von: '2026-12-28', bis: '2026-12-31',
      bezeichnung: 'Weihnachten', urlaubAbbuchen: true }];
    const nutzer = userEvent.setup();
    zeichne();
    expect(await screen.findByText(/wird vom Urlaub abgebucht/)).toBeInTheDocument();
    for (const art of ['Krank', 'pflegefreistellung', 'dienstverhinderung', 'unbezahlt']) {
      await nutzer.selectOptions(screen.getByLabelText('Art'), art);
      expect(screen.queryByText(/wird vom Urlaub abgebucht/), art).toBeNull();
    }
    await nutzer.selectOptions(screen.getByLabelText('Art'), 'Zeitausgleich');
    expect(screen.getByText(/wird vom Urlaub abgebucht/)).toBeInTheDocument();
  });

  it('nennt ihn nicht, wer vom Betriebsurlaub ausgenommen ist', async () => {
    betriebsurlaube = [
      { id: 'b1', companyId: 'perl', von: '2026-12-28', bis: '2026-12-31',
        bezeichnung: 'Weihnachten', urlaubAbbuchen: true, ausgenommen: ['m1'] },
      // Gegenprobe im selben Bild: der Betriebsurlaub, der für ihn gilt, steht da.
      { id: 'b2', companyId: 'perl', von: '2027-08-02', bis: '2027-08-13',
        bezeichnung: 'Sommer', urlaubAbbuchen: true },
    ];
    zeichne();
    expect(await screen.findByText('Sommer')).toBeInTheDocument();
    expect(screen.queryByText('Weihnachten')).toBeNull();
  });
});

describe('Resturlaub', () => {
  const urlaub = (id: string, von: string, tage: number, status: Vacation['status'], userId = 'm1') =>
    ({ id, companyId: 'perl', userId, userName: 'Max Mustermann', von, bis: von, tage, status, art: 'Urlaub' }) as Vacation & { id: string };

  it('steht oben: was bleibt, und was noch beantragt ist', async () => {
    antraege.push(urlaub('g', '2026-03-02', 3, 'Genehmigt'), urlaub('b', '2026-11-02', 2, 'Beantragt'));
    zeichne();
    expect(await screen.findByText('Resturlaub')).toBeInTheDocument();
    expect(screen.getByText('22 Tage')).toBeInTheDocument();
    expect(screen.getByText('3 von 25 genehmigt')).toBeInTheDocument();
    expect(screen.getByText('noch nicht entschieden')).toBeInTheDocument();
    expect(screen.getByText('2 Tage')).toBeInTheDocument();
  });

  it('sagt beim Antrag, was danach bleibt', async () => {
    antraege.push(urlaub('g', '2026-03-02', 3, 'Genehmigt'));
    zeichne();
    await screen.findByLabelText('Von');
    // Mo 26.10. bis Fr 30.10.2026 — mit Nationalfeiertag: vier Arbeitstage.
    await datum('Von', '2026-10-26');
    await datum('Bis (einschließlich)', '2026-10-30');
    expect(screen.getByText(/danach bleiben 18 Tage/)).toBeInTheDocument();
  });

  it('zeigt dem Genehmigenden den Resturlaub des Antragstellers — vorher und nachher', async () => {
    rolle = { ...rolle, uid: 'chef', name: 'Chefin', role: 'Geschäftsführung', docId: 'chef' };
    antraege.push(urlaub('g', '2026-03-02', 20, 'Genehmigt'), urlaub('b', '2026-11-02', 3, 'Beantragt'));
    zeichne();
    expect(await screen.findByText(/Resturlaub: 5 Tage — nach Genehmigung 2 Tage/)).toBeInTheDocument();
  });

  it('zählt einen Betriebsurlaub über Silvester nur mit seinen Tagen im alten Jahr (Testbericht 30.09.2026, H3)', async () => {
    // 24.12.2026–10.01.2027: 8 Urlaubstage, davon 4 im Jahr 2027. Vorher
    // zog die Seite alle 8 im Jahr 2026 ab: „9 von 25", Resturlaub 16.
    antraege.push(
      urlaub('g', '2026-07-03', 1, 'Genehmigt'),
      { ...urlaub('bu', '2026-12-24', 8, 'Genehmigt'), bis: '2027-01-10' },
    );
    zeichne();
    expect(await screen.findByText('5 von 25 genehmigt')).toBeInTheDocument();
    expect(screen.getByText('20 Tage')).toBeInTheDocument();
  });

  it('warnt den Genehmigenden, wenn der Resturlaub nicht reicht', async () => {
    rolle = { ...rolle, uid: 'chef', name: 'Chefin', role: 'Geschäftsführung', docId: 'chef' };
    antraege.push(urlaub('g', '2026-03-02', 24, 'Genehmigt'), urlaub('b', '2026-11-02', 3, 'Beantragt'));
    zeichne();
    expect(await screen.findByText(/nach Genehmigung −2 Tage \(reicht nicht\)/)).toBeInTheDocument();
  });

  it('rechnet eine Anpassung des Anspruchs mit und nennt sie (Plan 10.3)', async () => {
    anpassungen = [{ id: 'a1', userId: 'm1', urlaubsjahr: 2026, tage: -6.25, grund: 'Unbezahlter Urlaub' }];
    antraege.push(urlaub('g', '2026-03-02', 3, 'Genehmigt'));
    zeichne();
    expect(await screen.findByText('15,75 Tage')).toBeInTheDocument();
    expect(screen.getByText('3 von 18,75 genehmigt')).toBeInTheDocument();
    expect(screen.getByText('Davon angepasst: −6,25 Tage')).toBeInTheDocument();
  });

  it('ohne Anpassung steht kein „Davon angepasst"', async () => {
    antraege.push(urlaub('g', '2026-03-02', 3, 'Genehmigt'));
    zeichne();
    expect(await screen.findByText('22 Tage')).toBeInTheDocument();
    expect(screen.queryByText(/Davon angepasst/)).not.toBeInTheDocument();
  });

  it('der Genehmigende sieht den Resturlaub samt Anpassung des Antragstellers', async () => {
    rolle = { ...rolle, uid: 'chef', name: 'Chefin', role: 'Geschäftsführung', docId: 'chef' };
    anpassungen = [{ id: 'a1', userId: 'm1', urlaubsjahr: 2026, tage: -5, grund: 'Elternkarenz' }];
    antraege.push(urlaub('g', '2026-03-02', 20, 'Genehmigt'), urlaub('b', '2026-11-02', 3, 'Beantragt'));
    zeichne();
    expect(await screen.findByText(/Resturlaub: 0 Tage — nach Genehmigung −3 Tage \(reicht nicht\)/)).toBeInTheDocument();
  });
});

describe('Urlaub — erst rechnen, wenn ein Zeitraum gewählt ist (Prüflauf 24.09.2026, D17)', () => {
  it('nennt vor jeder Eingabe keine Arbeitstage, danach schon', async () => {
    zeichne();
    await screen.findByLabelText('Von');
    // Vorbelegt ist heute–heute; „1 Arbeitstag — danach bleiben …" wäre eine
    // Antwort auf eine Frage, die noch niemand gestellt hat.
    expect(screen.queryByText(/danach bleiben/)).toBeNull();
    await datum('Von', '2026-10-26');
    await datum('Bis (einschließlich)', '2026-10-30');
    expect(screen.getByText(/4 Arbeitstage/)).toBeInTheDocument();
  });
});

describe('Ohne Zeitkonto kein Resturlaub (Testbericht 30.09.2026, G13)', () => {
  it('die Administration sieht keinen Resturlaub, sondern warum', async () => {
    eigenesProfil = { ...monteur, uid: 'a1', id: 'a1', name: 'Anna Admin', role: 'Administrator' };
    rolle = { ...rolle, uid: 'a1', name: 'Anna Admin', role: 'Administrator', docId: 'a1' };
    zeichne();
    expect(await screen.findByText(/kein Zeitkonto/)).toBeInTheDocument();
    expect(screen.queryByText('Resturlaub')).not.toBeInTheDocument();
  });

  it('Gegenprobe: der Monteur sieht seinen Resturlaub', async () => {
    zeichne();
    expect(await screen.findByText('Resturlaub')).toBeInTheDocument();
    expect(screen.queryByText(/kein Zeitkonto/)).not.toBeInTheDocument();
  });

  it('ohne Zeitkonto auch kein „genehmigt: x von y Tagen“ und kein „danach bleiben“ (Runde 3, G10)', async () => {
    eigenesProfil = { ...monteur, uid: 'a1', id: 'a1', name: 'Anna Admin', role: 'Administrator' };
    rolle = { ...rolle, uid: 'a1', name: 'Anna Admin', role: 'Administrator', docId: 'a1' };
    zeichne();
    expect(await screen.findByText(/kein Zeitkonto/)).toBeInTheDocument();
    await datum('Von', '2026-10-26');
    await datum('Bis (einschließlich)', '2026-10-30');
    expect(screen.getByText(/4 Arbeitstage/)).toBeInTheDocument();
    expect(screen.queryByText(/genehmigt:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/danach bleiben/)).not.toBeInTheDocument();
  });

  it('Gegenprobe: mit Zeitkonto bleiben „genehmigt“ und „danach bleiben“ stehen', async () => {
    zeichne();
    expect(await screen.findByText('Resturlaub')).toBeInTheDocument();
    await datum('Von', '2026-10-26');
    await datum('Bis (einschließlich)', '2026-10-30');
    expect(screen.getByText(/genehmigt:/)).toBeInTheDocument();
    expect(screen.getByText(/danach bleiben/)).toBeInTheDocument();
  });
});

describe('Sonderurlaub (Plan 10.3)', () => {
  const frei = (rest: Record<string, unknown>) => ({
    id: 'f1', companyId: 'perl', userId: 'm1', userName: 'Max Mustermann', status: 'Beantragt',
    von: '2026-11-11', bis: '2026-11-13', ...rest,
  });

  it('der Antrag auf Sonderurlaub geht mit Anlass und Ereignistag über den eigenen Weg', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'dienstverhinderung');
    await nutzer.selectOptions(screen.getByLabelText(/^Anlass/), 'hochzeit');
    await datum('Tag des Ereignisses', '2026-11-13');
    await datum('Von', '2026-11-11');
    await datum('Bis (einschließlich)', '2026-11-13');
    expect(screen.getByText(/3 Arbeitstage in diesem Zeitraum/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    await waitFor(() => expect(freistellungBeantragen).toHaveBeenCalledTimes(1));
    expect(freistellungBeantragen.mock.calls[0][0]).toMatchObject({
      art: 'dienstverhinderung', anlass: 'hochzeit', ereignisDatum: '2026-11-13', von: '2026-11-11', bis: '2026-11-13',
    });
    expect(createVacation).not.toHaveBeenCalled();
  });

  it('ohne Anlass geht der Antrag nicht hinaus', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'dienstverhinderung');
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    expect(await screen.findByText('Bitte den Anlass wählen.')).toBeInTheDocument();
    expect(freistellungBeantragen).not.toHaveBeenCalled();
  });

  it('ein zweiter Antrag zum selben Anlass braucht eine Begründung — beim Todesfall nicht', async () => {
    freistellungen = [frei({ art: 'dienstverhinderung', anlass: 'hochzeit', ereignisDatum: '2026-11-13' })];
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'dienstverhinderung');
    await nutzer.selectOptions(screen.getByLabelText(/^Anlass/), 'hochzeit');
    await datum('Tag des Ereignisses', '2026-11-13');
    expect(screen.getByLabelText(/^Begründung/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    expect(await screen.findByText(/Bitte in der Notiz begründen/)).toBeInTheDocument();
    expect(freistellungBeantragen).not.toHaveBeenCalled();
    // Gegenprobe: ein anderer Anlass ist kein zweiter Antrag.
    await nutzer.selectOptions(screen.getByLabelText(/^Anlass/), 'geburt');
    expect(screen.queryByLabelText(/^Begründung/)).not.toBeInTheDocument();
  });

  it('die zweite Woche Pflegefreistellung erscheint erst, wenn die erste verbraucht ist', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'pflegefreistellung');
    await nutzer.click(screen.getByLabelText(/Kind unter 12/));
    expect(screen.queryByLabelText(/Zweite Woche/)).not.toBeInTheDocument();
  });

  it('… und mit verbrauchter erster Woche ist sie da', async () => {
    freistellungen = [frei({ art: 'pflegefreistellung', status: 'Bestätigt', von: '2026-09-07', bis: '2026-09-11', minuten: 2400 })];
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'pflegefreistellung');
    await nutzer.click(screen.getByLabelText(/Kind unter 12/));
    expect(screen.getByLabelText(/Zweite Woche/)).toBeInTheDocument();
  });

  // Runde 3, G16: die Überschneidung schon im Formular, nicht erst beim Absenden.
  it('Pflegefreistellung: zeigt die Überschneidung mit einem eigenen Antrag vor dem Absenden', async () => {
    freistellungen = [frei({ art: 'pflegefreistellung', status: 'Bestätigt', von: '2026-11-11', bis: '2026-11-13' })];
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'pflegefreistellung');
    await datum('Von', '2026-11-12');
    await datum('Bis (einschließlich)', '2026-11-12');
    expect(await screen.findByText(
      'Überschneidet sich mit dem Antrag auf Pflegefreistellung vom 11.11.2026 bis 13.11.2026 (Bestätigt). Bitte einen anderen Zeitraum wählen.',
    )).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    expect(freistellungBeantragen).not.toHaveBeenCalled();
  });

  it('Gegenprobe: daneben, abgelehnt oder storniert überschneidet nichts', async () => {
    freistellungen = [
      frei({ art: 'pflegefreistellung', status: 'Bestätigt', von: '2026-11-11', bis: '2026-11-13' }),
      frei({ id: 'f2', art: 'pflegefreistellung', status: 'Abgelehnt', von: '2026-11-16', bis: '2026-11-16' }),
      frei({ id: 'f3', art: 'dienstverhinderung', status: 'Storniert', von: '2026-11-17', bis: '2026-11-17' }),
    ];
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'pflegefreistellung');
    await datum('Von', '2026-11-16');
    await datum('Bis (einschließlich)', '2026-11-17');
    expect(screen.queryByText(/Überschneidet sich/)).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Antrag einreichen' }));
    await waitFor(() => expect(freistellungBeantragen).toHaveBeenCalledTimes(1));
  });

  it('beim Wechsel der Antragsart stehen die Daten des vorigen Antrags nicht mehr da (G16)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'dienstverhinderung');
    await datum('Von', '2026-11-11');
    await datum('Bis (einschließlich)', '2026-11-13');
    await nutzer.type(screen.getByLabelText(/^Anmerkung/), 'Hochzeit Bruder');
    await nutzer.selectOptions(screen.getByLabelText('Art'), 'pflegefreistellung');
    expect((screen.getByLabelText('Von') as HTMLInputElement).value).not.toBe('2026-11-11');
    expect((screen.getByLabelText('Bis (einschließlich)') as HTMLInputElement).value).not.toBe('2026-11-13');
    expect((screen.getByLabelText(/^Anmerkung/) as HTMLInputElement).value).toBe('');
  });

  it('… auch vom Urlaub zur Krankmeldung (G16)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByLabelText('Von');
    await datum('Von', '2026-11-23');
    await datum('Bis (einschließlich)', '2026-11-27');
    await nutzer.selectOptions(screen.getByLabelText('Art'), 'Krank');
    expect((screen.getByLabelText('Krank ab') as HTMLInputElement).value).not.toBe('2026-11-23');
  });

  it('im Antrag: ab 14 Kalendertagen der Hinweis auf die Kürzung, bei 13 nicht (Selbst prüfen)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'unbezahlt');
    await datum('Von', '2027-03-01');
    await datum('Bis (einschließlich)', '2027-03-14');
    expect(screen.getByText(/14 Kalendertage — der Urlaubsanspruch sinkt dadurch aliquot/)).toBeInTheDocument();
    await datum('Bis (einschließlich)', '2027-03-13');
    expect(screen.getByText(/^13 Kalendertage\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/sinkt dadurch aliquot/)).not.toBeInTheDocument();
  });

  it('beim unbezahlten Urlaub kein Nachweis, dafür die Kalendertage', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.selectOptions(await screen.findByLabelText('Art'), 'unbezahlt');
    await datum('Von', '2027-03-01');
    await datum('Bis (einschließlich)', '2027-05-31');
    expect(screen.getByText(/92 Kalendertage — der Urlaubsanspruch sinkt dadurch aliquot/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nachweis wählen' })).not.toBeInTheDocument();
  });

  it('die eigene Liste zeigt Anlass, Entscheidung und den Vermerk zum Nachweis', async () => {
    freistellungen = [frei({
      art: 'dienstverhinderung', anlass: 'tod_eltern', ereignisDatum: '2026-11-10', status: 'Bestätigt',
      entschiedenVonName: 'Frau Wagner', nachweisGeprueftVonName: 'Frau Wagner', nachweisGeprueftAm: Date.UTC(2026, 10, 9, 10),
    })];
    zeichne();
    expect(await screen.findByText('Mein Sonderurlaub')).toBeInTheDocument();
    expect(screen.getByText(/Tod der Eltern oder Schwiegereltern/)).toBeInTheDocument();
    expect(screen.getByText(/Nachweis geprüft von Frau Wagner am 09.11.2026/)).toBeInTheDocument();
  });

  it('die eigene Liste sagt, was mit den Tagen über dem Kontingent geschah (G17)', async () => {
    freistellungen = [frei({
      art: 'dienstverhinderung', anlass: 'tod_eltern', ereignisDatum: '2026-11-10', status: 'Bestätigt',
      entschiedenVonName: 'Frau Wagner', ueberKontingent: 'urlaub', ueberTage: 1, ueberUrlaubId: 'v1',
    })];
    zeichne();
    expect(await screen.findByText('1 Tag über dem Kontingent als Urlaub gebucht')).toBeInTheDocument();
  });

  it('der Mitarbeiter sieht keine Liste zum Bestätigen', async () => {
    zeichne();
    await screen.findByLabelText('Art');
    expect(screen.queryByText('Sonderurlaub bestätigen')).not.toBeInTheDocument();
  });

  describe('Bestätigen', () => {
    const buero = () => {
      rolle = { ...rolle, uid: 'b1', name: 'Frau Wagner', role: 'Buchhaltung', docId: 'b1' };
      belegschaft = [monteur, { ...monteur, uid: 'b1', id: 'b1', name: 'Frau Wagner', role: 'Buchhaltung' }];
    };

    it('mit Nachweis: Bestätigen schickt den Haken mit', async () => {
      buero();
      freistellungen = [frei({ art: 'dienstverhinderung', anlass: 'hochzeit', ereignisDatum: '2026-11-13', nachweisPfad: 'perl/m1/f1/a.pdf' })];
      const nutzer = userEvent.setup();
      zeichne();
      expect(await screen.findByText('Sonderurlaub bestätigen')).toBeInTheDocument();
      await nutzer.click(await screen.findByLabelText('Nachweis geprüft'));
      await nutzer.click(screen.getByRole('button', { name: 'Bestätigen' }));
      await waitFor(() => expect(freistellungEntscheiden).toHaveBeenCalledTimes(1));
      expect(freistellungEntscheiden.mock.calls[0][0]).toMatchObject({ id: 'f1', entscheidung: 'Bestätigt', nachweisGeprueft: true });
    });

    // Runde 3, G26: Safari öffnet ein Fenster nur direkt auf den Klick, nicht nach einem `await`.
    it('„Nachweis ansehen“ öffnet das Fenster sofort und setzt die Adresse danach', async () => {
      buero();
      freistellungen = [frei({ art: 'dienstverhinderung', anlass: 'hochzeit', ereignisDatum: '2026-11-13', nachweisPfad: 'perl/m1/f1/a.pdf' })];
      const fenster = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
      const oeffnen = vi.spyOn(window, 'open').mockReturnValue(fenster as unknown as Window);
      const nutzer = userEvent.setup();
      zeichne();
      await nutzer.click(await screen.findByRole('button', { name: 'Nachweis ansehen' }));
      expect(oeffnen).toHaveBeenCalledWith('', '_blank');
      await waitFor(() => expect(fenster.location.href).toBe('https://beispiel'));
      expect(fenster.opener).toBeNull();
      expect(oeffnen).toHaveBeenCalledTimes(1);
      oeffnen.mockRestore();
    });

    it('warnt, wenn der Beginn mehr als 14 Tage nach dem Ereignis liegt', async () => {
      buero();
      freistellungen = [frei({ art: 'dienstverhinderung', anlass: 'wohnungswechsel', ereignisDatum: '2026-10-20', von: '2026-11-16', bis: '2026-11-17' })];
      zeichne();
      expect(await screen.findByText(/Beginn mehr als 14 Tage nach dem Ereignis/)).toBeInTheDocument();
    });

    it('unbezahlten Urlaub entscheidet das Büro nicht', async () => {
      buero();
      freistellungen = [frei({ art: 'unbezahlt', von: '2026-11-16', bis: '2026-11-17' })];
      zeichne();
      expect(await screen.findByText(/Über unbezahlten Urlaub entscheiden Geschäftsführung oder Administration/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Bestätigen' })).not.toBeInTheDocument();
    });

    it('die Geschäftsführung bestätigt unbezahlten Urlaub samt vorgeschlagener Kürzung', async () => {
      rolle = { ...rolle, uid: 'gf', name: 'Chefin', role: 'Geschäftsführung', docId: 'gf' };
      belegschaft = [monteur, { ...monteur, uid: 'gf', id: 'gf', name: 'Chefin', role: 'Geschäftsführung' }];
      freistellungen = [frei({ art: 'unbezahlt', von: '2027-03-01', bis: '2027-05-31' })];
      const nutzer = userEvent.setup();
      zeichne();
      expect(await screen.findByText(/verringert sich der Jahresanspruch um 6,3 Tage/)).toBeInTheDocument();
      await nutzer.click(screen.getByRole('button', { name: 'Bestätigen' }));
      await waitFor(() => expect(freistellungEntscheiden).toHaveBeenCalledTimes(1));
      expect(freistellungEntscheiden.mock.calls[0][0]).toMatchObject({
        entscheidung: 'Bestätigt', kuerzung: [{ urlaubsjahr: 2027, tage: 6.3 }],
      });
    });

    /*
      RUNDE 3, G17: „3 Arbeitstage — vorgesehen sind 2“ ging ohne Begründung
      durch. Jetzt erst nach einer Wahl: als Urlaub buchen oder mit Grund als
      Sonderurlaub bestätigen. 11.–13.11.2026 sind Mi–Fr, drei Arbeitstage.
    */
    const ueberKontingent = () =>
      frei({ art: 'dienstverhinderung', anlass: 'tod_eltern', ereignisDatum: '2026-11-09' });

    it('über dem Kontingent: ohne Wahl kein Bestätigen (G17)', async () => {
      buero();
      freistellungen = [ueberKontingent()];
      const nutzer = userEvent.setup();
      zeichne();
      expect(await screen.findByText(/1 Arbeitstag liegt über dem Kontingent/)).toBeInTheDocument();
      await nutzer.click(screen.getByRole('button', { name: 'Bestätigen' }));
      expect(await screen.findByText(/Bitte wählen, wie die Tage über dem Kontingent gebucht werden/)).toBeInTheDocument();
      expect(freistellungEntscheiden).not.toHaveBeenCalled();
    });

    it('über dem Kontingent: „als Urlaub buchen“ geht mit der Wahl an die Datenbank (G17)', async () => {
      buero();
      freistellungen = [ueberKontingent()];
      const nutzer = userEvent.setup();
      zeichne();
      await nutzer.click(await screen.findByLabelText(/Tage darüber als Urlaub buchen/));
      await nutzer.click(screen.getByRole('button', { name: 'Bestätigen' }));
      await waitFor(() => expect(freistellungEntscheiden).toHaveBeenCalledTimes(1));
      expect(freistellungEntscheiden.mock.calls[0][0]).toMatchObject({
        id: 'f1', entscheidung: 'Bestätigt', ueberKontingent: 'urlaub',
      });
    });

    it('über dem Kontingent: „als Sonderurlaub“ nur mit Grund (G17)', async () => {
      buero();
      freistellungen = [ueberKontingent()];
      const nutzer = userEvent.setup();
      zeichne();
      await nutzer.click(await screen.findByLabelText(/Als Sonderurlaub bestätigen/));
      await nutzer.click(screen.getByRole('button', { name: 'Bestätigen' }));
      expect(await screen.findByText(/Bitte begründen, warum die Tage über dem Kontingent/)).toBeInTheDocument();
      expect(freistellungEntscheiden).not.toHaveBeenCalled();
      await nutzer.type(screen.getByLabelText(/^Grund für die Tage darüber/), 'Beisetzung im Ausland');
      await nutzer.click(screen.getByRole('button', { name: 'Bestätigen' }));
      await waitFor(() => expect(freistellungEntscheiden).toHaveBeenCalledTimes(1));
      expect(freistellungEntscheiden.mock.calls[0][0]).toMatchObject({
        ueberKontingent: 'sonderurlaub', ueberGrund: 'Beisetzung im Ausland',
      });
    });

    it('Gegenprobe: im Kontingent keine Wahl, und es geht wie bisher (G17)', async () => {
      buero();
      freistellungen = [frei({ art: 'dienstverhinderung', anlass: 'hochzeit', ereignisDatum: '2026-11-13' })];
      const nutzer = userEvent.setup();
      zeichne();
      await screen.findByText('Sonderurlaub bestätigen');
      expect(screen.queryByText(/über dem Kontingent/)).not.toBeInTheDocument();
      await nutzer.click(await screen.findByRole('button', { name: 'Bestätigen' }));
      await waitFor(() => expect(freistellungEntscheiden).toHaveBeenCalledTimes(1));
      expect(freistellungEntscheiden.mock.calls[0][0]).toMatchObject({ ueberKontingent: null });
    });

    it('„als Urlaub“ nur, wer über Urlaub entscheidet (G17)', async () => {
      buero();
      genehmiger = ['gf'];
      freistellungen = [ueberKontingent()];
      zeichne();
      expect(await screen.findByLabelText(/Tage darüber als Urlaub buchen/)).toBeDisabled();
      expect(screen.getByText('Nur, wer über Urlaub entscheidet.')).toBeInTheDocument();
      expect(screen.getByLabelText(/Als Sonderurlaub bestätigen/)).not.toBeDisabled();
    });

    it('bestätigt mit Urlaub: der Vermerk steht da, zurücknehmen nur, wer über Urlaub entscheidet (G17)', async () => {
      buero();
      genehmiger = ['gf'];
      laufendeFrei = [frei({
        id: 'f9', art: 'dienstverhinderung', anlass: 'tod_eltern', ereignisDatum: '2026-11-09', status: 'Bestätigt',
        ueberKontingent: 'urlaub', ueberTage: 1, ueberUrlaubId: 'v9',
      })];
      zeichne();
      expect(await screen.findByText('1 Tag über dem Kontingent als Urlaub gebucht')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Zurücknehmen' })).not.toBeInTheDocument();
      expect(screen.getByText(/Zurücknehmen kann, wer über Urlaub entscheidet/)).toBeInTheDocument();
    });

    it('Gegenprobe: ohne Urlaub darüber nimmt das Büro wie bisher zurück (G17)', async () => {
      buero();
      genehmiger = ['gf'];
      laufendeFrei = [frei({
        id: 'f9', art: 'dienstverhinderung', anlass: 'tod_eltern', ereignisDatum: '2026-11-09', status: 'Bestätigt',
        ueberKontingent: 'sonderurlaub', ueberTage: 1, ueberGrund: 'Beisetzung im Ausland',
      })];
      zeichne();
      expect(await screen.findByText('1 Tag über dem Kontingent als Sonderurlaub bestätigt — Beisetzung im Ausland')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Zurücknehmen' })).toBeInTheDocument();
    });

    /*
      SELBST PRÜFEN (Arbeitsauftrag Runde 3): unbezahlter Urlaub ab 14
      Kalendertagen mit Kürzungsvorschlag, Zurücknehmen nimmt die Kürzung weg.
      Dass die Datenbank die Kürzung mit dem Storno entfernt, prüft
      `tests/supabase/freistellungen.test.ts`; hier die Grenze und der Weg.
    */
    it('Kürzungsvorschlag ab 14 Kalendertagen — bei 13 keiner (Selbst prüfen)', async () => {
      rolle = { ...rolle, uid: 'gf', name: 'Chefin', role: 'Geschäftsführung', docId: 'gf' };
      belegschaft = [monteur, { ...monteur, uid: 'gf', id: 'gf', name: 'Chefin', role: 'Geschäftsführung' }];
      freistellungen = [
        frei({ id: 'f14', art: 'unbezahlt', von: '2027-03-01', bis: '2027-03-14' }),
        frei({ id: 'f13', art: 'unbezahlt', von: '2027-04-05', bis: '2027-04-17' }),
      ];
      zeichne();
      // 25 × 14 ÷ 365 = 0,96
      expect(await screen.findByText(/von 14 Tagen verringert sich der Jahresanspruch um 0,96 Tage/)).toBeInTheDocument();
      expect(screen.queryByText(/von 13 Tagen verringert sich/)).not.toBeInTheDocument();
      expect(screen.getAllByText(/Kalendertage/).some((e) => /13 Kalendertage/.test(e.textContent ?? ''))).toBe(true);
    });

    it('Zurücknehmen nennt die Kürzung und schickt den Storno mit Grund (Selbst prüfen)', async () => {
      rolle = { ...rolle, uid: 'gf', name: 'Chefin', role: 'Geschäftsführung', docId: 'gf' };
      belegschaft = [monteur, { ...monteur, uid: 'gf', id: 'gf', name: 'Chefin', role: 'Geschäftsführung' }];
      laufendeFrei = [frei({ id: 'f7', art: 'unbezahlt', status: 'Bestätigt', von: '2027-03-01', bis: '2027-05-31' })];
      const nutzer = userEvent.setup();
      zeichne();
      await nutzer.click(await screen.findByRole('button', { name: 'Zurücknehmen' }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(/eine Kürzung des Anspruchs mit ihnen/);
      await nutzer.type(within(dialog).getByRole('textbox', { name: /Grund/ }), 'Doch nicht');
      await nutzer.click(within(dialog).getByRole('button', { name: 'Zurücknehmen' }));
      await waitFor(() => expect(freistellungEntscheiden).toHaveBeenCalledTimes(1));
      expect(freistellungEntscheiden.mock.calls[0][0]).toEqual({ id: 'f7', entscheidung: 'Storniert', grund: 'Doch nicht' });
    });

    it('abgewählt geht die Kürzung nicht mit', async () => {
      rolle = { ...rolle, uid: 'gf', name: 'Chefin', role: 'Geschäftsführung', docId: 'gf' };
      belegschaft = [monteur, { ...monteur, uid: 'gf', id: 'gf', name: 'Chefin', role: 'Geschäftsführung' }];
      freistellungen = [frei({ art: 'unbezahlt', von: '2027-03-01', bis: '2027-05-31' })];
      const nutzer = userEvent.setup();
      zeichne();
      await nutzer.click(await screen.findByLabelText('Urlaubsjahr 2027 kürzen'));
      await nutzer.click(screen.getByRole('button', { name: 'Bestätigen' }));
      await waitFor(() => expect(freistellungEntscheiden).toHaveBeenCalledTimes(1));
      expect(freistellungEntscheiden.mock.calls[0][0]).toMatchObject({ kuerzung: [] });
    });
  });
});

/*
  DER ANTRAG MIT SEINEM VERLAUF (Linie „Lot“, Protokoll E8). Die Zeile in
  „Meine Anträge“ sagt den Stand; ein Tipp darauf öffnet das Seitenfenster
  mit dem Verlauf — nur aus dem, was der Antrag trägt — und denselben
  Handgriffen wie in der Zeile, mit derselben Rückfrage.
*/
describe('Antrag mit Verlauf (Linie „Lot“)', () => {
  const ms = (j: number, m: number, t: number) => new Date(j, m - 1, t, 10).getTime();
  const verlauf = () => screen.getByRole('list', { name: 'Verlauf des Antrags' });

  it('ein Tipp auf den Antrag zeigt Antrag, Entscheidung und Urlaub als Lot', async () => {
    const nutzer = userEvent.setup();
    antraege.push({
      id: 'v-alt', companyId: 'perl', userId: 'm1', userName: 'Max Mustermann',
      von: '2025-07-07', bis: '2025-07-11', tage: 5, status: 'Genehmigt', notiz: 'Gardasee',
      createdAt: ms(2025, 5, 2), entschiedenAm: ms(2025, 5, 5), entschiedenVonName: 'Julian Deutsch',
    });
    zeichne();
    // Gegenprobe: zu, solange niemand tippt.
    await screen.findByText('Meine Anträge');
    expect(screen.queryByRole('dialog', { name: 'Urlaubsantrag' })).toBeNull();

    await nutzer.click(await screen.findByRole('button', { name: /07\.07\.2025 – 11\.07\.2025 – Verlauf anzeigen/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Urlaubsantrag' });
    const punkte = within(verlauf()).getAllByRole('listitem').map((p) => p.textContent);
    expect(punkte).toEqual([
      'Beantragt02.05.2025Gardasee',
      'Genehmigt05.05.2025von Julian Deutsch',
      'Urlaub07.07.2025 – 11.07.2025vorbei',
    ]);
    // Vorbei ist vorbei: kein Punkt steht auf „jetzt“.
    expect(within(fenster).queryByRole('listitem', { current: 'step' })).toBeNull();
    expect(within(fenster).getByText('5 Urlaubstage')).toBeInTheDocument();
  });

  it('ein offener Antrag steht auf „Entscheidung offen“ — Zurückziehen fragt wie in der Zeile', async () => {
    const nutzer = userEvent.setup();
    antraege.push({
      id: 'v9', companyId: 'perl', userId: 'm1', userName: 'Max Mustermann',
      von: '2026-07-06', bis: '2026-07-10', tage: 5, status: 'Beantragt', createdAt: ms(2026, 6, 1),
    });
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: /Verlauf anzeigen/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Urlaubsantrag' });
    expect(within(verlauf()).getByRole('listitem', { current: 'step' })).toHaveTextContent('Entscheidung offen');

    await nutzer.click(within(fenster).getByRole('button', { name: 'Zurückziehen' }));
    // Das Fenster geht zu, die Rückfrage steht allein — geschrieben ist noch nichts.
    expect(screen.queryByRole('dialog', { name: 'Urlaubsantrag' })).toBeNull();
    const rueckfrage = await screen.findByRole('dialog');
    expect(rueckfrage).toHaveTextContent('Antrag zurückziehen?');
    expect(deleteVacation).not.toHaveBeenCalled();
    await nutzer.click(within(rueckfrage).getByRole('button', { name: 'Zurückziehen' }));
    expect(deleteVacation).toHaveBeenCalledWith('v9');
  });

  it('beim Betriebsurlaub kein Zurücknehmen im Fenster — beim eigenen Urlaub schon', async () => {
    const nutzer = userEvent.setup();
    rolle = { ...rolle, uid: 'chef', name: 'Julian Deutsch', role: 'Geschäftsführung', docId: 'chef' };
    antraege.push(
      {
        id: 'v-bu', companyId: 'perl', userId: 'chef', userName: 'Julian Deutsch',
        von: '2025-12-24', bis: '2026-01-02', tage: 5, status: 'Genehmigt',
        entschiedenVonName: 'Elias Pierer', entschiedenAm: ms(2025, 11, 3), betriebsurlaubId: 'bu1',
      },
      {
        id: 'v-selbst', companyId: 'perl', userId: 'chef', userName: 'Julian Deutsch',
        von: '2025-08-04', bis: '2025-08-08', tage: 5, status: 'Genehmigt', entschiedenVonName: 'Herr Bauer',
      },
    );
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: /24\.12\.2025 – 02\.01\.2026 – Verlauf/ }));
    let fenster = await screen.findByRole('dialog', { name: 'Urlaubsantrag' });
    expect(within(verlauf()).getAllByRole('listitem')[0]).toHaveTextContent('Betriebsurlaub eingetragen03.11.2025von Elias Pierer');
    expect(within(fenster).queryByRole('button', { name: 'Zurücknehmen' })).toBeNull();
    await nutzer.click(within(fenster).getByRole('button', { name: 'Schließen' }));

    await nutzer.click(screen.getByRole('button', { name: /04\.08\.2025 – 08\.08\.2025 – Verlauf/ }));
    fenster = await screen.findByRole('dialog', { name: 'Urlaubsantrag' });
    expect(within(fenster).getByRole('button', { name: 'Zurücknehmen' })).toBeInTheDocument();
  });

  it('der Sonderurlaub zeigt Antrag, geprüften Nachweis und Bestätigung als Lot', async () => {
    const nutzer = userEvent.setup();
    freistellungen = [{
      id: 'f1', companyId: 'perl', userId: 'm1', userName: 'Max Mustermann',
      art: 'dienstverhinderung', anlass: 'tod_eltern', ereignisDatum: '2025-11-10',
      von: '2025-11-11', bis: '2025-11-13', status: 'Bestätigt', createdAt: ms(2025, 11, 10),
      entschiedenVonName: 'Frau Wagner', entschiedenAm: ms(2025, 11, 12),
      nachweisGeprueftVonName: 'Frau Wagner', nachweisGeprueftAm: ms(2025, 11, 12),
    }];
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: /11\.11\.2025 – 13\.11\.2025 – Verlauf/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Antrag auf Sonderurlaub' });
    expect(within(fenster).getByText(/Tod der Eltern oder Schwiegereltern/)).toBeInTheDocument();
    const titel = within(verlauf()).getAllByRole('listitem').map((p) => p.querySelector('.lot-titel')?.textContent);
    expect(titel).toEqual(['Beantragt', 'Nachweis geprüft', 'Bestätigt', 'Sonderurlaub']);
    // Bestätigt ist nichts mehr zu tun: keine Handgriffe im Fenster.
    expect(within(fenster).queryByRole('button', { name: 'Zurückziehen' })).toBeNull();
  });
});
