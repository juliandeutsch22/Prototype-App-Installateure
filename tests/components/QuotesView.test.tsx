import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Quote } from '@/types';

/**
 * Das Angebot schließt die Kette nach vorne — und genau eine Zahl daraus
 * entscheidet später über die Budget-Ampel der Baustelle: die kalkulierte
 * Arbeitszeit.
 *
 * Der Fehler, den dieser Test verhindert, ist der naheliegende: alle Zeilen
 * mit der Einheit „h" zu summieren. Eine Anfahrtspauschale wird oft in
 * Stunden angesetzt und ist trotzdem keine Arbeitszeit. Zählte sie mit,
 * bekäme die Baustelle ein zu hohes Budget, und die Ampel bliebe grün,
 * während der Auftrag längst gerissen ist — ein Fehler, der Geld kostet und
 * erst bei der Nachkalkulation auffällt.
 */

const kunden: (Customer & { id: string })[] = [
  { id: 'k1', companyId: 'perl', name: 'Gemeinde Neudorf', address: 'Rathausplatz 1' },
];

/**
 * Mit Parametern TYPISIERT, nicht benannt: sonst leitet TypeScript ein leeres
 * Tupel ab und der Zugriff auf `mock.calls[0][1]` scheitert im Build. Die
 * Signatur steht deshalb als Typ da, ohne unbenutzte Bezeichner.
 */
const createQuote = vi.fn<(a0: string, a1: unknown) => Promise<string>>(async () => 'q1');
const createProject = vi.fn<(a0: string, a1: unknown) => Promise<string>>(async () => 'p1');
const updateQuote = vi.fn<(a0: string, a1: unknown) => Promise<void>>(async () => undefined);
const angebote: (Quote & { id: string })[] = [];

vi.mock('@/lib/db/quotes', () => ({
  listRecentQuotes: vi.fn(async () => angebote),
  createQuote: (c: string, q: unknown) => createQuote(c, q),
  updateQuote: (id: string, d: unknown) => updateQuote(id, d),
  deleteQuote: vi.fn(async () => undefined),
  reserveQuoteNumber: vi.fn(async () => 'AN-2026-0001'),
}));
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => kunden) }));
/** Der Katalog für „Aus dem Katalog …“ (M18) — gesucht wird auf dem Server. */
const sucheKatalog = vi.fn<(c: string, b: string) => Promise<unknown[]>>(async () => [
  { id: 'm1', companyId: 'perl', name: 'Gastherme 24 kW', articleNumber: 'GT-24', unit: 'Stk', verkaufspreis: 2500, stock: 0 },
  { id: 'm2', companyId: 'perl', name: 'Gastherme alt', unit: 'Stk', verkaufspreis: 1, stock: 0, ausgelaufen: true },
]);
vi.mock('@/lib/db/materials', () => ({ sucheKatalog: (c: string, b: string) => sucheKatalog(c, b) }));
let aktiveBaustellen: { projectNumber: string }[] = [];
const reserveProjectNumber = vi.fn<(a0: string, a1: unknown) => Promise<string | null>>(
  async () => 'B-2026-0012',
);
/** Baustellen, die es zu einer Nummer schon gibt — für das zweite Annehmen. */
let bestehende: { projectNumber: string }[] = [];
vi.mock('@/lib/db/projects', () => ({
  createProject: (c: string, p: unknown) => createProject(c, p),
  listActiveProjects: vi.fn(async () => aktiveBaustellen),
  listProjectsByNumbers: vi.fn(async (_c: string, nummern: string[]) =>
    bestehende.filter((b) => nummern.includes(b.projectNumber))),
  reserveProjectNumber: (c: string, o: unknown) => reserveProjectNumber(c, o),
}));

const authWert = {
  user: {
    uid: 'chef',
    email: 'chefin@perl.at',
    name: 'Julian Deutsch',
    role: 'Geschäftsführung' as const,
    companyId: 'perl',
    docId: 'chef',
  },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: QuotesView } = await import('@/features/quotes/QuotesView');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <QuotesView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/**
 * Das Kalkulationsformular aufklappen.
 *
 * SEIT DEM 18.09. STEHT ES NICHT MEHR OFFEN. Gemessen am Telefon begann die
 * Angebotsliste bei 1332 px — gut zwei Bildschirme unter der Kante, und
 * darüber das längste Formular der App.
 */
