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
let rechnungen: unknown[] = [];
let rechnungenWirft = false;
const listInvoicesForCustomer = vi.fn<[string, string, string[]], Promise<unknown[]>>(async () => {
  if (rechnungenWirft) throw new Error('weg');
  return rechnungen;
});
/** Wie viele Baustellen beim Umbenennen nachgezogen wurden. */
let nachgezogen = 0;
const updateCustomer = vi.fn(async () => nachgezogen);

vi.mock('@/lib/db/customers', () => ({
  listCustomersByIds: () => listCustomersByIds(),
  listProjectsForCustomer: () => listProjectsForCustomer(),
  listUnlinkedProjectsByName: () => listUnlinkedProjectsByName(),
  assignProjectToCustomer: (...a: unknown[]) => assignProjectToCustomer(...(a as [])),
  updateCustomer: (...a: unknown[]) => updateCustomer(...(a as [])),
}));
vi.mock('@/lib/db/quotes', () => ({
  listQuotesForCustomer: (...a: unknown[]) => listQuotesForCustomer(...(a as [])),
}));
vi.mock('@/lib/db/invoices', () => ({
  listInvoicesForCustomer: (b: string, k: string, p: string[]) => listInvoicesForCustomer(b, k, p),
}));
vi.mock('@/lib/db/wartungen', () => ({
  listWartungenForCustomer: () => listWartungenForCustomer(),
}));

let modulAn = true;
vi.mock('@/lib/useModule', () => ({ useModul: () => modulAn }));

vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => '2026-06-01' };
});

let rolle: 'Geschäftsführung' | 'Verwaltung' | 'Buchhaltung' = 'Geschäftsführung';
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
  rechnungen = [];
  rechnungenWirft = false;
  listInvoicesForCustomer.mockClear();
  modulAn = true;
  rolle = 'Geschäftsführung';
  nutzer = NUTZER();
  nachgezogen = 0;
  listCustomersByIds.mockClear();
  updateCustomer.mockClear();
  assignProjectToCustomer.mockClear();
  listUnlinkedProjectsByName.mockClear();
  listWartungenForCustomer.mockClear();
  listQuotesForCustomer.mockClear();
});

/**
 * ZWEI DARSTELLUNGEN DERSELBEN STAMMDATEN — und beide werden geprüft.
 *
 * Wer ändern darf, bekommt Felder; alle anderen bekommen Text. Nur eine von
 * beiden zu prüfen hiesse, die Hälfte der Belegschaft ungeprüft zu lassen —
 * und zwar die grössere.
 */
