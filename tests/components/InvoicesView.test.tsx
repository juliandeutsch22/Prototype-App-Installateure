import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { Invoice, Material, Project, TimeEntry, WorkSheet } from '@/types';
import InvoicesView from '@/features/invoices/InvoicesView';

/**
 * Die Rechnungsansicht — bis jetzt ohne eigenen Test, und dabei die Ansicht,
 * in der Geld entsteht.
 *
 * Die Rechenteile sind abgedeckt (`assemble`, `totals`, `invoiceNumbers`).
 * Was fehlte, ist die REIHENFOLGE: Nummer verbindlich ziehen, Belege sperren,
 * dann anlegen. Genau daran hängt, ob eine Nummer zweimal vergeben oder ein
 * Zeiteintrag zweimal verrechnet werden kann — und beides merkt man erst beim
 * Steuerberater.
 */

const PROJEKT: Project & { id: string } = {
  id: 'p1',
  companyId: 'perl',
  projectNumber: '2026-042',
  customerName: 'Familie Huber',
  address: 'Bergweg 3',
  status: 'Aktiv',
} as Project & { id: string };

const ZEIT: TimeEntry & { id: string } = {
  id: 'z1',
  companyId: 'perl',
  userId: 'u1',
  userName: 'Max',
  date: '2026-08-20',
  status: 'Anwesend',
  startTime: '08:00',
  endTime: '16:00',
  breakDuration: 0,
  projectNumber: '2026-042',
} as TimeEntry & { id: string };

const SCHEIN: WorkSheet & { id: string } = {
  id: 's1',
  companyId: 'perl',
  projectNumber: '2026-042',
  customerName: 'Familie Huber',
  datum: '2026-08-22',
  status: 'Unterschrieben',
  abrechnung: 'Regie',
  zeiten: [],
  material: [{ name: 'Eckventil 1/2 Zoll', menge: 2, einheit: 'Stk' }],
  erstelltVonUid: 'u1',
  erstelltVonName: 'Max',
} as WorkSheet & { id: string };

const KATALOG: Material[] = [
  {
    id: 'k1',
    companyId: 'perl',
    name: 'Eckventil 1/2 Zoll',
    stock: 20,
    unit: 'Stk',
    verkaufspreis: 8.5,
  },
];

let rechnungen: (Invoice & { id: string })[] = [];
let zeiten: (TimeEntry & { id: string })[] = [];
let scheine: (WorkSheet & { id: string })[] = [];
let katalog: Material[] = [];
let reservierteNummer = 'RE-2026-1099';
let reservierungWirft: Error | null = null;

const reserve = vi.fn();
const markiere = vi.fn();
const lege = vi.fn();
const reihenfolge: string[] = [];

vi.mock('@/lib/db/invoices', async () => {
  const echt = await vi.importActual<typeof import('@/lib/invoiceNumbers')>('@/lib/invoiceNumbers');
  return {
    // Die reinen Nummernregeln sind echt — sie sind der Kern der Sache.
    nextInvoiceNumber: echt.nextInvoiceNumber,
    isInvoiceNumberTaken: echt.isInvoiceNumberTaken,
    highestInvoiceSeq: echt.highestInvoiceSeq,
    invoiceSeqOf: echt.invoiceSeqOf,
    subscribeRecentInvoices: (
      _c: string,
      _g: number,
      cb: (rows: (Invoice & { id: string })[]) => void,
    ) => {
      cb(rechnungen);
      return () => undefined;
    },
    reserveInvoiceNumber: (c: string, opts: { seedFrom: number; desired?: number }) => {
      reihenfolge.push('reserve');
      reserve(c, opts);
      if (reservierungWirft) return Promise.reject(reservierungWirft);
      return Promise.resolve(reservierteNummer);
    },
    markBilled: (...a: unknown[]) => {
      reihenfolge.push('markBilled');
      markiere(...a);
      return Promise.resolve();
    },
    createInvoice: (_c: string, inv: Invoice) => {
      reihenfolge.push('createInvoice');
      lege(inv);
      return Promise.resolve('neu');
    },
    updateInvoiceStatus: vi.fn(async () => undefined),
    cancelInvoice: vi.fn(async () => undefined),
    reactivateInvoice: vi.fn(async () => undefined),
    deleteInvoice: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => [PROJEKT]),
  listProjectsByNumbers: vi.fn(async () => [PROJEKT]),
}));
let kunden: Array<{ name: string; vatId?: string }> = [];
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => kunden) }));
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: vi.fn(async () => zeiten),
}));
vi.mock('@/lib/db/workSheets', () => ({
  listWorkSheetsForProject: vi.fn(async () => scheine),
}));
vi.mock('@/lib/db/materials', () => ({ listMaterials: vi.fn(async () => katalog) }));

