import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Project } from '@/types';

/**
 * Die Kundenverwaltung ersetzt ein freies Textfeld an der Baustelle. Genau
 * daraus kamen die Fehler, die dieser Test festhält:
 *
 *  - Zwei Schreibweisen desselben Namens ergaben zwei Kunden, beide
 *    unvollständig. Das Anlegen muss den Doppelgänger erkennen.
 *  - Die Übernahme der Altbestände darf nicht blind schreiben: sie zeigt
 *    vorher, was entsteht.
 */

const kunden: (Customer & { id: string })[] = [
  {
    id: 'k1',
    companyId: 'perl',
    name: 'Hausverwaltung Nord',
    address: 'Ringstraße 3, 2700 Wiener Neustadt',
    contactName: 'Frau Wagner',
    contactPhone: '0664 1234567',
  },
];

const projekteOhneKunde: (Project & { id: string })[] = [
  {
    id: 'p1',
    companyId: 'perl',
    projectNumber: 'B-001',
    customerName: 'Familie Huber',
    address: 'Hauptstraße 12',
    status: 'Aktiv',
  },
  {
    id: 'p2',
    companyId: 'perl',
    projectNumber: 'B-002',
    // Dieselbe Familie, andere Schreibweise — der Fall, für den die Vorschau da ist.
    customerName: 'familie huber ',
    address: 'Hauptstraße 12',
    status: 'Abgeschlossen',
  },
  {
    id: 'p3',
    companyId: 'perl',
    projectNumber: 'B-003',
    customerName: 'Bäckerei Stein',
    address: 'Bahngasse 8',
    status: 'Aktiv',
  },
];

const createCustomer = vi.fn(async () => 'neu1');
const assignProjectToCustomer = vi.fn(async () => undefined);

/**
 * Die Akte des aufgeklappten Kunden. `zugeordnet` bleibt leer, `namensgleich`
 * enthält die Baustelle, die den Namen des Kunden trägt, aber auf keinen
 * Kundendatensatz zeigt — der Fall, an dem die Ansicht vorher „noch keine
 * Baustelle zugeordnet" meldete, obwohl eine dalag.
 */
const namensgleich: (Project & { id: string })[] = [
  {
    id: 'p9',
    companyId: 'perl',
    projectNumber: 'B-042',
    customerName: 'Hausverwaltung Nord',
    address: 'Ringstraße 3',
    status: 'Aktiv',
  },
];
const listUnlinkedProjectsByName = vi.fn(async () => namensgleich);
const listProjectsForCustomer = vi.fn(async () => [] as (Project & { id: string })[]);

/*
  Die Kundenliste hat eine Obergrenze — und sie muss sagen, wenn sie erreicht
  ist. Der 501. Kunde existierte für die App sonst schlicht nicht: nicht in
  der Liste, nicht in der Suche, nirgends. Und nichts sagte es.
*/
const searchCustomers = vi.fn<
  [string, string, number | undefined], Promise<typeof kunden>
>(async () => kunden);

/*
  SEIT DEM 14.09.2026 GEHT DER SUCHBEGRIFF MIT IN DIE ABFRAGE.

  Vorher lud die Ansicht die ersten `max` Kunden und filterte im Browser. Der
  Test hiess deshalb `listCustomers`; jetzt heisst er `searchCustomers`, und
  das zweite Argument ist der Begriff — unter Postgres sucht die Datenbank
  darüber, unter Firestore filtert die Datenschicht wie bisher im Browser.
*/
vi.mock('@/lib/db/customers', () => ({
  searchCustomers: (c: string, begriff: string, max?: number) =>
    searchCustomers(c, begriff, max),
  createCustomer: (...a: unknown[]) => createCustomer(...(a as [])),
  updateCustomer: vi.fn(async () => 0),
  deleteCustomer: vi.fn(async () => undefined),
  listProjectsForCustomer: () => listProjectsForCustomer(),
  listUnlinkedProjectsByName: () => listUnlinkedProjectsByName(),
  assignProjectToCustomer: (...a: unknown[]) => assignProjectToCustomer(...(a as [])),
}));
vi.mock('@/lib/db/projects', () => ({
  listRecentProjects: vi.fn(async () => projekteOhneKunde),
}));
vi.mock('@/lib/db/quotes', () => ({ listQuotesForCustomer: vi.fn(async () => []) }));

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

