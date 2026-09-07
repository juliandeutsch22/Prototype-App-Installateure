import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

vi.mock('@/lib/db/customers', () => ({
  listCustomers: vi.fn(async () => kunden),
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