// Das PDF wird beim Bestätigen dynamisch nachgeladen und hat mit der Frage
// dieses Tests nichts zu tun.
const pdfAusgabe = vi.fn();
vi.mock('@/features/invoices/pdf', () => ({
  downloadInvoicePdf: (...a: unknown[]) => pdfAusgabe(...a),
}));

const authWert = {
  user: { uid: 'gf', companyId: 'perl', name: 'Chefin', role: 'Buchhaltung' as const },
  company: {
    id: 'perl',
    name: 'Perl Installationen',
    rates: undefined,
    // Ohne eigene UID ist keine Reverse-Charge-Rechnung vollständig — sie
    // gehört zu den Firmendaten und steht auf jeder Rechnung in der Fusszeile.
    vatId: 'ATU12345678',
  },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige() {
  return render(
    <ToastProvider>
      <InvoicesView />
    </ToastProvider>,
  );
}

/** Baustelle wählen und die Positionen zusammenstellen lassen. */
async function bisZurVorschau() {
  zeige();
  const auswahl = await screen.findByRole("combobox", { name: /Baustelle/ });
  await userEvent.selectOptions(auswahl, '2026-042');
  await userEvent.click(screen.getByRole('button', { name: 'Positionen zusammenstellen' }));
  return screen.findByRole('button', { name: /Rechnung erstellen/ });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  rechnungen = [];
  zeiten = [ZEIT];
  scheine = [];
  katalog = [];
  kunden = [];
  reservierteNummer = 'RE-2026-1099';
  reservierungWirft = null;
  reihenfolge.length = 0;
  reserve.mockClear();
  markiere.mockClear();
  lege.mockClear();
  pdfAusgabe.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Rechnungen — der Weg von Zeiten zu einer Rechnung', () => {
  it('sperrt die Belege VOR dem Anlegen der Rechnung', async () => {
    /**
     * Die Reihenfolge ist die eigentliche Aussage. Bricht es nach dem Sperren
     * ab, ist schlimmstenfalls eine Rechnung nicht entstanden — dreht man sie
     * um, ist im Fehlerfall ein Zeiteintrag ein zweites Mal verrechenbar, und
     * der Kunde bekommt dieselbe Stunde zweimal in Rechnung gestellt.
     */
    const bestaetigen = await bisZurVorschau();
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(reihenfolge).toEqual(['reserve', 'markBilled', 'createInvoice']);
  });

  it('schreibt die RESERVIERTE Nummer in die Rechnung, nicht die vorgeschlagene', async () => {
    /**
     * Der Vorschlag im Feld stammt aus der Liste im Browser und ist veraltet,
     * sobald jemand parallel abrechnet. Verbindlich ist allein, was die
     * Transaktion zurückgibt.
     */
    rechnungen = [{ id: 'alt', invoiceNumber: 'RE-2026-1004' } as Invoice & { id: string }];
    reservierteNummer = 'RE-2026-1099';

    const bestaetigen = await bisZurVorschau();
    // Der Vorschlag im Feld waere 1005 — die Transaktion sagt 1099.
    expect((screen.getByLabelText(/Rechnungsnummer/) as HTMLInputElement).value).toBe(
      'RE-2026-1005',
    );
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][0].invoiceNumber).toBe('RE-2026-1099');
    expect(markiere).toHaveBeenCalledWith('timeEntries', ['z1'], 'RE-2026-1099');
  });

  it('zieht ohne Handeingabe KEINE Wunschnummer', async () => {
    // Sonst gaebe der Client vor, welche Nummer die Transaktion vergeben soll
    // — und die Monotonie haenge wieder am Browser.
    const bestaetigen = await bisZurVorschau();
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(reserve).toHaveBeenCalled());
    expect(reserve.mock.calls[0][1].desired).toBeUndefined();
  });

  it('reicht eine von Hand gesetzte Nummer als Wunsch weiter', async () => {
    const bestaetigen = await bisZurVorschau();
    const feld = screen.getByLabelText(/Rechnungsnummer/);
    await userEvent.clear(feld);
    await userEvent.type(feld, 'RE-2026-2000');
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(reserve).toHaveBeenCalled());
    expect(reserve.mock.calls[0][1].desired).toBe(2000);
  });

  it('gibt die Auskunft der Nummernvergabe unveraendert weiter', async () => {
    /**
     * „Die Nummer RE-2026-1005 ist bereits vergeben. Die nächste freie ist
     * RE-2026-1006." — diese Auskunft ist mehr wert als ein Sammelsatz, denn
     * sie sagt, was stattdessen geht.
     */
    reservierungWirft = new Error(
      'Die Nummer RE-2026-1005 ist bereits vergeben. Die nächste freie ist RE-2026-1006.',
    );
    const bestaetigen = await bisZurVorschau();
    await userEvent.click(bestaetigen);

    expect(await screen.findByText(/bereits vergeben/)).toBeInTheDocument();
    expect(lege).not.toHaveBeenCalled();
  });

  it('legt ohne verrechenbare Belege gar nichts an', async () => {
    // Die Meldung nennt seither BEIDE Quellen: seit Material aus den
    // Handwerksscheinen mitkommt, wäre „keine Stunden" nur die halbe Auskunft.
    zeiten = [];
    zeige();
    const auswahl = await screen.findByRole("combobox", { name: /Baustelle/ });
    await userEvent.selectOptions(auswahl, '2026-042');
    await userEvent.click(screen.getByRole('button', { name: 'Positionen zusammenstellen' }));

    expect(await screen.findByText(/Keine offenen Stunden und kein offenes Material/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rechnung erstellen/ })).toBeNull();
    expect(reserve).not.toHaveBeenCalled();
  });
});

