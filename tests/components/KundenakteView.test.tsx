import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Project, Quote, Wartung } from '@/types';

/**
 * Die Kundenakte.
 *
 * AUS DEM BETRIEB GEMELDET: „Man kann Kunden zwar eine Mail, Notiz, UID und
 * weiteres hinzufügen, diese Daten scheinen jedoch nirgendwo auf."
 *
 * Das Formular nahm sieben Felder entgegen, die Liste zeigte drei. E-Mail,
 * UID-Nummer und Notiz wurden erfasst und danach nie wieder gezeigt — der
 * Betrieb pflegte Daten in ein Loch. Am teuersten war die UID: sie gehört auf
 * jede Rechnung an ein Unternehmen.
 *
 * Drei Zusicherungen dieser Datei stammen aus `CustomersView.test.tsx` und
 * sind mit der Historie hierher gewandert: namensgleiche Baustellen finden,
 * sie auf einen Klick zuordnen, und einen Ladefehler nicht wie „nichts da"
 * aussehen lassen.
 */

const KUNDE: Customer & { id: string } = {
  id: 'k1',
  companyId: 'perl',
  name: 'Hausverwaltung Nord',
  address: 'Ringstraße 3, 2700 Wiener Neustadt',
  contactName: 'Frau Wagner',
  contactPhone: '0664 1234567',
  email: 'office@hv-nord.at',
  vatId: 'ATU12345678',
  notes: 'Schlüssel im Büro.\nZufahrt nur vormittags.',
  active: true,
};

let kunden: (Customer & { id: string })[] = [KUNDE];
let zugeordnet: (Project & { id: string })[] = [];
let namensgleich: (Project & { id: string })[] = [];
let angebote: (Quote & { id: string })[] = [];
let wartungen: (Wartung & { id: string })[] = [];

const listCustomersByIds = vi.fn(async () => kunden);
const listProjectsForCustomer = vi.fn(async () => zugeordnet);
const listUnlinkedProjectsByName = vi.fn(async () => namensgleich);
const assignProjectToCustomer = vi.fn(async () => undefined);
const listQuotesForCustomer = vi.fn(async () => angebote);
const listWartungenForCustomer = vi.fn(async () => wartungen);

vi.mock('@/lib/db/customers', () => ({
  listCustomersByIds: () => listCustomersByIds(),
  listProjectsForCustomer: () => listProjectsForCustomer(),
  listUnlinkedProjectsByName: () => listUnlinkedProjectsByName(),
  assignProjectToCustomer: (...a: unknown[]) => assignProjectToCustomer(...(a as [])),
}));
vi.mock('@/lib/db/quotes', () => ({ listQuotesForCustomer: () => listQuotesForCustomer() }));
vi.mock('@/lib/db/wartungen', () => ({
  listWartungenForCustomer: () => listWartungenForCustomer(),
}));

let modulAn = true;
vi.mock('@/lib/useModule', () => ({ useModul: () => modulAn }));

vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => '2026-06-01' };
});

let rolle: 'Geschäftsführung' | 'Verwaltung' = 'Geschäftsführung';
const NUTZER = () => ({
  uid: 'chef',
  email: 'chefin@perl.at',
  name: 'Julian Deutsch',
  role: rolle,
  companyId: 'perl',
  docId: 'chef',
});
let nutzer = NUTZER();
vi.mock('@/app/AuthContext', () => ({ useAuth: () => ({ user: nutzer }) }));

const { default: KundenakteView } = await import('@/features/customers/KundenakteView');

