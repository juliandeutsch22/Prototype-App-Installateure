import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const createVacation = vi.fn<[string, unknown], Promise<string>>(async () => 'v-neu');

/**
 * Entschieden wird SERVERSEITIG. Der Browser schickt nur, welcher Antrag wie
 * entschieden wird — er darf die Zeiteinträge des Antragstellers weder lesen
 * noch schreiben.
 */
// Die Signatur steht am Doppelgänger, nicht an seinen Parametern: der Test
// liest später, MIT WELCHER Id gelöscht wurde.
const deleteVacation = vi.fn<[string], Promise<void>>(async () => undefined);

const callUrlaubEntscheiden = vi.fn<
  [
    {
      vacationId: string;
      entscheidung: 'Genehmigt' | 'Abgelehnt' | 'Storniert';
      grund?: string;
      entscheiderName?: string;
    },
  ],
  Promise<{ status: string; angelegt: number; uebersprungen: number; entfernt: number }>
>(async () => ({ status: 'Genehmigt', angelegt: 5, uebersprungen: 0, entfernt: 0 }));

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
vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => monteur),
  listUsers: vi.fn(async () => belegschaft),
}));

const krankmeldungSpeichern = vi.fn<[unknown], Promise<unknown>>(
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

    expect(screen.getByText(/Überschneidet sich mit dem Betriebsurlaub „Weihnachten"/)).toBeInTheDocument();
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

  it('sagt „im Zeitkonto" nur, wo eines geführt wird (Launch-Check, M4)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Max Mustermann');
    await nutzer.click(screen.getByRole('button', { name: 'Genehmigen' }));
    expect(await screen.findByText('Genehmigt — 5 Tage im Zeitkonto eingetragen')).toBeInTheDocument();
  });

  it('beim Administrator ohne Zeitkonto nur „eingetragen"', async () => {
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

  it('warnt den Genehmigenden, wenn der Resturlaub nicht reicht', async () => {
    rolle = { ...rolle, uid: 'chef', name: 'Chefin', role: 'Geschäftsführung', docId: 'chef' };
    antraege.push(urlaub('g', '2026-03-02', 24, 'Genehmigt'), urlaub('b', '2026-11-02', 3, 'Beantragt'));
    zeichne();
    expect(await screen.findByText(/nach Genehmigung −2 Tage \(reicht nicht\)/)).toBeInTheDocument();
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