/**
 * Material aus dem Handwerksschein — und der Leistungszeitraum.
 *
 * Die Rechenregeln stehen in `tests/unit/materialAufRechnung.test.ts`. Hier
 * geht es um die Zusage, die der Betrieb ausdrücklich verlangt hat:
 * automatisch heisst VORBEREITET, nicht festgelegt. Was da steht, muss sich
 * ändern und entfernen lassen — sonst ist die Automatik eine Fessel.
 */
describe('Material und Leistungszeitraum in der Vorschau', () => {
  it('setzt Material aus dem unterschriebenen Schein als eigene Position', async () => {
    scheine = [SCHEIN];
    katalog = KATALOG;
    await bisZurVorschau();

    const zeile = await screen.findByDisplayValue('Eckventil 1/2 Zoll');
    expect(zeile).toBeInTheDocument();
    expect(screen.getByDisplayValue('8.5')).toBeInTheDocument();
  });

  it('lässt seinen PREIS von Hand überschreiben', async () => {
    /*
      Ausdrücklich aus dem Betrieb: „für manche Materialien sind keine
      Standardpreise vorhanden." Das gilt nicht nur für die Lücke — auch ein
      gepflegter Katalogpreis stimmt nicht immer: ein Sonderrabatt vom
      Grosshandel, ein Kulanzpreis, ein Artikel, der teurer geworden ist,
      seit ihn jemand eingetragen hat.

      Der Katalog liefert einen VORSCHLAG. Was beim Kunden landet, entscheidet
      das Büro in dieser Zeile.
    */
    scheine = [SCHEIN];
    katalog = KATALOG;
    await bisZurVorschau();
    await screen.findByDisplayValue('Eckventil 1/2 Zoll');

    const preis = screen.getByLabelText(/Einzelpreis Position 2/);
    await userEvent.clear(preis);
    await userEvent.type(preis, '12.5');

    await userEvent.click(screen.getByRole('button', { name: /Rechnung erstellen/ }));
    await waitFor(() => expect(lege).toHaveBeenCalled());

    const positionen = lege.mock.calls[0][0].positions as Array<{
      label: string;
      unitPrice: number;
      netto: number;
    }>;
    const material = positionen.find((x) => x.label === 'Eckventil 1/2 Zoll');
    // 2 Stück zu 12,50 € — nicht der Katalogpreis von 8,50 €.
    expect(material).toMatchObject({ unitPrice: 12.5, netto: 25 });
  });

  it('lässt auch die MENGE ändern', async () => {
    // Der Schein sagt, was mitgenommen wurde; verbaut wird gelegentlich
    // weniger, und der Rest fährt zurück ins Lager.
    scheine = [SCHEIN];
    katalog = KATALOG;
    await bisZurVorschau();
    await screen.findByDisplayValue('Eckventil 1/2 Zoll');

    const menge = screen.getByLabelText(/Menge Position 2/);
    await userEvent.clear(menge);
    await userEvent.type(menge, '1');

    await userEvent.click(screen.getByRole('button', { name: /Rechnung erstellen/ }));
    await waitFor(() => expect(lege).toHaveBeenCalled());
    const positionen = lege.mock.calls[0][0].positions as Array<{ label: string; netto: number }>;
    expect(positionen.find((x) => x.label === 'Eckventil 1/2 Zoll')).toMatchObject({ netto: 8.5 });
  });

  it('lässt sich entfernen — und die Summe zieht nach', async () => {
    scheine = [SCHEIN];
    katalog = KATALOG;
    await bisZurVorschau();
    await screen.findByDisplayValue('Eckventil 1/2 Zoll');

    // Die Entfernen-Knöpfe stehen je Zeile; der letzte gehört dem Material.
    const knoepfe = screen.getAllByRole('button', { name: /entfernen/i });
    await userEvent.click(knoepfe[knoepfe.length - 1]);

    await waitFor(() =>
      expect(screen.queryByDisplayValue('Eckventil 1/2 Zoll')).not.toBeInTheDocument(),
    );
  });

  it('belegt den Leistungszeitraum vor und lässt ihn ändern', async () => {
    /*
      Vorbelegt aus den Belegen: Zeiteintrag am 20.08., Schein am 22.08. Der
      Zeitraum spannt beide — und bleibt trotzdem änderbar, weil eine
      Teilrechnung sich bewusst auf einen anderen beziehen kann.
    */
    scheine = [SCHEIN];
    katalog = KATALOG;
    await bisZurVorschau();

    const von = await screen.findByLabelText('Leistung von');
    const bis = screen.getByLabelText('Leistung bis');
    expect(von).toHaveValue('2026-08-20');
    expect(bis).toHaveValue('2026-08-22');

    await userEvent.clear(von);
    await userEvent.type(von, '2026-08-01');
    await userEvent.click(screen.getByRole('button', { name: /Rechnung erstellen/ }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][0]).toMatchObject({
      leistungVon: '2026-08-01',
      leistungBis: '2026-08-22',
      linkedWorkSheets: ['s1'],
    });
  });

  it('warnt, wenn der Zeitraum leer ist', async () => {
    // Ohne ihn ist die Rechnung nach § 11 UStG unvollständig. Das darf nicht
    // stillschweigend durchgehen.
    await bisZurVorschau();
    const von = await screen.findByLabelText('Leistung von');
    await userEvent.clear(von);
    expect(await screen.findByText(/nach § 11 UStG unvollständig/)).toBeInTheDocument();
  });

  it('weist auf Material ohne Preis hin', async () => {
    // Eine erfundene Zahl auf einer Rechnung wäre schlimmer als eine
    // sichtbare Lücke.
    scheine = [SCHEIN];
    katalog = [];
    await bisZurVorschau();
    expect(await screen.findByText(/Ohne Preis im Katalog/)).toBeInTheDocument();
    expect(screen.getByText(/Eckventil 1\/2 Zoll/)).toBeInTheDocument();
  });

  it('nimmt einen Schein NICHT, dessen Material schon auf einer Rechnung steht', async () => {
    scheine = [SCHEIN];
    katalog = KATALOG;
    rechnungen = [
      { id: 'r1', linkedWorkSheets: ['s1'], paymentStatus: 'Offen' } as Invoice & { id: string },
    ];
    await bisZurVorschau();
    expect(screen.queryByDisplayValue('Eckventil 1/2 Zoll')).not.toBeInTheDocument();
  });
});