const { default: CustomersView } = await import('@/features/customers/CustomersView');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CustomersView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  searchCustomers.mockClear().mockImplementation(async () => kunden);
  createCustomer.mockClear();
  assignProjectToCustomer.mockClear();
  listUnlinkedProjectsByName.mockClear();
  listProjectsForCustomer.mockClear();
});

describe('Kundenverwaltung', () => {
  it('verhindert einen zweiten Kunden mit demselben Namen', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Hausverwaltung Nord');

    // Andere Schreibweise, derselbe Kunde.
    await nutzer.type(screen.getByLabelText('Name oder Firma'), '  hausverwaltung NORD ');
    await nutzer.click(screen.getByRole('button', { name: 'Kunde anlegen' }));

    expect(await screen.findByText(/gibt es bereits/)).toBeInTheDocument();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it('fasst in der Vorschau gleiche Namen zu EINEM Kunden zusammen', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Hausverwaltung Nord');

    await nutzer.click(screen.getByRole('button', { name: 'Vorschau erstellen' }));

    /**
     * Drei Baustellen, aber nur zwei Kunden: „Familie Huber" und
     * „familie huber " unterscheiden sich nur in Schreibweise und Leerraum.
     * Würde die Vorschau sie trennen, entstünden genau die Doppelgänger, die
     * diese Ansicht abschaffen soll.
     */
    const text = await screen.findByText(/Kunden entstehen/);
    expect(text).toHaveTextContent('2');
    expect(text).toHaveTextContent('3 Baustellen');
  });

  it('schreibt erst nach ausdrücklicher Bestätigung', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Hausverwaltung Nord');

    await nutzer.click(screen.getByRole('button', { name: 'Vorschau erstellen' }));
    await screen.findByText(/Kunden entstehen/);
    // Nach der Vorschau allein darf nichts geschrieben sein.
    expect(createCustomer).not.toHaveBeenCalled();
    expect(assignProjectToCustomer).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Übernahme durchführen' }));

    // Zwei Kunden angelegt, alle drei Baustellen zugeordnet.
    expect(createCustomer).toHaveBeenCalledTimes(2);
    expect(assignProjectToCustomer).toHaveBeenCalledTimes(3);
  });

  /**
   * Der gemeldete Fehler: ein von Hand angelegter Kunde zeigte „noch keine
   * Baustelle zugeordnet", während im Bestand eine mit genau seinem Namen lag.
   * Sie hing nur als Text zusammen, nicht als Datensatz — und nichts in der
   * Ansicht sagte das.
   */
  it('führt zur Akte des Kunden', async () => {
    /*
      DIE HISTORIE WAR EIN AUFKLAPPEN IN DER NEBENZEILE. Baustellen und
      Angebote steckten dort im Absatz einer Listenzeile; E-Mail, UID und
      Notiz standen überhaupt nirgends. Beides liegt jetzt in der Akte —
      geprüft wird sie in `KundenakteView.test.tsx`, hier nur der Weg dorthin.
    */
    zeichne();
    const zeile = (await screen.findByText('Hausverwaltung Nord')).closest('li')!;
    expect(within(zeile).getByRole('link', { name: 'Akte' })).toHaveAttribute(
      'href',
      '/customers/k1',
    );
  });

  it('nennt die Rechnungsadresse beim Namen', () => {
    zeichne();
    /**
     * Die Abgrenzung ist der Kern des Datenmodells: hier steht die
     * Rechnungsadresse, an der Baustelle die Baustellenadresse. Ein
     * schlichtes „Adresse" an beiden Stellen hätte genau die Verwechslung
     * erzeugt, die das Modell vermeiden soll.
     */
    expect(screen.getByLabelText('Rechnungsadresse')).toBeInTheDocument();
  });

  it('zeigt Adresse und Telefon als Handgriff, nicht als Text', async () => {
    zeichne();
    const zeile = (await screen.findByText('Hausverwaltung Nord')).closest('li')!;
    expect(within(zeile).getByRole('link', { name: /Ringstraße 3/ })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps'),
    );
    expect(within(zeile).getByRole('link', { name: /0664 1234567/ })).toHaveAttribute(
      'href',
      'tel:06641234567',
    );
  });
});

