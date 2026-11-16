import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import { zwischenspeicherLeeren } from '@/lib/zwischenspeicher';
import { zwischenspeicherFuer } from '@/lib/liveSpeicher';
import { listenAdresseMerken, listenAdressenVergessen, mitListenAdresse } from '@/lib/listenAdresse';
import type { AppUser, Customer } from '@/types';

/**
 * L8 (Plan 15.11.2026): Kunden, Angebote, Wartungen, Benutzer und ihre Akten
 * begannen bei jedem Besuch leer, und die Suche ging beim Zurück verloren.
 * Jetzt — das Muster der Baustellen — steht die Suche in der Adresse, der
 * zuletzt geladene Stand sofort da, und der Rückweg aus der Akte nimmt Suche
 * und Filter mit.
 *
 * GEGENPROBE (Erwartung): vor L8 sind „zweiter Besuch ohne Platzhalter“,
 * „Suche in der Adresse“ und „Rückweg mit Suche“ rot; „erster Besuch mit
 * Platzhalter“ und „ein anderer Benutzer sieht nichts“ sind in beiden
 * Fassungen grün.
 */

const kunden: (Customer & { id: string })[] = [
  { id: 'k1', companyId: 'perl', name: 'Hausverwaltung Nord', address: 'Ringstraße 3, 2700 Wiener Neustadt' },
  { id: 'k2', companyId: 'perl', name: 'Familie Huber', address: 'Hauptstraße 12' },
];
/** Eine Antwort, die auf sich warten lässt — wie langsames Netz. */
let warten: Promise<void> = Promise.resolve();
const searchCustomers = vi.fn(async (_c: string, begriff: string) => {
  await warten;
  return kunden.filter((k) => !begriff || k.name.includes(begriff));
});
const listCustomersByIds = vi.fn(async (_c: string, ids: string[]) => {
  await warten;
  return kunden.filter((k) => ids.includes(k.id));
});
vi.mock('@/lib/db/customers', () => ({
  searchCustomers: (c: string, b: string) => searchCustomers(c, b),
  listCustomersByIds: (c: string, ids: string[]) => listCustomersByIds(c, ids),
  kundenZuPruefenAnzahl: vi.fn(async () => ({ adressePruefen: 0, ohneKundenart: 0 })),
  kundenAdressePruefen: vi.fn(async () => []),
  kundenOhneKundenart: vi.fn(async () => []),
  naechsteKundennummer: vi.fn(async () => '1'),
  createCustomer: vi.fn(), updateCustomer: vi.fn(), deleteCustomer: vi.fn(), assignProjectToCustomer: vi.fn(),
  listProjectsForCustomer: vi.fn(async () => []),
  listUnlinkedProjectsByName: vi.fn(async () => []),
  zaehleProjekteDesKunden: vi.fn(async () => 0),
}));
vi.mock('@/lib/db/projects', () => ({ listRecentProjects: vi.fn(async () => []) }));

const personen: AppUser[] = [
  { id: 'u7', uid: 'u7', companyId: 'perl', name: 'Stefan Gruber', email: 's@perl.at', role: 'Mitarbeiter', active: true } as AppUser,
];
const getUserByUid = vi.fn(async (_c: string, uid: string) => {
  await warten;
  return personen.find((p) => p.uid === uid) ?? null;
});
vi.mock('@/lib/db/users', async (orig) => ({
  ...(await orig<object>()),
  getUserByUid: (c: string, uid: string) => getUserByUid(c, uid),
  listUsers: vi.fn(async () => personen),
}));

const authWert = {
  user: { uid: 'chef', email: 'c@perl.at', name: 'Chefin', role: 'Geschäftsführung' as const, companyId: 'perl', docId: 'chef' },
  company: { id: 'perl', name: 'Perl', modules: {} },
  loading: false, error: null, einblick: null,
  signIn: vi.fn(), signOut: vi.fn(), resetPassword: vi.fn(), reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: CustomersView } = await import('@/features/customers/CustomersView');

function Adresse() {
  const ort = useLocation();
  return <output data-testid="adresse">{ort.pathname + ort.search}</output>;
}

function zeichne(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <ToastProvider>
        <Routes>
          <Route path="/customers" element={<CustomersView />} />
        </Routes>
        <Adresse />
      </ToastProvider>
    </MemoryRouter>,
  );
}

let freigeben: () => void = () => undefined;
function langsam() {
  warten = new Promise((f) => { freigeben = f; });
}