/**
 * Bauleistung mit Übergang der Steuerschuld — § 19 Abs 1a UStG.
 *
 * Die reinen Regeln stehen in `tests/unit/reverseCharge.test.ts`, der Beleg in
 * `rechnungLeistungszeitraum`. Hier geht es um die Stelle, an der es schiefgeht:
 * eine Rechnung, die als Reverse Charge hinausgeht, ohne die UID des
 * Empfängers zu tragen. Der Übergang ist dann nicht belegt, der Empfänger
 * kann den Beleg nicht verwenden — und der Betrieb bekommt ihn zurück.
 */
describe('Reverse Charge in der Rechnungsmaske', () => {
  it('ist aus, solange niemand es anhakt', async () => {
    // Bei einem Betrieb, der überwiegend für Private arbeitet, bleibt der
    // Haken das ganze Jahr aus. Er darf sich nicht von selbst setzen.
    await bisZurVorschau();
    expect(screen.getByRole('checkbox', { name: /Bauleistung/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /Rechnung erstellen/ }));
    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][0]).toMatchObject({ reverseCharge: false, vatRate: 0.2 });
  });

  it('sperrt den Knopf, solange die UID des Kunden fehlt', async () => {
    /*
      Eine Warnung, die man wegklicken kann, führte zu genau der Rechnung, die
      später berichtigt werden muss. Hier gibt es nichts abzuwägen.
    */
    await bisZurVorschau();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bauleistung/ }));
    expect(await screen.findByRole('button', { name: /Rechnung erstellen/ })).toBeDisabled();
    expect(screen.getByText(/nicht belegt/)).toBeInTheDocument();
  });

  it('gibt ihn frei, sobald sie dasteht — und schreibt sie in die Rechnung', async () => {
    await bisZurVorschau();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bauleistung/ }));
    await userEvent.type(screen.getByLabelText(/UID-Nummer des Kunden/), 'ATU11112222');

    const knopf = await screen.findByRole('button', { name: /Rechnung erstellen/ });
    await waitFor(() => expect(knopf).toBeEnabled());
    await userEvent.click(knopf);

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][0]).toMatchObject({
      reverseCharge: true,
      customerVatId: 'ATU11112222',
      // Der geltende Satz, nicht der eingestellte: sonst stünde auf dem Beleg
      // eine Steuer über einen Betrag ohne.
      vatRate: 0,
      totalVat: 0,
    });
  });

  it('belegt die UID aus den Kundenstammdaten vor', async () => {
    // Abtippen vom Briefkopf ist die Stelle, an der die Ziffer verlorengeht.
    kunden = [{ name: 'Familie Huber', vatId: 'ATU55556666' }];
    await bisZurVorschau();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bauleistung/ }));
    expect(screen.getByLabelText(/UID-Nummer des Kunden/)).toHaveValue('ATU55556666');
  });

  it('weist auf eine UID hin, die keine sein kann', async () => {
    await bisZurVorschau();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bauleistung/ }));
    await userEvent.type(screen.getByLabelText(/UID-Nummer des Kunden/), 'ATU123');
    expect(await screen.findByText(/sieht nicht nach einer UID/)).toBeInTheDocument();
  });

  it('rechnet die Steuer aus der Vorschau heraus', async () => {
    // 8 Stunden Facharbeit — ohne Übergang mit 20 %, mit Übergang ohne.
    await bisZurVorschau();
    await userEvent.click(screen.getByRole('checkbox', { name: /Bauleistung/ }));
    await userEvent.type(screen.getByLabelText(/UID-Nummer des Kunden/), 'ATU11112222');
    expect(await screen.findByText('Übergang der Steuerschuld')).toBeInTheDocument();
    expect(screen.getByText('Rechnungsbetrag')).toBeInTheDocument();
  });
});