async function formOeffnen() {
  await userEvent.click(await screen.findByRole('button', { name: 'Neues Angebot' }));
}

beforeEach(() => {
  createQuote.mockClear();
  createProject.mockClear();
  updateQuote.mockClear();
  reserveProjectNumber.mockClear();
  createProject.mockReset().mockResolvedValue('p1');
  aktiveBaustellen = [];
  bestehende = [];
  angebote.length = 0;
  // Bearbeiten scrollt zum Formular hinauf; jsdom kennt das nicht.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

/** Ein versendetes Angebot AN-2026-0007 über 20 kalkulierte Stunden. */
/**
 * Annehmen, wie es jemand tut: Knopf, dann die Rückfrage bestätigen
 * (Launch-Check, M8 — vorher legte ein Klick die Baustelle ohne Rückfrage an).
 */
async function annehmenBestaetigt(nutzer: ReturnType<typeof userEvent.setup>) {
  await nutzer.click(screen.getByRole('button', { name: 'Annehmen → Baustelle' }));
  await nutzer.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annehmen' }));
}

function versendetesAngebot() {
  angebote.push({
    id: 'q1',
    companyId: 'perl',
    quoteNumber: 'AN-2026-0007',
    customerId: 'k1',
    customerName: 'Gemeinde Neudorf',
    address: 'Rathausplatz 1',
    quoteDate: '2026-09-01',
    validUntil: '2026-10-01',
    status: 'Versendet',
    positions: [],
    subtotalNetto: 1300,
    totalNetto: 1300,
    totalVat: 260,
    totalBrutto: 1560,
    vatRate: 0.2,
    kalkulierteStunden: 20,
  });
}

describe('Angebot kalkulieren', () => {
  it('zeigt die Liste zuerst, nicht die leere Kalkulation', async () => {
    // Gemessen: 1332 px bis zur ersten Zeile. Das Kalkulationsformular ist
    // das längste der vier Ansichten und der seltenste Vorgang.
    zeichne();
    await screen.findByRole('button', { name: 'Neues Angebot' });
    expect(screen.queryByLabelText('Kunde')).not.toBeInTheDocument();
  });

  it('klappt die Kalkulation auf und wieder zu', async () => {
    zeichne();
    await formOeffnen();
    expect(screen.getByLabelText('Kunde')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByLabelText('Kunde')).not.toBeInTheDocument();
  });

  it('zählt nur echte Arbeitszeit ins Stundenbudget', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();

    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');

    // Zeile 1: 20 Stunden Montage — echte Arbeitszeit.
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Montage Heizung');
    await nutzer.type(screen.getByLabelText('Menge'), '20');
    await nutzer.type(screen.getByLabelText('Einheit'), 'h');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), '65');

    // Zeile 2: Anfahrtspauschale, ebenfalls in „h" — aber KEINE Arbeitszeit.
    await nutzer.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    const bezeichnungen = screen.getAllByLabelText('Bezeichnung');
    const mengen = screen.getAllByLabelText('Menge');
    const preise = screen.getAllByLabelText('Einzelpreis netto');
    await nutzer.type(bezeichnungen[1], 'Anfahrtspauschale');
    await nutzer.type(mengen[1], '2');
    await nutzer.type(screen.getAllByLabelText('Einheit')[1], 'h');
    await nutzer.type(preise[1], '45');
    await nutzer.click(screen.getAllByRole('checkbox')[1]);

    // 20 h, nicht 22 — die Pauschale zählt nicht mit.
    expect(screen.getByText(/Kalkulierte Arbeitszeit/)).toHaveTextContent('20 h');

    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));

    const uebergeben = createQuote.mock.calls[0]?.[1] as unknown as Quote;
    expect(uebergeben.kalkulierteStunden).toBe(20);
    // Der Preis enthält beide Zeilen: 20×65 + 2×45 = 1390 netto.
    expect(uebergeben.totalNetto).toBe(1390);
    expect(uebergeben.positions).toHaveLength(2);
  });

  /*
    PRÜFLAUF 25.09.2026, P2-22. Gezählt wurden auch Zeilen, die beim Speichern
    wegfallen (ohne Bezeichnung), und Helferstunden — die Budget-Ampel misst
    aber nur die Facharbeiterzeit.
  */
  it('zählt eine Zeile ohne Bezeichnung nicht ins Budget', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Montage');
    await nutzer.type(screen.getByLabelText('Menge'), '8');
    await nutzer.type(screen.getByLabelText('Einheit'), 'h');
    await nutzer.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    await nutzer.type(screen.getAllByLabelText('Menge')[1], '5');
    await nutzer.type(screen.getAllByLabelText('Einheit')[1], 'h');

    expect(screen.getByText(/Kalkulierte Arbeitszeit/)).toHaveTextContent('8 h');
  });

  it('zählt Helferstunden nicht von selbst ins Budget — von Hand angehakt schon', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Facharbeiterstunden');
    await nutzer.type(screen.getByLabelText('Menge'), '10');
    await nutzer.type(screen.getByLabelText('Einheit'), 'h');
    await nutzer.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    await nutzer.type(screen.getAllByLabelText('Bezeichnung')[1], 'Helferstunden');
    await nutzer.type(screen.getAllByLabelText('Menge')[1], '6');
    await nutzer.type(screen.getAllByLabelText('Einheit')[1], 'h');

    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked();
    expect(screen.getByText(/Kalkulierte Arbeitszeit/)).toHaveTextContent('10 h');

    // Wer es anders will, entscheidet selbst.
    await nutzer.click(screen.getAllByRole('checkbox')[1]);
    expect(screen.getByText(/Kalkulierte Arbeitszeit/)).toHaveTextContent('16 h');
  });

  it('rechnet Netto, USt und Brutto mit derselben Funktion wie die Rechnung', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Pauschale');
    await nutzer.type(screen.getByLabelText('Menge'), '1');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), '1000');

    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    const q = createQuote.mock.calls[0]?.[1] as unknown as Quote;
    expect(q.totalNetto).toBe(1000);
    expect(q.totalVat).toBe(200); // 20 % Standard
    expect(q.totalBrutto).toBe(1200);
  });

  it('ersetzt die vorgeschlagene Kundenanschrift beim Tippen, statt anzuhängen (G3)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    const ort = screen.getByLabelText('Ort der Leistung');
    expect(ort).toHaveValue('Rathausplatz 1');
    await nutzer.type(ort, 'Schulgasse 4');
    expect(ort).toHaveValue('Schulgasse 4');
  });

  it('Gegenprobe: wer die Anschrift ergänzt statt ersetzt, kann das — nach dem ersten Tippen hängt es an', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    const ort = screen.getByLabelText('Ort der Leistung');
    await nutzer.type(ort, 'Schulgasse 4');
    await nutzer.type(ort, ', Turnsaal');
    expect(ort).toHaveValue('Schulgasse 4, Turnsaal');
  });

  it('liest „7.500,50“ als 7.500,50 € — nicht als 0 (Testbericht 30.09.2026, M15)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Heizung');
    await nutzer.type(screen.getByLabelText('Menge'), '1');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), '7.500,50');
    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    const q = createQuote.mock.calls[0]?.[1] as unknown as Quote;
    expect(q.totalNetto).toBe(7500.5);
  });

  it('Gegenprobe: „7.500“ ist uneindeutig — gemeldet, und nichts wird angelegt', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Heizung');
    await nutzer.type(screen.getByLabelText('Menge'), '1');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), '7.500');
    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    expect((await screen.findAllByText(/nicht eindeutig/)).length).toBeGreaterThan(0);
    expect(createQuote).not.toHaveBeenCalled();
  });

  it('legt beim Annehmen die Baustelle MIT Stundenbudget an', async () => {
    angebote.push({
      id: 'q1',
      companyId: 'perl',
      quoteNumber: 'AN-2026-0007',
      customerId: 'k1',
      customerName: 'Gemeinde Neudorf',
      address: 'Rathausplatz 1',
      quoteDate: '2026-09-01',
      validUntil: '2026-10-01',
      status: 'Versendet',
      positions: [],
      subtotalNetto: 1300,
      totalNetto: 1300,
      totalVat: 260,
      totalBrutto: 1560,
      vatRate: 0.2,
      kalkulierteStunden: 20,
    });
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);

    await annehmenBestaetigt(nutzer);

    /**
     * Der eigentliche Zweck des ganzen Schritts: das Stundenbudget stammt aus
     * der Kalkulation und nicht aus einem zweiten Mal Abtippen. Erst damit
     * misst die Budget-Ampel gegen eine Zahl mit Herkunft.
     */
    const projekt = createProject.mock.calls[0]?.[1] as unknown as {
      estimatedHours?: number;
      projectNumber: string;
      customerId?: string;
    };
    expect(projekt.estimatedHours).toBe(20);
    // Die Nummer kommt aus dem Zähler der Baustellen, nicht aus dem Angebot
    // (Launch-Check, K6) — zuordenbar bleibt es über die Kennung.
    expect(projekt.projectNumber).toBe('B-2026-0012');
    expect(projekt.customerId).toBe('k1');
    expect(updateQuote).toHaveBeenCalledWith('q1', {
      status: 'Angenommen',
      projectNumber: 'B-2026-0012',
    });
  });

  /*
    GEFUNDEN BEIM PROBELAUF. Jede neue Position beginnt mit „h" und dem Haken
    „Arbeitszeit". Wer auf „Stk" umstellte, behielt ihn — 16 Stunden Montage
    und eine Armatur ergaben 17 h Budget.
  */
  it('zählt eine Position in Stück nicht als Arbeitszeit', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Montage');
    await nutzer.type(screen.getByLabelText('Menge'), '16');
    await nutzer.type(screen.getByLabelText('Einheit'), 'h');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), '68');

    await nutzer.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    await nutzer.type(screen.getAllByLabelText('Bezeichnung')[1], 'Rohrschelle');
    await nutzer.type(screen.getAllByLabelText('Menge')[1], '20');
    await nutzer.clear(screen.getAllByLabelText('Einheit')[1]);
    await nutzer.type(screen.getAllByLabelText('Einheit')[1], 'Stk');
    await nutzer.type(screen.getAllByLabelText('Einzelpreis netto')[1], '3');

    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked();
    expect(screen.getByText(/Kalkulierte Arbeitszeit/)).toHaveTextContent('16 h');
  });

  it('eine neue Position zählt erst als Arbeitszeit, wenn „h“ eingetragen ist (Launch-Check, M7)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Heizkörper');
    await nutzer.type(screen.getByLabelText('Menge'), '1');
    expect(screen.getByLabelText('Einheit')).toHaveValue('');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await nutzer.type(screen.getByLabelText('Einheit'), 'h');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('lässt einen von Hand gesetzten Haken stehen, auch wenn die Einheit wechselt', async () => {
    // Eine Pauschale, die trotzdem Arbeitszeit ist — der Mensch hat entschieden.
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.clear(screen.getByLabelText('Einheit'));
    await nutzer.type(screen.getByLabelText('Einheit'), 'Pausch');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    await nutzer.click(screen.getByRole('checkbox'));
    await nutzer.clear(screen.getByLabelText('Einheit'));
    await nutzer.type(screen.getByLabelText('Einheit'), 'Stk');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  /*
    LAUNCH-CHECK 25.09.2026, K6: drei Logiken für eine Nummer. Aus
    AN-2026-0007 wurde B-2026-0007 abgeleitet, während der Zähler der
    Baustellen davon nichts wusste. Jetzt vergibt ihn der Zähler — derselbe
    Weg wie bei jeder anderen Baustelle.
  */
  it('nimmt die Nummer aus dem Zähler der Baustellen', async () => {
    aktiveBaustellen = [{ projectNumber: 'B-2026-0007' }, { projectNumber: 'B-2026-0011' }];
    versendetesAngebot();
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    await annehmenBestaetigt(nutzer);

    await screen.findByText('Baustelle B-2026-0012 angelegt');
    expect(reserveProjectNumber).toHaveBeenCalledWith('perl', { seedFrom: 0, praefix: 'B' });
    const projekt = createProject.mock.calls[0]?.[1] as { projectNumber: string; estimatedHours?: number };
    expect(projekt.projectNumber).toBe('B-2026-0012');
    expect(projekt.estimatedHours).toBe(20);
    expect(updateQuote).toHaveBeenCalledWith('q1', { status: 'Angenommen', projectNumber: 'B-2026-0012' });
  });

  it('fragt vorher — wer abbricht, legt nichts an (Launch-Check, M8)', async () => {
    versendetesAngebot();
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    await nutzer.click(screen.getByRole('button', { name: 'Annehmen → Baustelle' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/AN-2026-0007 wird angenommen/);
    await nutzer.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(reserveProjectNumber).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
    expect(updateQuote).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler beim Anlegen, und das Angebot bleibt offen', async () => {
    createProject.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    versendetesAngebot();
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    await annehmenBestaetigt(nutzer);

    await screen.findByText(/Die Baustelle konnte nicht angelegt werden/);
    /*
      ANGENOMMEN IST ES NICHT — festgehalten ist nur die gezogene Nummer
      (Prüflauf 25.09.2026, P2-19). Bis dahin stand hier „updateQuote nie
      gerufen"; die Nummer am Angebot ist aber genau das, woran ein zweiter
      Versuch die Baustelle wiederfindet, falls sie doch entstanden ist.
    */
    expect(updateQuote).not.toHaveBeenCalledWith('q1', expect.objectContaining({ status: 'Angenommen' }));
    expect(updateQuote).toHaveBeenCalledWith('q1', { projectNumber: 'B-2026-0012' });
  });

  /*
    PRÜFLAUF 25.09.2026, P2-19. Brach es nach dem Anlegen der Baustelle ab,
    stand das Angebot weiter als „Versendet" da, und das nächste Annehmen
    legte eine ZWEITE Baustelle an.
  */
  it('legt beim zweiten Annehmen keine zweite Baustelle an', async () => {
    versendetesAngebot();
    angebote[0].projectNumber = 'B-2026-0012';
    bestehende = [{ projectNumber: 'B-2026-0012' }];
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    await annehmenBestaetigt(nutzer);

    await screen.findByText(/Baustelle B-2026-0012 angelegt/);
    expect(createProject).not.toHaveBeenCalled();
    expect(reserveProjectNumber).not.toHaveBeenCalled();
    expect(updateQuote).toHaveBeenCalledWith('q1', { status: 'Angenommen', projectNumber: 'B-2026-0012' });
  });

  it('ohne Zähler keine geratene Nummer', async () => {
    reserveProjectNumber.mockResolvedValueOnce(null);
    versendetesAngebot();
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    await annehmenBestaetigt(nutzer);

    await screen.findByText(/Baustellennummer konnte nicht vergeben werden/);
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe('Aus dem Angebot wird die Baustelle', () => {
  it('übernimmt die Anmerkungen als Auftragsumfang, mit Verweis aufs Angebot', async () => {
    versendetesAngebot();
    angebote[0].notes = 'Bad komplett erneuern:\n- WC tauschen\n- Dusche bodengleich';
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    await annehmenBestaetigt(nutzer);

    const projekt = createProject.mock.calls[0]?.[1] as { description?: string };
    expect(projekt.description).toBe(
      'Bad komplett erneuern:\n- WC tauschen\n- Dusche bodengleich\n\nAus Angebot AN-2026-0007',
    );
  });

  it('schreibt ohne Anmerkungen nur den Verweis', async () => {
    versendetesAngebot();
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    await annehmenBestaetigt(nutzer);

    const projekt = createProject.mock.calls[0]?.[1] as { description?: string };
    expect(projekt.description).toBe('Aus Angebot AN-2026-0007');
  });
});

describe('Die Liste führt zum Angebot', () => {
  it('verlinkt jedes Angebot auf seine eigene Seite', async () => {
    versendetesAngebot();
    zeichne();
    expect(await screen.findByRole('link', { name: /AN-2026-0007/ })).toHaveAttribute(
      'href',
      '/quotes/q1',
    );
  });

  it('meldet, wenn ein Status nicht gespeichert werden kann', async () => {
    // Vorher: kein Fang, keine Meldung — der Klick tat für den Betrachter nichts.
    versendetesAngebot();
    updateQuote.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    await nutzer.click(screen.getByRole('button', { name: 'Abgelehnt' }));
    expect(
      await screen.findByText(/^Der Status konnte nicht gespeichert werden\. Keine Verbindung zum Server/),
    ).toBeInTheDocument();
  });
});

describe('Einen Entwurf bearbeiten', () => {
  /** Ein Entwurf mit Montage (Arbeitszeit) und Anfahrt in „h" (keine). */
  function entwurf(mitHaken: boolean) {
    angebote.push({
      id: 'q2',
      companyId: 'perl',
      quoteNumber: 'AN-2026-0008',
      customerId: 'k1',
      customerName: 'Gemeinde Neudorf',
      address: 'Rathausplatz 1',
      quoteDate: '2026-09-01',
      validUntil: '2026-10-01',
      status: 'Entwurf',
      positions: [
        { label: 'Montage', qty: 16, unit: 'h', unitPrice: 70, netto: 1120, ...(mitHaken ? { istArbeitszeit: true } : {}) },
        { label: 'Anfahrt', qty: 1, unit: 'h', unitPrice: 45, netto: 45, ...(mitHaken ? { istArbeitszeit: false } : {}) },
      ],
      subtotalNetto: 1165,
      totalNetto: 1165,
      totalVat: 233,
      totalBrutto: 1398,
      vatRate: 20,
      kalkulierteStunden: 16,
      notes: 'Steigleitung',
    });
  }

  it('holt den Entwurf ins Formular und speichert Änderungen am selben Angebot', async () => {
    entwurf(true);
    zeichne();
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));

    expect(screen.getByText('Angebot AN-2026-0008 bearbeiten')).toBeInTheDocument();
    expect(screen.getByLabelText('Anmerkungen')).toHaveValue('Steigleitung');
    // Der gespeicherte Haken kommt mit — die Anfahrt bleibt KEINE Arbeitszeit.
    expect(screen.getByText('16 h')).toBeInTheDocument();

    const menge = screen.getByLabelText('Menge', { selector: '#anqqty0' });
    await userEvent.clear(menge);
    await userEvent.type(menge, '20');
    await userEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await vi.waitFor(() => expect(updateQuote).toHaveBeenCalled());
    expect(createQuote).not.toHaveBeenCalled();
    const [id, daten] = updateQuote.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('q2');
    expect(daten).toMatchObject({ kalkulierteStunden: 20, vatRate: 20 });
    expect((daten.positions as { istArbeitszeit?: boolean }[]).map((p) => p.istArbeitszeit))
      .toEqual([true, false]);
  });

  it('sagt es, wenn der Haken bei einem alten Angebot aus der Einheit abgeleitet wurde', async () => {
    entwurf(false);
    zeichne();
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByText(/aus der Einheit abgeleitet — bitte prüfen/)).toBeInTheDocument();
    // Abgeleitet zählt auch die Anfahrt — genau deshalb der Hinweis.
    expect(screen.getByText('17 h')).toBeInTheDocument();
  });

  it('bietet Bearbeiten nur beim Entwurf an', async () => {
    versendetesAngebot();
    zeichne();
    await screen.findByText(/AN-2026-0007/);
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('speichert jedes neue Angebot mit dem Haken an der Position', async () => {
    zeichne();
    await formOeffnen();
    await userEvent.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await userEvent.type(screen.getByLabelText('Bezeichnung'), 'Montage');
    await userEvent.type(screen.getByLabelText('Menge'), '8');
    await userEvent.type(screen.getByLabelText('Einheit'), 'h');
    await userEvent.type(screen.getByLabelText('Einzelpreis netto'), '70');
    await userEvent.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    await vi.waitFor(() => expect(createQuote).toHaveBeenCalled());
    const daten = createQuote.mock.calls[0][1] as { positions: { istArbeitszeit?: boolean }[] };
    expect(daten.positions[0].istArbeitszeit).toBe(true);
  });
});

/*
  TESTBERICHT 30.09.2026, M17 — ein versendetes Angebot überarbeiten: als
  neue Fassung mit eigener Nummer, die auf das alte verweist. Das alte bleibt.
*/
describe('Neue Fassung eines versendeten Angebots (M17)', () => {
  function mitPositionen() {
    versendetesAngebot();
    angebote[0].positions = [{ label: 'Facharbeiterstunden', qty: 20, unit: 'h', unitPrice: 65, netto: 1300 }];
    angebote[0].discount = { mode: 'percent', value: 5 };
    angebote[0].notes = 'Nur in den Ferien.';
  }

  it('holt Kunde, Positionen, Rabatt und Anmerkungen in einen neuen Entwurf mit Verweis', async () => {
    const nutzer = userEvent.setup();
    mitPositionen();
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: 'Neue Fassung' }));
    expect(await screen.findByText('Neue Fassung von AN-2026-0007')).toBeInTheDocument();
    expect(screen.getByLabelText('Bezeichnung')).toHaveValue('Facharbeiterstunden');
    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));

    await waitFor(() => expect(createQuote).toHaveBeenCalled());
    const neu = createQuote.mock.calls[0][1] as Quote;
    expect(neu).toMatchObject({
      vorgaengerId: 'q1',
      status: 'Entwurf',
      customerId: 'k1',
      notes: 'Nur in den Ferien.',
      discount: { mode: 'percent', value: 5 },
    });
    expect(neu.quoteNumber).toBe('AN-2026-0001');
    // Das versendete bleibt, wie es ist.
    expect(updateQuote).not.toHaveBeenCalled();
  });

  it('Gegenprobe: ein neues Angebot trägt keinen Verweis und keinen Rabatt', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Bezeichnung'), 'Pauschale');
    await nutzer.type(screen.getByLabelText('Menge'), '1');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), '100');
    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    await waitFor(() => expect(createQuote).toHaveBeenCalled());
    const neu = createQuote.mock.calls[0][1] as Quote;
    expect(neu.vorgaengerId).toBeUndefined();
    expect(neu.discount).toBeNull();
  });

  it('bietet die neue Fassung nicht für einen Entwurf an — der wird bearbeitet', async () => {
    mitPositionen();
    angebote[0].status = 'Entwurf';
    zeichne();
    expect(await screen.findByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neue Fassung' })).toBeNull();
  });
});