/**
 * Die Grenze der Liste — sichtbar statt stillschweigend.
 *
 * Bis zum 08.09.2026 lud die Ansicht „die ersten fünfhundert, alphabetisch"
 * und sagte nichts dazu. Ein Betrieb mit mehr Kunden verlor die hinteren
 * Buchstaben, und zwar überall: in der Liste, in der Suche, im
 * Rechnungsformular. Das ist kein Geschwindigkeitsproblem, es ist ein
 * Wahrheitsproblem.
 */
describe('Wenn die Kundenliste an ihre Grenze stösst', () => {
  /** So viele Kunden, wie auf eine Seite gehen — die Grenze greift also. */
  const volleSeite = () =>
    Array.from({ length: 200 }, (_, i) => ({
      id: `k${i}`,
      companyId: 'perl',
      name: `Kunde ${String(i).padStart(3, '0')}`,
    })) as typeof kunden;

  it('holt nur eine Seite, nicht den ganzen Bestand', async () => {
    zeichne();
    await screen.findByText('Hausverwaltung Nord');
    // Die Zahl selbst zählt: ohne sie holte die Abfrage ihre eigene
    // Voreinstellung, und die war fünfhundert.
    expect(searchCustomers.mock.calls[0][2]).toBe(200);
  });

  it('schweigt, solange die Liste unter der Grenze bleibt', async () => {
    zeichne();
    await screen.findByText('Hausverwaltung Nord');
    expect(screen.queryByRole('button', { name: /Weitere Kunden laden/ })).not.toBeInTheDocument();
  });

  it('sagt es, sobald die Grenze erreicht ist — samt Hinweis auf die Suche', async () => {
    searchCustomers.mockResolvedValue(volleSeite());
    zeichne();
    expect(await screen.findByRole('button', { name: 'Weitere Kunden laden' })).toBeInTheDocument();
    expect(screen.getByText(/Suche geht nur über diese/)).toBeInTheDocument();
  });

  it('lädt auf Wunsch weiter', async () => {
    searchCustomers.mockResolvedValue(volleSeite());
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: 'Weitere Kunden laden' }));
    await waitFor(() =>
      expect(searchCustomers.mock.calls[searchCustomers.mock.calls.length - 1][2]).toBe(400));
  });

  /*
    DER GEFÄHRLICHSTE MOMENT: die Suche findet nichts. Genau dann ist die
    Frage „gibt es den Kunden nicht, oder ist er nur nicht geladen?" die
    entscheidende — der Hinweis muss also auch neben der Leermeldung stehen.
  */
  it('steht auch dann da, wenn die Suche nichts findet', async () => {
    /*
      Der Suchbegriff geht jetzt MIT in die Abfrage — die Attrappe antwortet
      deshalb wie die Datenschicht: ohne Begriff die volle Seite, mit einem
      Begriff, den niemand trägt, nichts.
    */
    searchCustomers.mockImplementation(async (_c, begriff) =>
      begriff.trim() ? [] : volleSeite());
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByRole('button', { name: 'Weitere Kunden laden' });

    await nutzer.type(screen.getByLabelText('Kunden durchsuchen'), 'Zzzz');
    expect(await screen.findByText(/Kein Kunde passt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weitere Kunden laden' })).toBeInTheDocument();
  });

  it('reicht den Suchbegriff an die Datenschicht weiter, statt im Browser zu filtern', async () => {
    /*
      DIE NARBE, DIE HIER FÄLLT. Vorher lud die Ansicht die ersten `max`
      Kunden und filterte danach selbst — der 501. war unauffindbar, ohne
      dass irgendwo stand, warum. Jetzt entscheidet die Datenschicht, und
      unter Postgres sucht die Datenbank über den ganzen Bestand.

      Gefragt wird deshalb nach dem ARGUMENT und nicht nach dem Ergebnis: dass
      gefiltert wird, sähe man auch, wenn es weiter im Browser geschähe.
    */
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findByText('Hausverwaltung Nord');

    await nutzer.type(screen.getByLabelText('Kunden durchsuchen'), 'Huber');
    await waitFor(() =>
      expect(searchCustomers.mock.calls.some(([, b]) => b === 'Huber')).toBe(true));
  });
});