/**
 * Eine bestehende Rechnung erneut als PDF ausgeben.
 *
 * DIESER TEST ENTSTAND AUS EINER GEGENPROBE, DIE DURCHGING. Der Weg war
 * ungeprüft — und ausgerechnet hier fällt ein Fehler nicht auf: der zweite
 * Druck sieht aus wie ein PDF, nur ohne den Pflichthinweis und ohne die UID
 * des Empfängers. Damit wäre es ein anderer, ungültiger Beleg über dieselbe
 * Rechnungsnummer.
 */
describe('Erneute PDF-Ausgabe', () => {
  const RC_RECHNUNG = {
    id: 'r1',
    invoiceNumber: 'RE-2026-0007',
    projectNumber: '2026-042',
    customerName: 'Baumeister Gruber',
    invoiceDate: '2026-09-10',
    dueDate: '2026-09-24',
    positions: [{ label: 'Facharbeit', qty: 8, unit: 'h', unitPrice: 65, netto: 520 }],
    totalNetto: 520,
    totalVat: 0,
    totalBrutto: 520,
    vatRate: 0,
    reverseCharge: true,
    customerVatId: 'ATU11112222',
    leistungVon: '2026-09-01',
    leistungBis: '2026-09-05',
    paymentStatus: 'Offen',
  } as unknown as Invoice & { id: string };

  it('nimmt Pflichthinweis, UID und Zeitraum aus dem DOKUMENT', async () => {
    rechnungen = [RC_RECHNUNG];
    zeige();
    // Der Zeilentitel ist eine zusammengesetzte Zeichenkette
    // („Nummer · Kunde"), deshalb der Ausdruck statt des genauen Texts.
    await screen.findByText(/RE-2026-0007/);

    await userEvent.click(
      await screen.findByRole('button', { name: /Weitere Aktionen für Rechnung RE-2026-0007/ }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'PDF erneut laden' }));

    await waitFor(() => expect(pdfAusgabe).toHaveBeenCalled());
    expect(pdfAusgabe.mock.calls[0][0]).toMatchObject({
      reverseCharge: true,
      customerVatId: 'ATU11112222',
      vatRate: 0,
    });
    // Und der Zeitraum aus dem Dokument, nicht neu abgeleitet: er stand so
    // beim Kunden, auch wenn seither Buchungen dazugekommen sind.
    expect(pdfAusgabe.mock.calls[0][0].assembled.leistung).toEqual({
      von: '2026-09-01',
      bis: '2026-09-05',
    });
  });
});