/*
  TESTBERICHT 30.09.2026, M16 — die Abrechnungsart wird beim Annehmen
  gewählt: Pauschal (wie bisher, Vorgabe), Regie oder Einheitspreis.
*/
describe('Abrechnungsart beim Annehmen (M16)', () => {
  it('legt die Baustelle mit der gewählten Abrechnung an', async () => {
    const nutzer = userEvent.setup();
    versendetesAngebot();
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: 'Annehmen → Baustelle' }));
    const dialog = await screen.findByRole('dialog');
    await nutzer.selectOptions(within(dialog).getByLabelText('Abrechnung der Baustelle'), 'Einheitspreis');
    expect(within(dialog).getByText(/Mengen kommen aus dem Aufmaß/)).toBeInTheDocument();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Annehmen' }));
    await waitFor(() => expect(createProject).toHaveBeenCalled());
    expect(createProject.mock.calls[0][1]).toMatchObject({ billingMode: 'Einheitspreis' });
  });

  it('Gegenprobe: ohne Wahl bleibt es Pauschal, wie bisher', async () => {
    const nutzer = userEvent.setup();
    versendetesAngebot();
    zeichne();
    await screen.findByRole('button', { name: 'Annehmen → Baustelle' });
    await annehmenBestaetigt(nutzer);
    await waitFor(() => expect(createProject).toHaveBeenCalled());
    expect(createProject.mock.calls[0][1]).toMatchObject({ billingMode: 'Pauschal' });
  });
});