beforeEach(() => {
  zwischenspeicherLeeren();
  zwischenspeicherFuer('chef', 'perl');
  listenAdressenVergessen();
  warten = Promise.resolve();
  searchCustomers.mockClear();
  getUserByUid.mockClear();
});

describe('Kundenliste: Suche in der Adresse, gemerkter Stand', () => {
  it('die Suche steht in der Adresse — und kommt mit ihr zurück', async () => {
    const erst = zeichne('/customers');
    await screen.findByText('Hausverwaltung Nord');
    await userEvent.type(screen.getByLabelText('Kunden durchsuchen'), 'Huber');
    expect(screen.getByTestId('adresse').textContent).toBe('/customers?suche=Huber');
    erst.unmount();

    zeichne('/customers?suche=Huber');
    expect(screen.getByLabelText('Kunden durchsuchen')).toHaveValue('Huber');
    await waitFor(() => expect(searchCustomers).toHaveBeenLastCalledWith('perl', 'Huber'));
  });

  it('bleibt gleich: der erste Besuch zeigt Platzhalter, bis die Liste da ist', async () => {
    langsam();
    zeichne('/customers');
    expect(screen.queryByText('Hausverwaltung Nord')).toBeNull();
    freigeben();
    expect(await screen.findByText('Hausverwaltung Nord')).toBeInTheDocument();
  });

  it('der zweite Besuch zeigt sofort den letzten Stand und holt im Hintergrund', async () => {
    const erst = zeichne('/customers?suche=Huber');
    await screen.findByText('Familie Huber');
    erst.unmount();

    langsam();
    zeichne('/customers?suche=Huber');
    // Sofort da, obwohl die neue Antwort noch aussteht.
    expect(screen.getByText('Familie Huber')).toBeInTheDocument();
    expect(searchCustomers).toHaveBeenCalledTimes(2);
    freigeben();
  });

  it('ein anderer Benutzer auf demselben Gerät sieht den Stand nicht', async () => {
    const erst = zeichne('/customers');
    await screen.findByText('Hausverwaltung Nord');
    erst.unmount();
    zwischenspeicherFuer('jemand-anderer', 'perl');
    langsam();
    zeichne('/customers');
    expect(screen.queryByText('Hausverwaltung Nord')).toBeNull();
    freigeben();
  });
});

describe('Der Rückweg aus der Akte', () => {
  it('nimmt Suche und Filter der Liste mit', () => {
    listenAdresseMerken('/customers', '?suche=Huber&auswahl=pruefen');
    expect(mitListenAdresse('/customers')).toBe('/customers?suche=Huber&auswahl=pruefen');
  });

  it('ohne gemerkte Abfrage, oder nach einer leeren, die nackte Liste — wie bisher', () => {
    expect(mitListenAdresse('/quotes')).toBe('/quotes');
    listenAdresseMerken('/quotes', '?ansicht=alle');
    listenAdresseMerken('/quotes', '');
    expect(mitListenAdresse('/quotes')).toBe('/quotes');
  });

  it('ein Ziel mit eigener Abfrage bleibt, wie es ist', () => {
    listenAdresseMerken('/admin-projects', '?stand=alle');
    expect(mitListenAdresse('/admin-projects?baustelle=B-1')).toBe('/admin-projects?baustelle=B-1');
  });

  it('der Link im Seitenkopf der Akte führt dorthin', async () => {
    const { default: PageHeader } = await import('@/components/PageHeader');
    listenAdresseMerken('/user-mgmt', '?suche=Gru');
    render(
      <MemoryRouter>
        <PageHeader title="Stefan Gruber" zurueck={{ to: '/user-mgmt', text: 'Zur Benutzerliste' }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Zur Benutzerliste/ })).toHaveAttribute('href', '/user-mgmt?suche=Gru');
  });
});

/*
  L12: in der Kundenliste legt das Berühren einer Zeile den Kopf der Akte
  bereit — aus der Zeile, ohne Anfrage.
*/
describe('Kundenliste: Akte beim Berühren vorbereiten (L12)', () => {
  it('legt den Kunden in den gemerkten Stand seiner Akte', async () => {
    const { abfrageSpeicher, schluessel } = await import('@/lib/zwischenspeicher');
    zeichne('/customers');
    const link = await screen.findByRole('link', { name: /Familie Huber/ });
    const vorher = listCustomersByIds.mock.calls.length;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.pointerDown(link);
    expect(abfrageSpeicher.getQueryData(schluessel('kundenakte', { uid: 'chef', companyId: 'perl' }, 'k2'))).toEqual({ kunde: kunden[1] });
    expect(listCustomersByIds.mock.calls.length).toBe(vorher);
  });
});