function zeige(id = 'k1') {
  return render(
    <MemoryRouter initialEntries={[`/customers/${id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/customers/:id" element={<KundenakteView />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Der Wert zu einer Beschriftung in den Stammdaten. */
function angabe(wort: string) {
  const dt = screen.getByText(wort);
  return dt.nextElementSibling as HTMLElement;
}

beforeEach(() => {
  kunden = [KUNDE];
  zugeordnet = [];
  namensgleich = [];
  angebote = [];
  wartungen = [];
  modulAn = true;
  rolle = 'Geschäftsführung';
  nutzer = NUTZER();
  listCustomersByIds.mockClear();
  assignProjectToCustomer.mockClear();
  listUnlinkedProjectsByName.mockClear();
  listWartungenForCustomer.mockClear();
});

describe('Die Stammdaten — der Grund für diese Seite', () => {
  it('zeigt E-Mail, UID und Notiz, die vorher nirgends standen', async () => {
    zeige();
    await screen.findByText('Stammdaten');

    expect(within(angabe('E-Mail')).getByRole('link', { name: /office@hv-nord\.at/ }))
      .toHaveAttribute('href', 'mailto:office@hv-nord.at');
    expect(angabe('UID-Nummer').textContent).toBe('ATU12345678');
    expect(screen.getByText(/Schlüssel im Büro/)).toBeInTheDocument();
  });

  it('behält die Zeilen einer Notiz — sie ist oft eine Liste', async () => {
    zeige();
    const notiz = await screen.findByText(/Schlüssel im Büro/);
    expect(notiz.className).toContain('whitespace-pre-line');
  });

  it('sagt „nicht hinterlegt", statt die Zeile wegzulassen', async () => {
    /*
      Eine Akte ohne UID sähe sonst genauso aus wie eine, in der das Feld gar
      nicht vorgesehen ist — und niemand käme auf die Idee, sie nachzutragen.
    */
    kunden = [{ ...KUNDE, vatId: undefined, email: undefined }];
    zeige();
    await screen.findByText('Stammdaten');
    expect(angabe('UID-Nummer').textContent).toBe('nicht hinterlegt');
    expect(angabe('E-Mail').textContent).toBe('nicht hinterlegt');
  });

  it('macht Adresse und Telefon zum Handgriff', async () => {
    zeige();
    await screen.findByText('Stammdaten');
    expect(within(angabe('Rechnungsadresse')).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps'),
    );
    expect(within(angabe('Telefon')).getByRole('link')).toHaveAttribute(
      'href',
      'tel:06641234567',
    );
  });

  it('weist einen stillgelegten Kunden aus', async () => {
    kunden = [{ ...KUNDE, active: false }];
    zeige();
    expect(await screen.findByText('inaktiv')).toBeInTheDocument();
  });
});

describe('Baustellen', () => {
  it('findet Baustellen, die nur über den Namen zusammenhängen', async () => {
    // Umgezogen aus CustomersView.test.tsx — der Fall, für den es die Akte gibt.
    namensgleich = [
      { id: 'p9', companyId: 'perl', projectNumber: 'B-042', customerName: KUNDE.name, status: 'Aktiv' } as Project & { id: string },
    ];
    zeige();
    expect(await screen.findByText(/keinem Kunden zugeordnet/)).toBeInTheDocument();
    expect(screen.getByText(/B-042/)).toBeInTheDocument();
  });

  it('stellt die Verbindung auf einen Klick her', async () => {
    const bediener = userEvent.setup();
    namensgleich = [
      { id: 'p9', companyId: 'perl', projectNumber: 'B-042', customerName: KUNDE.name, status: 'Aktiv' } as Project & { id: string },
    ];
    zeige();
    await screen.findByText(/keinem Kunden zugeordnet/);
    await bediener.click(screen.getByRole('button', { name: 'Zuordnen' }));

    // Der Name wandert als Kopie mit — die Baustellenlisten zeigen ihn, ohne
    // die Kunden zu laden.
    expect(assignProjectToCustomer).toHaveBeenCalledWith('p9', 'k1', 'Hausverwaltung Nord');
  });

  it('bietet der Verwaltung das Zuordnen nicht an', async () => {
    rolle = 'Verwaltung';
    nutzer = NUTZER();
    namensgleich = [
      { id: 'p9', companyId: 'perl', projectNumber: 'B-042', customerName: KUNDE.name, status: 'Aktiv' } as Project & { id: string },
    ];
    zeige();
    await screen.findByText(/keinem Kunden zugeordnet/);
    expect(screen.queryByRole('button', { name: 'Zuordnen' })).toBeNull();
  });

  it('unterscheidet einen Ladefehler von „keine Baustelle"', async () => {
    // Umgezogen. „Konnte nicht geladen werden" und „es gibt keine" sind
    // verschiedene Aussagen; sie gleich aussehen zu lassen war der Grund,
    // warum der Fehler so lange unbemerkt blieb.
    listUnlinkedProjectsByName.mockRejectedValueOnce(new Error('offline'));
    zeige();
    expect(await screen.findByText(/nicht geladen werden/)).toBeInTheDocument();
    expect(screen.queryByText('Noch keine Baustelle zugeordnet.')).not.toBeInTheDocument();
  });

  it('sagt bei leerer Akte, dass exakt gesucht wurde', async () => {
    zeige();
    expect(await screen.findByText(/Gesucht wurde nach exakt/)).toBeInTheDocument();
  });
});

describe('Wartungen in der Akte', () => {
  it('zeigt sie mit Fälligkeit', async () => {
    wartungen = [
      {
        id: 'w1',
        companyId: 'perl',
        customerId: 'k1',
        customerName: KUNDE.name,
        anlage: 'Therme Vaillant ecoTEC',
        intervallMonate: 12,
        faelligAm: '2026-04-10',
        aktiv: true,
      } as Wartung & { id: string },
    ];
    zeige();
    expect(await screen.findByText('Therme Vaillant ecoTEC')).toBeInTheDocument();
    expect(screen.getByText('Seit 52 Tagen überfällig.')).toBeInTheDocument();
  });

  it('bleibt weg, solange das Modul aus ist', async () => {
    modulAn = false;
    zeige();
    await screen.findByText('Stammdaten');
    expect(screen.queryByText('Wartungen')).toBeNull();
    expect(listWartungenForCustomer).not.toHaveBeenCalled();
  });
});

describe('Wenn es den Kunden nicht gibt', () => {
  it('sagt das — statt einen Ladefehler vorzutäuschen', async () => {
    /*
      Wer einem alten Lesezeichen folgt, soll erfahren, dass der Datensatz weg
      ist. „Konnte nicht geladen werden" schickte ihn stattdessen auf die
      Suche nach einem Netzproblem.
    */
    kunden = [];
    zeige('gibtsnicht');
    expect(await screen.findByText(/Diesen Kunden gibt es nicht/)).toBeInTheDocument();
  });
});