/**
 * Titel, Text, Positionsrabatt und Katalogartikel (Testbericht 30.09.2026,
 * M18). Die Rechnung dahinter prüft `tests/unit/angebotPositionen.test.ts`;
 * hier, was die Maske tut und was sie speichert.
 */
describe('Titel, Text, Rabatt und Katalog (M18)', () => {
  async function erstePosition(nutzer: ReturnType<typeof userEvent.setup>, label: string, menge: string, preis: string) {
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Bezeichnung'), label);
    await nutzer.type(screen.getByLabelText('Menge'), menge);
    await nutzer.type(screen.getByLabelText('Einheit'), 'Stk');
    await nutzer.type(screen.getByLabelText('Einzelpreis netto'), preis);
  }

  it('ein Positionsrabatt mindert das Netto der Zeile und wird mitgespeichert', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await erstePosition(nutzer, 'Waschtisch', '2', '100');
    await nutzer.type(screen.getByLabelText('Rabatt %'), '10');
    // In der Zeile und in der Summe darunter.
    expect(screen.getAllByText(/180,00/).length).toBeGreaterThanOrEqual(2);

    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    await waitFor(() => expect(createQuote).toHaveBeenCalled());
    const q = createQuote.mock.calls[0][1] as Quote;
    expect(q.positions).toEqual([expect.objectContaining({ label: 'Waschtisch', unitPrice: 100, rabattProzent: 10, netto: 180 })]);
    expect(q.totalNetto).toBe(180);
  });

  it('Gegenprobe: ein Rabatt von 100 % wird nicht gespeichert', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await erstePosition(nutzer, 'Waschtisch', '1', '100');
    await nutzer.type(screen.getByLabelText('Rabatt %'), '100');
    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    expect(await screen.findByText(/zwischen 0 und 100 %/)).toBeInTheDocument();
    expect(createQuote).not.toHaveBeenCalled();
  });

  it('Titel und Text: ohne Preis, in der gewählten Reihenfolge, der Titel nennt seine Summe', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await erstePosition(nutzer, 'WC', '1', '300');
    await nutzer.click(screen.getByRole('button', { name: 'Titel hinzufügen' }));
    await nutzer.type(screen.getByLabelText('Titel'), 'Bad');
    // Der Titel gehört vor seine Position.
    await nutzer.click(screen.getByRole('button', { name: 'Titel nach oben' }));
    await nutzer.click(screen.getByRole('button', { name: 'Text hinzufügen' }));
    await nutzer.type(screen.getByLabelText('Text'), 'Fliesen bauseits');
    expect(screen.getByText('Summe € 300,00')).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    await waitFor(() => expect(createQuote).toHaveBeenCalled());
    const q = createQuote.mock.calls[0][1] as Quote;
    expect(q.positions.map((p) => [p.art ?? 'position', p.label, p.netto])).toEqual([
      ['titel', 'Bad', 0], ['position', 'WC', 300], ['text', 'Fliesen bauseits', 0],
    ]);
    expect(q.totalNetto).toBe(300);
  });

  it('Gegenprobe: nur Titel und Text bieten nichts an — anlegen geht nicht', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.click(screen.getByRole('button', { name: 'Titel hinzufügen' }));
    await nutzer.type(screen.getByLabelText('Titel'), 'Bad');
    // Die leere Position weg: es bleibt nur der Titel.
    await nutzer.click(screen.getByRole('button', { name: 'Position entfernen' }));
    expect(screen.queryByLabelText('Bezeichnung')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Angebot anlegen' })).toBeDisabled();
  });

  it('übernimmt einen Artikel aus dem Katalog — mit Preis und Einheit, ohne ausgelaufene', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await formOeffnen();
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.click(screen.getByRole('button', { name: 'Aus dem Katalog …' }));
    await nutzer.type(screen.getByLabelText('Artikel aus dem Katalog'), 'therme');
    await nutzer.click(await screen.findByRole('button', { name: 'Gastherme 24 kW übernehmen' }));
    expect(screen.queryByRole('button', { name: 'Gastherme alt übernehmen' })).not.toBeInTheDocument();
    expect(sucheKatalog).toHaveBeenCalledWith('perl', 'therme');

    // Die leere erste Zeile ist dem Artikel gewichen.
    expect(screen.getAllByLabelText('Bezeichnung')).toHaveLength(1);
    expect(screen.getByLabelText('Bezeichnung')).toHaveValue('Gastherme 24 kW');
    expect(screen.getByText(/· aus dem Katalog/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Angebot anlegen' }));
    await waitFor(() => expect(createQuote).toHaveBeenCalled());
    const q = createQuote.mock.calls[0][1] as Quote;
    expect(q.positions).toEqual([expect.objectContaining({ label: 'Gastherme 24 kW', qty: 1, unit: 'Stk', unitPrice: 2500, materialId: 'm1' })]);
  });

  it('ein Entwurf mit Titel und Rabatt kommt so ins Formular, wie er gespeichert ist', async () => {
    angebote.push({
      id: 'q9', companyId: 'perl', quoteNumber: 'AN-2026-0009', customerId: 'k1', customerName: 'Gemeinde Neudorf',
      address: 'Rathausplatz 1', quoteDate: '2026-09-01', validUntil: '2026-10-01', status: 'Entwurf',
      positions: [
        { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
        { label: 'Waschtisch', qty: 2, unit: 'Stk', unitPrice: 100, netto: 180, rabattProzent: 10, istArbeitszeit: false },
      ],
      subtotalNetto: 180, totalNetto: 180, totalVat: 36, totalBrutto: 216, vatRate: 0.2, kalkulierteStunden: 0,
    } as Quote & { id: string });
    zeichne();
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByLabelText('Titel')).toHaveValue('Bad');
    expect(screen.getByLabelText('Rabatt %')).toHaveValue('10');
    await userEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    await waitFor(() => expect(updateQuote).toHaveBeenCalled());
    const d = updateQuote.mock.calls[0][1] as Quote;
    expect(d.positions.map((p) => [p.art ?? 'position', p.rabattProzent ?? null, p.netto])).toEqual([['titel', null, 0], ['position', 10, 180]]);
  });
});