describe('Die Stammdaten für alle, die nur lesen', () => {
  beforeEach(() => {
    rolle = 'Verwaltung';
    nutzer = NUTZER();
  });

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

  it('bietet kein einziges Eingabefeld an', async () => {
    /*
      DIE GEGENPROBE. Die Grenze steht ohnehin im Zeilenschutz — eine
      Verwaltung, die speichert, bekommt einen Fehler. Ein Formular
      anzubieten, das beim Absenden abgewiesen wird, ist trotzdem eine
      Zumutung: man tippt, drückt, und erfährt erst dann, dass man es nicht
      darf.
    */
    zeige();
    await screen.findByText('Stammdaten');
    expect(screen.queryByLabelText('UID-Nummer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
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

describe('Die Stammdaten bearbeiten — in der Akte statt woanders', () => {
  /*
    WAS VORHER PASSIERTE. Der Knopf „Bearbeiten" führte in das Formular der
    Kundenliste — also aus der Akte heraus, um etwas zu ändern, das in der
    Akte steht. Wer zurückkam, stand wieder in der Liste und musste den
    Kunden erneut suchen.
  */
  it('zeigt die Werte in Feldern, ohne dass man etwas umschalten muss', async () => {
    zeige();
    expect(await screen.findByLabelText('UID-Nummer')).toHaveValue('ATU12345678');
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Hausverwaltung Nord');
  });

  it('hält den Speichern-Balken zurück, solange nichts geändert wurde', async () => {
    /*
      DER GANZE PUNKT DES ENTWURFS. Ein Balken, der von Anfang an dasteht,
      behauptet eine Änderung, die es nicht gibt — und wer ihn einmal
      ignoriert hat, ignoriert ihn auch beim nächsten Mal.
    */
    zeige();
    await screen.findByLabelText('UID-Nummer');
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
  });

  it('lässt ihn erscheinen, sobald sich etwas ändert', async () => {
    const bediener = userEvent.setup();
    zeige();
    await bediener.type(await screen.findByLabelText('UID-Nummer'), '9');
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
  });

  it('nimmt ihn wieder weg, wenn die Änderung zurückgetippt wird', async () => {
    // Die Gegenprobe: ein Balken, der nur auf „es wurde getippt" hört, bliebe
    // stehen, obwohl wieder dasselbe dasteht wie vorher.
    const bediener = userEvent.setup();
    zeige();
    const feld = await screen.findByLabelText('UID-Nummer');
    await bediener.type(feld, '9');
    await bediener.type(feld, '{backspace}');
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
  });

  it('speichert und sagt, wie viele Baustellen mitgewandert sind', async () => {
    /*
      Der Kundenname steht als Kopie auf jeder Baustelle. Ein Umbenennen zieht
      sie nach — das lautlos zu tun hiesse, eine Änderung an fremden
      Datensätzen zu verschweigen.
    */
    nachgezogen = 3;
    const bediener = userEvent.setup();
    zeige();
    const feld = await screen.findByLabelText(/^Name/);
    await bediener.clear(feld);
    await bediener.type(feld, 'Hausverwaltung Süd');
    await bediener.click(screen.getByRole('button', { name: 'Speichern' }));

    await screen.findByText(/3 Baustellen nachgezogen/);
    expect(updateCustomer).toHaveBeenCalledWith(
      'perl', 'k1', expect.objectContaining({ name: 'Hausverwaltung Süd' }),
    );
  });

  it('weist einen leeren Namen ab, statt ihn zu speichern', async () => {
    /*
      Am Namen hängen Baustellen und Rechnungen. Ein leerer Name käme in der
      Datenbank durch — die Spalte ist `not null`, aber eine leere
      Zeichenkette ist nicht null — und hinterliesse eine Akte ohne
      Überschrift.
    */
    const bediener = userEvent.setup();
    zeige();
    await bediener.clear(await screen.findByLabelText(/^Name/));
    await bediener.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Ohne Namen/);
    expect(updateCustomer).not.toHaveBeenCalled();
  });

  it('stellt mit „Verwerfen" den gespeicherten Stand wieder her', async () => {
    const bediener = userEvent.setup();
    zeige();
    const feld = await screen.findByLabelText('UID-Nummer');
    await bediener.clear(feld);
    await bediener.type(feld, 'ATU99999999');
    await bediener.click(screen.getByRole('button', { name: 'Verwerfen' }));

    expect(feld).toHaveValue('ATU12345678');
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
  });

  it('behält Anrufen und Karte — dafür macht das Büro die Akte auf', async () => {
    /*
      Ein Eingabefeld allein nähme der Akte genau das. Die Verweise folgen
      dem, was IM FELD steht: wer eine Nummer korrigiert, kann sie sofort
      wählen, ohne vorher zu speichern.
    */
    const bediener = userEvent.setup();
    zeige();
    const feld = await screen.findByLabelText('Telefon');
    await bediener.clear(feld);
    await bediener.type(feld, '0664 9999999');

    expect(screen.getByRole('link', { name: /0664 9999999/ }))
      .toHaveAttribute('href', 'tel:06649999999');
  });
});

describe('Die Angebote der Akte', () => {
  it('sucht nach der KENNUNG des Kunden, nicht nach seinem Namen', async () => {
    /*
      DER FEHLER, DER NIE AUFFIEL. Hier stand der Name; die Abfrage filtert
      aber auf `customerId`, und `quotes.customer_id` ist eine `uuid`. Unter
      Postgres scheitert sie damit an JEDEM Kunden — die Akte meldete „die
      Angebote konnte nicht geladen werden". Unter Firestore kam einfach
      nichts zurück, was wie „noch kein Angebot" aussah; der Abschnitt hat
      also nie funktioniert.
    */
    zeige();
    await screen.findByText('Stammdaten');
    expect(listQuotesForCustomer).toHaveBeenCalledWith('perl', 'k1');
  });
});

describe('Die Rechnungen der Akte', () => {
  it('zeigt sie — gesucht über die Baustellen des Kunden, verlinkt in die Rechnungsliste', async () => {
    zugeordnet = [{ id: 'p1', projectNumber: '2026-001', customerName: 'Familie Huber', customerId: 'k1' } as Project & { id: string }];
    rechnungen = [{
      id: 'r1', invoiceNumber: 'RE-2026-1001', invoiceDate: '2026-09-10', projectNumber: '2026-001',
      totalBrutto: 1200, paymentStatus: 'Teilbezahlt',
    }];
    zeige();
    const link = await screen.findByRole('link', { name: 'RE-2026-1001' });
    expect(link).toHaveAttribute('href', '/invoices?suche=RE-2026-1001');
    expect(screen.getByText(/1.200,00 brutto · Teilbezahlt/)).toBeInTheDocument();
    expect(listInvoicesForCustomer).toHaveBeenCalledWith('perl', 'k1', ['p1']);
  });

  it('zeigt die jüngsten fünf — alle erst auf Wunsch', async () => {
    rechnungen = Array.from({ length: 7 }, (_, i) => ({
      id: `r${i}`, invoiceNumber: `RE-2026-10${i}`, invoiceDate: '2026-09-10', projectNumber: '2026-001',
      totalBrutto: 100, paymentStatus: 'Bezahlt',
    }));
    zeige();
    await screen.findByRole('link', { name: 'RE-2026-100' });
    expect(screen.getAllByRole('link', { name: /^RE-2026-10/ })).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: 'Alle 7 zeigen' }));
    expect(screen.getAllByRole('link', { name: /^RE-2026-10/ })).toHaveLength(7);
  });

  it('sagt, wenn es noch keine gibt — und wenn sie nicht geladen werden konnten', async () => {
    zeige();
    expect(await screen.findByText('Noch keine Rechnung.')).toBeInTheDocument();
  });

  it('meldet einen Ladefehler, statt eine leere Liste vorzutäuschen', async () => {
    rechnungenWirft = true;
    zeige();
    expect(await screen.findByText(/die Rechnungen/)).toBeInTheDocument();
  });

  it('zeigt sie nur, wer Rechnungen stellt — die Verwaltung nicht', async () => {
    rolle = 'Verwaltung';
    nutzer = NUTZER();
    zeige();
    await screen.findByRole('heading', { name: 'Angebote' });
    expect(screen.queryByRole('heading', { name: 'Rechnungen' })).not.toBeInTheDocument();
    expect(listInvoicesForCustomer).not.toHaveBeenCalled();
  });
});
