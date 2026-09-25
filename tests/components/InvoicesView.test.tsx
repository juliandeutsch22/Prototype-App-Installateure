import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Invoice, Material, Project, TimeEntry, WorkSheet } from '@/types';
import InvoicesView from '@/features/invoices/InvoicesView';
import { mitSchreibtisch } from './schreibtisch';
import { karteMitZahl, karteZaehlt } from './kartenZahl';

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
/** Was die Suche über ALLE Rechnungen auf dem Server findet. */
let suchTreffer: (Invoice & { id: string })[] = [];
let sucheWirft = false;
const suche = vi.fn();
let zeiten: (TimeEntry & { id: string })[] = [];
let scheine: (WorkSheet & { id: string })[] = [];
let katalog: Material[] = [];
let reservierteNummer = 'RE-2026-1099';
let reservierungWirft: Error | null = null;

const reserve = vi.fn();
const markiere = vi.fn();
const lege = vi.fn();
const mahnung = vi.fn();
const reihenfolge: string[] = [];

/*
  Zwei neue Abfragen, weil zwei Auswertungen nicht mehr über die zufällig
  geladene Liste rechnen: der Mahnlauf über die offenen Forderungen, der
  Export über seinen Zeitraum.
*/
let offene: (Invoice & { id: string })[] = [];
let imZeitraum: (Invoice & { id: string })[] = [];
const listUnpaidInvoices = vi.fn(async () => offene);
/** Was auf dieser Baustelle schon verrechnet ist — Grundlage des Abzugs. */
let derBaustelle: (Invoice & { id: string })[] = [];
let baustellenAbfrageWirft = false;
const listInvoicesForProject = vi.fn(async () => {
  if (baustellenAbfrageWirft) throw new Error('offline');
  return derBaustelle;
});
const listInvoicesInRange = vi.fn<[string, string, string], Promise<(Invoice & { id: string })[]>>(
  async () => imZeitraum,
);

/*
  DIE GRENZE IM TEST KLEIN HALTEN.

  Die echte steht bei tausend. Tausend Zeilen zu rendern, nur um zu prüfen,
  DASS die Ansicht die Grenze weiterreicht, kostete auf dem Läufer über fünf
  Sekunden — der Test lief in die Zeitgrenze. Geprüft wird hier die
  Verdrahtung, nicht der Zahlenwert; der steht in
  `tests/unit/listengrenzen.test.ts`.
*/
vi.mock('@/lib/listengrenzen', () => ({
  KATALOG_GRENZE: 3,
  KUNDEN_GRENZE: 500,
  BAUSTELLEN_AUSWAHL_GRENZE: 500,
  abgeschnitten: (z: readonly unknown[], g: number) => z.length >= g,
  katalogAbgeschnitten: (z: readonly unknown[], g = 3) => z.length >= g,
  kundenAbgeschnitten: (z: readonly unknown[], g = 500) => z.length >= g,
  baustellenAuswahlAbgeschnitten: (z: readonly unknown[], g = 500) => z.length >= g,
}));

vi.mock('@/lib/db/invoices', async () => {
  const echt = await vi.importActual<typeof import('@/lib/invoiceNumbers')>('@/lib/invoiceNumbers');
  return {
    // Die reinen Nummernregeln sind echt — sie sind der Kern der Sache.
    nextInvoiceNumber: echt.nextInvoiceNumber,
    isInvoiceNumberTaken: echt.isInvoiceNumberTaken,
    highestInvoiceSeq: echt.highestInvoiceSeq,
    invoiceSeqOf: echt.invoiceSeqOf,
    /*
      Die OFFENEN Forderungen kommen jetzt eigens vom Server — der Mahnlauf
      lief vorher über die Arbeitsliste und sah damit ausgerechnet die
      ältesten Forderungen nicht.
    */
    listUnpaidInvoices: () => listUnpaidInvoices(),
    /*
      Und der Buchhaltungs-Export holt seinen Zeitraum selbst, statt die
      geladene Liste zu filtern. Der Doppelgänger gibt zurück, was der Test
      als „im Zeitraum vorhanden" hinterlegt hat.
    */
    listInvoicesInRange: (c: string, von: string, bis: string) =>
      listInvoicesInRange(c, von, bis),
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
    /*
      Die Rechnungen EINER BAUSTELLE — für den Abzug auf der Schlussrechnung.
      Eigene Abfrage, weil eine bezahlte Anzahlung weder in den offenen Posten
      noch verlässlich unter den jüngsten Rechnungen steht.
    */
    listInvoicesForProject: () => listInvoicesForProject(),
    sucheRechnungen: (c: string, b: string) => {
      suche(c, b);
      return sucheWirft ? Promise.reject(new Error('weg')) : Promise.resolve(suchTreffer);
    },
    RECHNUNG_TREFFER: 100,
    updateInvoiceStatus: vi.fn(async () => undefined),
    mahnungFesthalten: (...a: unknown[]) => {
      mahnFolge.push('vermerk');
      return mahnung(...a);
    },
    cancelInvoice: vi.fn(async () => undefined),
    reactivateInvoice: vi.fn(async () => undefined),
    deleteInvoice: vi.fn(async () => undefined),
  };
});

/*
  DIE ZAHLUNGSSCHICHT ALS DOPPELGÄNGER. Was sie in der Datenbank auslöst — der
  abgeleitete Zahlungsstand — ist dort geprüft (`tests/supabase/zahlungen`).
  Hier geht es um die Verdrahtung: kommt beim Speichern an, was im Formular
  steht, und zeigt die Zeile danach den richtigen Rest.
*/
let erfassteZahlungen: Array<Record<string, unknown>> = [];
const createZahlung = vi.fn(async (_c: string, z: Record<string, unknown>) => {
  erfassteZahlungen.push(z);
  return 'z-neu';
});
const listZahlungen = vi.fn(async () => bisherigeZahlungen);
let bisherigeZahlungen: Array<Record<string, unknown>> = [];
vi.mock('@/lib/db/zahlungen', () => ({
  listZahlungen: (...a: unknown[]) => listZahlungen(...(a as [])),
  createZahlung: (...a: unknown[]) => createZahlung(...(a as [string, Record<string, unknown>])),
  deleteZahlung: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => [PROJEKT]),
  listProjectsByNumbers: vi.fn(async () => [PROJEKT]),
}));
let kunden: Array<{ name: string; vatId?: string }> = [];
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => kunden) }));
/*
  Der Kontenrahmen. Leer ist der Regelfall: ohne hinterlegte Konten gibt es
  keinen Buchungsstapel, und die Ansicht muss trotzdem vollständig sein.
*/
let konten: Array<Record<string, unknown>> = [];
vi.mock('@/lib/db/konten', () => ({ buchungskonten: vi.fn(async () => konten) }));
vi.mock('@/lib/db/timeEntries', () => ({
  listEntriesForProjects: vi.fn(async () => zeiten),
}));
/*
  Die Scheine des ganzen Betriebs — für „nicht verrechnete Leistung". Eigene
  Liste, nicht dieselbe wie die je Baustelle: hier geht es um Scheine, deren
  Baustelle gerade NICHT gewählt ist.
*/
let alleScheine: (WorkSheet & { id: string })[] = [];
const listRecentWorkSheets = vi.fn(async () => alleScheine);

vi.mock('@/lib/db/workSheets', () => ({
  listRecentWorkSheets: () => listRecentWorkSheets(),
  listWorkSheetsForProject: vi.fn(async () => scheine),
}));
vi.mock('@/lib/db/materials', () => ({ listMaterials: vi.fn(async () => katalog) }));
/** Die Angebote der Baustelle — für die Pauschale (Launch-Check, K3). */
let angebote: Array<Record<string, unknown>> = [];
vi.mock('@/lib/db/quotes', () => ({ listQuotesForProject: vi.fn(async () => angebote) }));

// Das PDF wird beim Bestätigen dynamisch nachgeladen und hat mit der Frage
// dieses Tests nichts zu tun.
/*
  Das Mahnungs-PDF wird beim Erzeugen dynamisch nachgeladen. Der Ersatz gibt
  einen Blob heraus, damit der Weg bis zum Herunterladen durchläuft.
*/
/** Die Reihenfolge, in der beim Mahnen etwas geschieht. */
const mahnFolge: string[] = [];
const mahnungPdf = vi.fn(async () => {
  mahnFolge.push('pdf');
  return new Blob(['%PDF'], { type: 'application/pdf' });
});
vi.mock('@/features/invoices/mahnungPdf', () => ({
  buildMahnungPdf: (...a: unknown[]) => mahnungPdf(...(a as [])),
  mahnungDateiname: () => 'Mahnung.pdf',
}));
// Derselbe Weg wie beim Handwerksschein — jsdom kennt weder das Teilen noch
// `URL.createObjectURL`.
const teilen = vi.fn(async () => 'geladen' as const);
vi.mock('@/features/worksheets/worksheetPdf', () => ({
  shareOrDownloadPdf: (...a: unknown[]) => teilen(...(a as [])),
  buildWorkSheetPdf: vi.fn(),
}));

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
    /*
      AB WERK AUS. Die meisten Prüfungen hier beschreiben den Alltag: eine
      Rechnung aus einer Baustelle. Der Betrieb, der Anzahlungen stellt, ist
      der Sonderfall und schaltet sie unten ausdrücklich ein.
    */
    rechnungsarten: false,
    // Ohne eigene UID ist keine Reverse-Charge-Rechnung vollständig — sie
    // gehört zu den Firmendaten und steht auf jeder Rechnung in der Fusszeile.
    vatId: 'ATU12345678',
    // Der Aussteller auf jeder Rechnung (§ 11 UStG) — ohne sie gibt es keine.
    addressLine: 'Hauptstraße 1 · 2700 Wiener Neustadt' as string | undefined,
  },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

function zeige(adresse = '/invoices') {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <ToastProvider>
        <InvoicesView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/** Baustelle wählen und die Positionen zusammenstellen lassen. */
async function bisZurVorschau(art?: string) {
  zeige();
  const auswahl = await screen.findByRole("combobox", { name: /Baustelle/ });
  await userEvent.selectOptions(auswahl, '2026-042');
  if (art) {
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Art der Rechnung/ }),
      art,
    );
  }
  await userEvent.click(
    screen.getByRole('button', {
      name: art === 'anzahlung' ? 'Anzahlung vorbereiten' : 'Positionen zusammenstellen',
    }),
  );
  return screen.findByRole('button', { name: /Rechnung erstellen/ });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 1, 9, 0, 0));
  rechnungen = [];
  suchTreffer = [];
  sucheWirft = false;
  suche.mockReset();
  alleScheine = [];
  offene = [];
  imZeitraum = [];
  derBaustelle = [];
  baustellenAbfrageWirft = false;
  konten = [];
  authWert.company.rechnungsarten = false;
  listInvoicesForProject.mockClear();
  listUnpaidInvoices.mockClear();
  listInvoicesInRange.mockClear();
  listRecentWorkSheets.mockClear();
  zeiten = [ZEIT];
  scheine = [];
  katalog = [];
  kunden = [];
  angebote = [];
  PROJEKT.billingMode = undefined;
  reservierteNummer = 'RE-2026-1099';
  reservierungWirft = null;
  reihenfolge.length = 0;
  reserve.mockClear();
  markiere.mockClear();
  lege.mockClear();
  pdfAusgabe.mockClear();
  mahnung.mockClear();
  mahnungPdf.mockClear().mockImplementation(async () => {
    mahnFolge.push('pdf');
    return new Blob(['%PDF'], { type: 'application/pdf' });
  });
  teilen.mockClear();
  mahnFolge.length = 0;
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
    // Der Vorschlag waere 1005 — die Transaktion sagt 1099. Seit es eine
    // Rechnung gibt, steht die Nummer nur noch da (Launch-Check, K8).
    expect(screen.getByText('RE-2026-1005')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rechnungsnummer/)).toBeNull();
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

  it('reicht bei der ALLERERSTEN Rechnung eine eigene Nummer als Wunsch weiter', async () => {
    // Der Umstieg: an den Kreis des bisherigen Programms anschliessen.
    // `rechnungen` ist hier leer — der Betrieb hat noch keine.
    const bestaetigen = await bisZurVorschau();
    const feld = screen.getByLabelText('Rechnungsnummer');
    await userEvent.clear(feld);
    await userEvent.type(feld, 'RE-2026-2000');
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(reserve).toHaveBeenCalled());
    expect(reserve.mock.calls[0][1].desired).toBe(2000);
  });

  it('lässt die Nummer nicht mehr ändern, sobald es eine Rechnung gibt (Launch-Check, K8)', async () => {
    rechnungen = [{ id: 'alt', invoiceNumber: 'RE-2026-1001' } as Invoice & { id: string }];
    const bestaetigen = await bisZurVorschau();
    expect(screen.queryByLabelText(/Rechnungsnummer/)).toBeNull();
    expect(screen.getByText(/vergibt sie beim Erstellen, lückenlos/)).toBeInTheDocument();
    await userEvent.click(bestaetigen);
    await waitFor(() => expect(reserve).toHaveBeenCalled());
    expect(reserve.mock.calls[0][1].desired).toBeUndefined();
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

  it('warnt, wenn der Zeitraum verdreht ist', async () => {
    /*
      Die Felder sind vorbelegt, aber änderbar; wer eines von Hand korrigiert,
      kann sie vertauschen. Auf der Rechnung stünde der Zeitraum dann
      rückwärts — und zurückzunehmen wäre das nur noch mit einem Storno.
    */
    await bisZurVorschau();
    const bis = await screen.findByLabelText('Leistung bis');
    fireEvent.change(bis, { target: { value: '2026-07-01' } });
    expect(await screen.findByText(/liegt vor „Leistung von"/)).toBeInTheDocument();
  });

  it('warnt NICHT bei einem eintägigen Zeitraum', async () => {
    // Von und Bis am selben Tag ist der Normalfall eines Serviceeinsatzes,
    // keine Verdrehung. Eine Warnung, die dabei erscheint, wäre täglicher
    // Lärm auf der Maske, die das Geld schreibt.
    await bisZurVorschau();
    const von = await screen.findByLabelText('Leistung von');
    const bis = await screen.findByLabelText('Leistung bis');
    fireEvent.change(bis, { target: { value: (von as HTMLInputElement).value } });
    expect(screen.queryByText(/liegt vor „Leistung von"/)).not.toBeInTheDocument();
  });

  it('warnt bei abgeschnittenem Materialstamm gegen den falschen Rat', async () => {
    /*
      Der übliche Rat lautet „im Lager gepflegt, kommt er beim nächsten Mal
      von selbst". Der wäre falsch, wenn der Katalog gar nicht vollständig
      geladen wurde — dann liegt es nicht an der Pflege, und wer ihr nachginge,
      suchte an der falschen Stelle.
    */
    scheine = [SCHEIN];
    katalog = Array.from({ length: 3 }, (_, i) =>
      ({ id: `m${i}`, companyId: 'perl', name: `Artikel ${i}` }) as Material & { id: string },
    );
    await bisZurVorschau();

    expect(await screen.findByText(/Ohne Preis im Katalog/)).toBeInTheDocument();
    expect(screen.getByText(/nur bis zur Obergrenze geladen/)).toBeInTheDocument();
  });

  it('warnt NICHT, solange der Materialstamm vollständig ist', async () => {
    scheine = [SCHEIN];
    katalog = [];
    await bisZurVorschau();

    expect(await screen.findByText(/Ohne Preis im Katalog/)).toBeInTheDocument();
    expect(screen.queryByText(/nur bis zur Obergrenze geladen/)).not.toBeInTheDocument();
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

/**
 * Mahnwesen.
 *
 * WAS ES VORHER GAB: den Status „Überfällig". Er wurde beim Öffnen der
 * Ansicht gesetzt und angezeigt — mehr nicht. Der Betrieb sah, dass Geld
 * aussteht, und führte das Mahnen selbst im Kopf.
 */
describe('Eine überfällige Rechnung mahnen', () => {
  const UEBERFAELLIG = {
    id: 'r1',
    invoiceNumber: 'RE-2026-0009',
    projectNumber: '2026-042',
    customerName: 'Baumeister Gruber',
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-15',
    address: 'Bergweg 3',
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Offen',
  } as unknown as Invoice & { id: string };

  async function menue(nummer = 'RE-2026-0009') {
    zeige();
    // `findAll`, weil eine mahnbare Rechnung seit dem Mahnlauf ZWEIMAL auf
    // dem Schirm steht: oben in der Mahnliste und unten im Bestand.
    await screen.findAllByText(new RegExp(nummer));
    await userEvent.click(
      await screen.findByRole('button', { name: new RegExp(`Weitere Aktionen für Rechnung ${nummer}`) }),
    );
  }

  it('bietet die Zahlungserinnerung an', async () => {
    rechnungen = [UEBERFAELLIG];
    await menue();
    expect(
      await screen.findByRole('menuitem', { name: 'Zahlungserinnerung erzeugen' }),
    ).toBeInTheDocument();
  });

  it('bietet sie NICHT an, solange das Zahlungsziel läuft', async () => {
    // Wer am letzten Tag zahlt, zahlt pünktlich. Ein Menüpunkt, der bei jedem
    // Klick erklärt, warum er nicht geht, ist eine Sackgasse mit Beschriftung.
    rechnungen = [{ ...UEBERFAELLIG, dueDate: '2026-12-31' }];
    await menue();
    expect(screen.queryByRole('menuitem', { name: /erzeugen/ })).not.toBeInTheDocument();
  });

  it('bietet sie bei einer bezahlten Rechnung nicht an', async () => {
    rechnungen = [{ ...UEBERFAELLIG, paymentStatus: 'Bezahlt' }];
    await menue();
    expect(screen.queryByRole('menuitem', { name: /erzeugen/ })).not.toBeInTheDocument();
  });

  it('geht nach der dritten Stufe nicht weiter', async () => {
    // Was dann folgt, entscheidet ein Mensch mit einem Anwalt oder einem
    // Inkassobüro.
    rechnungen = [{ ...UEBERFAELLIG, mahnstufe: 3 }];
    await menue();
    expect(screen.queryByRole('menuitem', { name: /erzeugen/ })).not.toBeInTheDocument();
  });

  it('nennt beim zweiten Mal die nächste Stufe', async () => {
    rechnungen = [{ ...UEBERFAELLIG, mahnstufe: 1 }];
    await menue();
    expect(await screen.findByRole('menuitem', { name: 'Mahnung erzeugen' })).toBeInTheDocument();
  });

  it('erzeugt den Beleg und hält die Mahnung danach fest', async () => {
    /*
      IN DIESER REIHENFOLGE. Scheitert das PDF, ist schlimmstenfalls nichts
      geschehen — umgekehrt stünde die Rechnung als gemahnt da, ohne dass je
      ein Schreiben entstanden wäre, und die nächste Stufe begänne bei zwei.
    */
    rechnungen = [UEBERFAELLIG];
    await menue();
    await userEvent.click(await screen.findByRole('menuitem', { name: /erzeugen/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Erzeugen' }));

    await waitFor(() => expect(mahnung).toHaveBeenCalled());
    // DIE REIHENFOLGE ist die Zusicherung, nicht das blosse Geschehen.
    expect(mahnFolge).toEqual(['pdf', 'vermerk']);
    // Über denselben Weg wie der Handwerksschein — auf dem Tablet ein Teilen.
    expect(teilen).toHaveBeenCalled();
    expect(mahnung.mock.calls[0][1]).toMatchObject({ stufe: 1 });
  });

  it('hält NICHTS fest, wenn der Beleg scheitert', async () => {
    /*
      Der Fall, für den die Reihenfolge da ist. Stünde der Vermerk zuerst,
      wäre die Rechnung als gemahnt vermerkt, ohne dass je ein Schreiben
      entstanden ist — und die nächste Stufe begänne bei zwei, für eine
      Mahnung, die der Kunde nie bekommen hat.
    */
    rechnungen = [UEBERFAELLIG];
    mahnungPdf.mockRejectedValueOnce(new Error('Invalid argument passed to jsPDF.text'));
    await menue();
    await userEvent.click(await screen.findByRole('menuitem', { name: /erzeugen/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Erzeugen' }));

    expect(await screen.findByText(/konnte nicht erzeugt werden/)).toBeInTheDocument();
    expect(mahnung).not.toHaveBeenCalled();
  });

  it('schlägt eine Frist vor, die sich ändern lässt', async () => {
    // Eine Woche ist der Vorschlag, nicht die Regel: bei einem Stammkunden
    // vor dem Urlaub sind zwei angemessen.
    rechnungen = [UEBERFAELLIG];
    await menue();
    await userEvent.click(await screen.findByRole('menuitem', { name: /erzeugen/ }));

    const frist = await screen.findByLabelText('Neue Frist');
    expect(frist).toHaveValue('2026-09-08'); // heute + 7 (Systemzeit: 01.09.)
    await userEvent.clear(frist);
    await userEvent.type(frist, '2026-09-30');
    await userEvent.click(screen.getByRole('button', { name: 'Erzeugen' }));

    await waitFor(() => expect(mahnung).toHaveBeenCalled());
    expect(mahnung.mock.calls[0][1]).toMatchObject({ frist: '2026-09-30' });
  });

  it('zeigt in der Liste, was schon gemahnt wurde', async () => {
    /*
      Ohne diese Angabe führt der Betrieb den Mahnstand weiterhin im Kopf —
      und genau das war der Zustand vorher. Zwei Erinnerungen an denselben
      Kunden in einer Woche sind peinlicher als gar keine.
    */
    rechnungen = [
      { ...UEBERFAELLIG, mahnstufe: 2, gemahntAm: '2026-08-30', mahnfrist: '2026-09-06' },
    ];
    zeige();
    expect(await screen.findByText(/Mahnung am 30\.08\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/Frist 06\.09\.2026/)).toBeInTheDocument();
  });

  it('zeigt die Mahnung einer bezahlten Rechnung als Geschichte — ohne Frist, ohne Warnfarbe', async () => {
    // Prüflauf 24.09.2026, F14.
    rechnungen = [
      {
        ...UEBERFAELLIG, paymentStatus: 'Bezahlt', mahnstufe: 2, gemahntAm: '2026-08-30',
        mahnfrist: '2026-09-06',
      },
    ];
    zeige();
    const zeile = await screen.findByText(/Mahnung am 30\.08\.2026/);
    expect(zeile).not.toHaveClass('text-warning');
    expect(screen.queryByText(/Frist 06\.09\.2026/)).not.toBeInTheDocument();
  });
});

/**
 * DAS LÖSCHEN EINER RECHNUNG GIBT ES NICHT MEHR.
 *
 * Es stand im Zeilenmenü einer stornierten Rechnung, direkt unter „Storno
 * aufheben", und zwar OHNE Rückfrage — ein Fehlgriff im Menü, und der Beleg
 * war weg. Elf andere Löschwege der App fragen nach; ausgerechnet der für das
 * Finanzamt tat es nicht.
 *
 * Ersatzlos gestrichen statt mit einer Rückfrage versehen: § 132 BAO verlangt
 * sieben Jahre Aufbewahrung, und die gezogene Nummer hinterliesse eine Lücke
 * im Kreis, die der Buchhaltungs-Export danach zu Recht meldet — ohne dass
 * noch jemand wüsste, warum. Die Rules sagen dasselbe.
 */
describe('Eine stornierte Rechnung', () => {
  const STORNIERT = {
    id: 'rs',
    companyId: 'perl',
    invoiceNumber: 'RE-2026-0011',
    projectNumber: '2026-001',
    customerName: 'Familie Huber',
    invoiceDate: '2026-08-01',
    dueDate: '2026-08-15',
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Storniert',
    cancellationNote: 'Falsche Baustelle verrechnet',
  } as unknown as Invoice & { id: string };

  async function menueStorno() {
    rechnungen = [STORNIERT];
    zeige();
    await screen.findByText(/RE-2026-0011/);
    await userEvent.click(
      await screen.findByRole('button', {
        name: /Weitere Aktionen für Rechnung RE-2026-0011/,
      }),
    );
  }

  it('bietet kein Löschen an', async () => {
    await menueStorno();
    expect(screen.queryByRole('menuitem', { name: /löschen/i })).not.toBeInTheDocument();
  });

  it('lässt sich am Tag des Stornos wieder aufheben — nach Rückfrage', async () => {
    // Der Storno ist die Korrektur, nicht das Löschen — und ein Fehlgriff
    // lässt sich am selben Tag zurücknehmen. Die Uhr steht auf 01.09. 09:00.
    STORNIERT.cancelledAt = new Date(2026, 8, 1, 8, 0).getTime();
    await menueStorno();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Storno aufheben' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/nur heute, am Tag des Stornos/);
  });

  it('ab dem Folgetag nicht mehr — dann steht er in der Buchhaltung (Launch-Check, K9)', async () => {
    STORNIERT.cancelledAt = new Date(2026, 7, 31, 16, 0).getTime();
    await menueStorno();
    await screen.findByRole('menuitem', { name: /Zahlung erfassen/ });
    expect(screen.queryByRole('menuitem', { name: 'Storno aufheben' })).not.toBeInTheDocument();
  });
});

/**
 * DIE UID DES KUNDEN AUF EINER GANZ GEWÖHNLICHEN RECHNUNG.
 *
 * GEFUNDEN BEI EINER DURCHSICHT: Die App lud die UID aus dem Kundenstamm,
 * zeigte sie im Formular — und warf sie beim Speichern weg, sobald der
 * Reverse-Charge-Haken aus war (`customerVatId: reverseCharge ? … : ''`).
 *
 * Über 10.000 € brutto an ein Unternehmen ist sie Pflichtangabe nach
 * § 11 Abs 1 Z 2 UStG. Fehlt sie, trifft es nicht den Aussteller, sondern den
 * KUNDEN: ihm steht der Vorsteuerabzug erst zu, wenn sämtliche Merkmale
 * vorliegen. Bei 12.000 € sind das rund 2.000 €, die bei ihm hängenbleiben,
 * bis jemand berichtigt.
 */
describe('Die UID des Kunden ohne Reverse Charge', () => {
  it('wandert in die Rechnung, auch wenn der Haken aus ist', async () => {
    kunden = [{ name: 'Familie Huber', vatId: 'ATU55556666' }];
    await bisZurVorschau();

    // Kein Haken — eine ganz gewöhnliche Rechnung mit 20 % Umsatzsteuer.
    expect(screen.getByRole('checkbox', { name: /Bauleistung/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /Rechnung erstellen/ }));

    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect(lege.mock.calls[0][0]).toMatchObject({
      reverseCharge: false,
      customerVatId: 'ATU55556666',
    });
  });

  it('steht als Feld da, ohne dass jemand etwas anhaken muss', async () => {
    // Vorher tauchte es erst unter dem Reverse-Charge-Haken auf — also genau
    // dort, wo es bei einer gewöhnlichen Rechnung niemand sucht.
    kunden = [{ name: 'Familie Huber', vatId: 'ATU55556666' }];
    await bisZurVorschau();
    expect(screen.getByLabelText(/UID-Nummer des Kunden/)).toHaveValue('ATU55556666');
  });

  it('sagt bei kleinen Beträgen, dass das Feld leer bleiben darf', async () => {
    /*
      Acht Stunden Facharbeit sind weit unter der Grenze. Eine Pflichtmeldung
      an dieser Stelle wäre Lärm — und Lärm nimmt der einen Meldung die
      Wirkung, auf die es ankommt.
    */
    await bisZurVorschau();
    expect(screen.getByText(/Bei Privatkunden bleibt das Feld leer/)).toBeInTheDocument();
    expect(screen.queryByText(/§ 11 Abs 1 Z 2 UStG/)).not.toBeInTheDocument();
  });
});

describe('Über der 10.000-Euro-Grenze', () => {
  /**
   * 20 Tage à 8 Stunden Facharbeit: 160 h × 65 € = 10.400 € netto, mit 20 %
   * Umsatzsteuer 12.480 € brutto. Damit ist die Empfänger-UID Pflichtangabe.
   */
  const GROSSAUFTRAG = Array.from({ length: 20 }, (_, i) => ({
    ...ZEIT,
    id: `z-gross-${i}`,
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  }));

  it('meldet die fehlende UID mit Bestimmung und Folge', async () => {
    zeiten = GROSSAUFTRAG;
    await bisZurVorschau();

    const meldung = await screen.findByRole('alert');
    expect(meldung.textContent).toContain('§ 11 Abs 1 Z 2 UStG');
    expect(meldung.textContent).toContain('Vorsteuerabzug');
  });

  it('schweigt, sobald die UID aus dem Kundenstamm dasteht', async () => {
    zeiten = GROSSAUFTRAG;
    kunden = [{ name: 'Familie Huber', vatId: 'ATU55556666' }];
    await bisZurVorschau();

    expect(screen.queryByText(/§ 11 Abs 1 Z 2 UStG/)).not.toBeInTheDocument();
  });

  it('sperrt die Rechnung NICHT — die App weiss nicht, wer Unternehmer ist', async () => {
    /*
      Eine Rechnung über 12.000 € an eine Privatperson ist vollkommen in
      Ordnung und braucht keine Empfänger-UID. Ob der Empfänger Unternehmer
      ist, steht in keinem Datenfeld. Deshalb wird gewarnt und nicht gesperrt
      — anders als bei Reverse Charge, wo die UID den Übergang der
      Steuerschuld belegt und ohne sie gar nichts geht.
    */
    zeiten = GROSSAUFTRAG;
    await bisZurVorschau();
    expect(screen.getByRole('button', { name: /Rechnung erstellen/ })).toBeEnabled();
  });
});

/**
 * Der Mahnlauf.
 *
 * Das Mahnen gab es schon — als Menüpunkt an der einzelnen Rechnung. Die
 * Stufen stimmten, die Belege stimmten, nur kam niemand dorthin: wer wissen
 * wollte, was zu mahnen ist, filterte auf „Überfällig", ging die Liste durch,
 * öffnete an jeder Zeile das Menü und prüfte im Kopf, ob die dritte Mahnung
 * schon draussen war.
 *
 * Genau daran bleibt Mahnwesen in kleinen Betrieben liegen — nicht am
 * Schreiben, sondern am Zusammenstellen, das sich immer verschieben lässt.
 */
describe('Der Mahnlauf', () => {
  /*
    GESETZT WIRD `offene`, NICHT `rechnungen` — und das ist der Punkt der
    Änderung vom 08.09.2026. Der Lauf rechnete vorher über die geladene
    Arbeitsliste, und die schneidet nach Anlagedatum ab: damit sah er
    ausgerechnet die Forderungen NICHT, die am längsten offen sind.
  */
  const offen = (
    id: string,
    p: Partial<Invoice> = {},
  ): Invoice & { id: string } =>
    ({
      id,
      invoiceNumber: `RE-2026-${id}`,
      projectNumber: '2026-042',
      customerName: `Kunde ${id}`,
      invoiceDate: '2026-07-01',
      dueDate: '2026-08-01',
      totalNetto: 1000,
      totalVat: 200,
      totalBrutto: 1200,
      vatRate: 0.2,
      paymentStatus: 'Offen',
      ...p,
    }) as unknown as Invoice & { id: string };

  it('steht gar nicht da, wenn nichts offen ist', async () => {
    // Eine dauerhaft sichtbare leere Mahnliste wäre ein Vorwurf ohne Anlass.
    // Die bezahlte Rechnung steht in der Arbeitsliste, nicht bei den offenen.
    rechnungen = [offen('0001', { paymentStatus: 'Bezahlt' })];
    zeige();
    await screen.findByText(/RE-2026-0001/);
    expect(screen.queryByText(/^Mahnlauf/)).not.toBeInTheDocument();
  });

  it('zählt zusammen, was zu mahnen ist, und nennt die Summe', async () => {
    offene = [offen('0001'), offen('0002', { totalBrutto: 300 })];
    zeige();

    const karte = await karteMitZahl(/^Mahnlauf/, 2);
    // Trennzeichen raus: de-AT setzt hier je nach Umgebung Punkt oder ein
    // geschütztes Leerzeichen, und darum geht es hier nicht.
    expect(karte.textContent?.replace(/[\s\u00A0.]/g, '')).toContain('1500,00');
  });

  /*
    DIE REIHENFOLGE IST DIE AUSSAGE, und sie ist nicht die der Rechnungsliste
    darunter: eine Forderung vor der letzten Mahnung ist dringender als eine,
    die gerade erst die Frist überschritten hat.
  */
  it('stellt die weit fortgeschrittene Forderung nach oben', async () => {
    offene = [
      offen('0001', { dueDate: '2026-01-01' }),
      offen('0002', { mahnstufe: 2, dueDate: '2026-08-28' }),
    ];
    zeige();

    const karte = (await screen.findByText(/^Mahnlauf/)).closest('section')!;
    const zeilen = within(karte).getAllByText(/RE-2026-000/);
    expect(zeilen[0].textContent).toContain('RE-2026-0002');
  });

  it('mahnt aus der Liste heraus — mit der richtigen Stufe', async () => {
    offene = [offen('0001', { mahnstufe: 1 })];
    zeige();

    const karte = (await screen.findByText(/^Mahnlauf/)).closest('section')!;
    await userEvent.click(within(karte).getByRole('button', { name: 'Mahnen' }));
    // Der bestehende Dialog, mit der zweiten Stufe im Titel.
    expect(await screen.findByText(/Mahnung — Kunde 0001/)).toBeInTheDocument();
  });

  /*
    NACH DER DRITTEN MAHNUNG HÖRT DIE APP AUF. Fielen diese Rechnungen
    stillschweigend aus dem Lauf, wären ausgerechnet die ältesten Forderungen
    die unsichtbarsten.
  */
  it('nennt die ausgereizten Forderungen, statt sie zu verschlucken', async () => {
    offene = [offen('0001', { mahnstufe: 3 })];
    zeige();

    expect(await screen.findByText(/braucht eine Entscheidung/)).toBeInTheDocument();
    expect(screen.getByText(/RE-2026-0001 \(Kunde 0001\)/)).toBeInTheDocument();
  });

  it('führt eine bezahlte dritte Mahnung nicht als offene Entscheidung', async () => {
    /*
      Seit der Lauf über `listUnpaidInvoices` geht, kann eine bezahlte
      Rechnung ihn gar nicht mehr erreichen — die Abfrage filtert sie am
      Server weg. Der Test prüft jetzt genau das: sie steht in der
      Arbeitsliste und trotzdem nirgends unter „braucht eine Entscheidung".
      Dass `mahnlauf()` sie auch für sich genommen aussortiert, hält der
      Rechen-Test in `tests/unit/mahnlauf.test.ts` fest.
    */
    rechnungen = [offen('0001', { mahnstufe: 3, paymentStatus: 'Bezahlt' })];
    zeige();
    await screen.findByText(/RE-2026-0001/);
    expect(screen.queryByText(/braucht eine Entscheidung/)).not.toBeInTheDocument();
  });

  /*
    DER FALL, DER VORHER DURCHFIEL. Eine Forderung von vor zwei Jahren steht
    längst nicht mehr in den fünfzig jüngsten Rechnungen — und war damit im
    Mahnlauf unsichtbar. Ausgerechnet die älteste.
  */
  it('sieht eine alte Forderung, die in der Arbeitsliste gar nicht mehr steht', async () => {
    rechnungen = [];
    offene = [offen('0001', { dueDate: '2024-03-01' })];
    zeige();
    await karteZaehlt(/^Mahnlauf/, 1);
  });
});

/**
 * Nicht verrechnete Leistung.
 *
 * DIE LETZTE OFFENE STELLE IM KREIS. Die Rechnung merkt sich seit jeher,
 * welche Scheine sie verbraucht hat — gelesen wurde das nur, um beim
 * Zusammenstellen nichts doppelt zu verrechnen. Die Umkehrung fehlte, und sie
 * ist die betrieblich wichtigere: das ist kein Buchhaltungsfehler, den man
 * später sieht, sondern Geld, das nie eingefordert wird.
 */
describe('Nicht verrechnete Leistung', () => {
  const schein = (
    id: string,
    datum: string,
    p: Partial<WorkSheet> = {},
  ): WorkSheet & { id: string } =>
    ({
      id,
      companyId: 'perl',
      projectNumber: '2026-042',
      customerName: 'Baumeister Gruber',
      datum,
      status: 'Unterschrieben',
      abrechnung: 'Regie',
      zeiten: [],
      material: [],
      erstelltVonUid: 'm1',
      erstelltVonName: 'Max',
      ...p,
    }) as WorkSheet & { id: string };

  it('meldet einen alten Schein ohne Rechnung', async () => {
    // „Heute" steht in dieser Datei auf dem 01.09.2026.
    alleScheine = [schein('s1', '2026-06-01')];
    zeige();

    await karteZaehlt(/^Nicht verrechnete Leistung/, 1);
    expect(screen.getByText(/92 Tage/)).toBeInTheDocument();
  });

  /*
    EIN SCHEIN VON VORGESTERN GEHÖRT NICHT GEMELDET. Zwischen Einsatz und
    Rechnung liegt im Handwerk regelmässig ein Monatsabschluss — eine Liste,
    die das anmahnt, sieht sich nach zwei Wochen niemand mehr an, und dann
    fällt auch der echte Fall nicht mehr auf.
  */
  it('schweigt bei frischer Leistung', async () => {
    alleScheine = [schein('s1', '2026-08-30')];
    zeige();
    await waitFor(() => expect(listRecentWorkSheets).toHaveBeenCalled());
    expect(screen.queryByText(/^Nicht verrechnete Leistung/)).not.toBeInTheDocument();
  });

  it('schweigt, sobald eine Rechnung den Schein trägt', async () => {
    alleScheine = [schein('s1', '2026-06-01')];
    rechnungen = [
      {
        id: 'r1',
        invoiceNumber: 'RE-2026-0001',
        projectNumber: '2026-042',
        customerName: 'Baumeister Gruber',
        totalBrutto: 1200,
        paymentStatus: 'Bezahlt',
        linkedWorkSheets: ['s1'],
      } as unknown as Invoice & { id: string },
    ];
    zeige();
    await waitFor(() => expect(listRecentWorkSheets).toHaveBeenCalled());
    expect(screen.queryByText(/^Nicht verrechnete Leistung/)).not.toBeInTheDocument();
  });

  /*
    DER KERN, und er ist leicht zu übersehen: wer eine Rechnung STORNIERT,
    nimmt die Forderung zurück — die Leistung steht dann wieder offen.
    Zählte der Storno als Verrechnung, verschwände genau die Arbeit aus der
    Liste, die am ehesten vergessen wird.
  */
  it('holt den Schein einer stornierten Rechnung zurück', async () => {
    alleScheine = [schein('s1', '2026-06-01')];
    rechnungen = [
      {
        id: 'r1',
        invoiceNumber: 'RE-2026-0001',
        projectNumber: '2026-042',
        customerName: 'Baumeister Gruber',
        totalBrutto: 1200,
        paymentStatus: 'Storniert',
        linkedWorkSheets: ['s1'],
      } as unknown as Invoice & { id: string },
    ];
    zeige();
    await karteZaehlt(/^Nicht verrechnete Leistung/, 1);
  });

  it('führt Entwürfe gar nicht — sie sind noch keine Leistung', async () => {
    alleScheine = [schein('s1', '2026-06-01', { status: 'Entwurf' })];
    zeige();
    await waitFor(() => expect(listRecentWorkSheets).toHaveBeenCalled());
    expect(screen.queryByText(/^Nicht verrechnete Leistung/)).not.toBeInTheDocument();
  });

  it('wählt die Baustelle aus, statt sie abtippen zu lassen', async () => {
    // Von Hand abzutippen war genau die Reibung, die dazu führt, dass es
    // liegen bleibt.
    alleScheine = [schein('s1', '2026-06-01')];
    zeige();
    await screen.findByText(/^Nicht verrechnete Leistung/);

    await userEvent.click(screen.getByRole('button', { name: 'Baustelle wählen' }));
    const auswahl = await screen.findByRole<HTMLSelectElement>('combobox', { name: /Baustelle/ });
    expect(auswahl.value).toBe('2026-042');
  });
});

/**
 * Der Buchhaltungs-Export.
 *
 * ER RECHNETE ÜBER DIE GELADENE ARBEITSLISTE. Die reicht voreingestellt
 * fünfzig Rechnungen zurück; ein Export für einen älteren Monat lieferte
 * damit eine LEERE Datei — und zwar eine, die wie ein erfolgreicher Export
 * aussah: „0 Rechnungen", keine Lücken, Knopf grau.
 *
 * Schlimmer war die Lückenprüfung im Nummernkreis: sie meldete Lücken, die
 * keine sind, weil die fehlenden Nummern schlicht nicht geladen waren. Ein
 * Befund, den es nicht gibt, kostet in einer Kanzlei einen halben Tag.
 */
describe('Der Buchhaltungs-Export', () => {
  const journal = (nr: string, datum: string): Invoice & { id: string } =>
    ({
      id: nr,
      invoiceNumber: `RE-2026-${nr}`,
      projectNumber: '2026-042',
      customerName: 'Baumeister Gruber',
      invoiceDate: datum,
      dueDate: datum,
      totalNetto: 1000,
      totalVat: 200,
      totalBrutto: 1200,
      vatRate: 0.2,
      paymentStatus: 'Bezahlt',
    }) as unknown as Invoice & { id: string };

  /*
    DER BUCHUNGSSTAPEL STEHT NEBEN DEM JOURNAL.

    Das Journal BESCHREIBT Rechnungen, der Stapel BUCHT sie. Der Unterschied
    ist die ganze Gefahr: eine falsch kontierte Zeile importiert sich
    fehlerfrei und fällt frühestens beim Jahresabschluss auf. Deshalb gibt es
    ihn nur, wenn der Betrieb seinen Kontenrahmen hinterlegt hat — und
    deshalb gibt es ihn GAR NICHT, solange daran etwas fehlt.
  */
  const KONTEN = [
    { zweck: 'debitoren', konto: '2000' },
    { zweck: 'erloes', ustSatz: 0.2, konto: '4000', steuercode: 'M20' },
  ];

  it('bietet ohne hinterlegten Kontenrahmen keinen Buchungsstapel an', async () => {
    // Das Journal bleibt davon unberührt: ein Betrieb ohne Kontenrahmen soll
    // es weiter bekommen, als wäre nichts gewesen.
    konten = [];
    imZeitraum = [journal('0001', '2026-09-01')];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Zeitraum zusammenstellen' }));

    expect(await screen.findByRole('button', { name: 'Als CSV herunterladen' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Buchungsstapel/ })).toBeNull();
  });

  it('bietet ihn an, sobald die Konten stehen', async () => {
    konten = KONTEN;
    imZeitraum = [journal('0001', '2026-09-01')];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Zeitraum zusammenstellen' }));
    expect(await screen.findByRole('button', { name: /Buchungsstapel für BMD/ })).toBeEnabled();
  });

  it('sperrt ihn und sagt, WELCHES Konto fehlt', async () => {
    /*
      Ein Stapel mit Lücken importiert sich fehlerfrei und bucht einen zu
      niedrigen Umsatz — niemand sucht danach, weil der Import ja geklappt
      hat. Ein gesperrter Knopf mit Klartext ist die einzige richtige Antwort.
    */
    konten = [{ zweck: 'debitoren', konto: '2000' }];
    imZeitraum = [journal('0001', '2026-09-01')];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Zeitraum zusammenstellen' }));

    expect(await screen.findByRole('button', { name: /Buchungsstapel für BMD/ })).toBeDisabled();
    expect(screen.getByText(/Erlöskonto für 20 % Umsatzsteuer/)).toBeInTheDocument();
  });

  it('rechnet nicht über die Liste, sondern holt den Zeitraum', async () => {
    // Die Arbeitsliste ist LEER — und das Journal trotzdem vollständig.
    rechnungen = [];
    imZeitraum = [journal('0001', '2026-09-01'), journal('0002', '2026-09-02')];
    zeige();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Zeitraum zusammenstellen' }),
    );
    expect(await screen.findByText(/2 Rechnungen/)).toBeInTheDocument();
    expect(listInvoicesInRange).toHaveBeenCalled();
  });

  /*
    NULL IST EINE AUSSAGE, KEINE PANNE — aber nur, wenn dabeisteht, dass
    wirklich nachgesehen wurde. Genau daran fehlte es: eine leere Ausgabe sah
    aus wie ein leerer Monat.
  */
  it('sagt bei null Rechnungen, dass im ganzen Bestand nachgesehen wurde', async () => {
    imZeitraum = [];
    zeige();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Zeitraum zusammenstellen' }),
    );
    expect(await screen.findByText(/im gesamten Bestand/)).toBeInTheDocument();
  });

  it('zeigt vor dem Zusammenstellen gar keine Zahl', async () => {
    // Sonst stünde dort eine Auskunft über einen Zeitraum, den niemand
    // abgefragt hat — die gefährlichste Anzeige von allen.
    imZeitraum = [journal('0001', '2026-09-01')];
    zeige();
    await screen.findByRole('button', { name: 'Zeitraum zusammenstellen' });
    expect(screen.queryByText(/Rechnung · Netto|Rechnungen · Netto/)).not.toBeInTheDocument();
  });

  it('verwirft das Ergebnis, sobald der Zeitraum geändert wird', async () => {
    imZeitraum = [journal('0001', '2026-09-01')];
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Zeitraum zusammenstellen' }));
    await screen.findByText(/1 Rechnung/);

    await nutzer.clear(screen.getByLabelText('Von'));
    await waitFor(() => expect(screen.queryByText(/1 Rechnung/)).not.toBeInTheDocument());
  });

  it('sagt es, wenn der Zeitraum nicht geladen werden konnte', async () => {
    // Ohne ihn wäre das Journal unvollständig — und ein unvollständiges
    // Journal, das wie ein vollständiges aussieht, ist der ganze Fehler.
    listInvoicesInRange.mockRejectedValueOnce(new Error('offline'));
    zeige();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Zeitraum zusammenstellen' }),
    );
    expect(await screen.findByText(/Journal unvollständig/)).toBeInTheDocument();
  });
});

/**
 * Was verrechnet wird, gegen das, was der Kunde unterschrieben hat.
 *
 * Die Rechnung nimmt alle unverrechneten Stunden der Baustelle; der Kunde hat
 * einen Schein über die Zeit BEI IHM in der Hand — ohne Anfahrt, ohne
 * Vorbereitung in der Werkstatt. Beides darf auseinandergehen, und zwar zu
 * Recht. Nur sagte es niemandem, wenn die Rechnung deutlich darüber liegt,
 * und die Reklamation kommt erst, wenn sie schon draussen ist.
 */
describe('Rechnung gegen Schein', () => {
  const mitZeiten = (minuten: number[]): WorkSheet & { id: string } =>
    ({
      id: 'sa1',
      companyId: 'perl',
      projectNumber: '2026-042',
      customerName: 'Baumeister Gruber',
      datum: '2026-08-20',
      status: 'Unterschrieben',
      abrechnung: 'Regie',
      zeiten: minuten.map((m) => ({ datum: '2026-08-20', mitarbeiter: 'Max', minuten: m })),
      material: [],
      erstelltVonUid: 'm1',
      erstelltVonName: 'Max',
    }) as WorkSheet & { id: string };

  it('stellt bestätigte und verrechnete Stunden nebeneinander', async () => {
    // Der Zeiteintrag ergibt 8 h; der Schein bestätigt 7 h — knapp darunter,
    // also kein Befund, aber die Zahl gehört trotzdem vor Augen.
    alleScheine = [mitZeiten([420])];
    await bisZurVorschau();

    expect(screen.getByText(/Ein Schein bestätigt/)).toBeInTheDocument();
    expect(screen.getByText(/07:00/)).toBeInTheDocument();
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
  });

  /*
    DER FALL, UM DEN ES GEHT: doppelt so viel verrechnet wie unterschrieben.
    Das kann stimmen — Vorfertigung zählt auf die Baustelle —, aber der Kunde
    wird danach fragen, und besser jetzt als nach dem Versand.
  */
  it('warnt, wenn deutlich mehr verrechnet wird als bestätigt', async () => {
    alleScheine = [mitZeiten([240])];
    await bisZurVorschau();

    expect(
      screen.getByText(/mehr, als der Kunde unterschrieben hat/),
    ).toBeInTheDocument();
  });

  /*
    DIE GEGENRICHTUNG, gefunden beim Probelauf: der Kunde hat sechzehn Stunden
    unterschrieben, gebucht sind erst acht. Die Rechnung ginge mit der Hälfte
    hinaus — und der Abgleich stand bisher in Grau darüber.
  */
  it('warnt, wenn deutlich weniger verrechnet wird als auf offenen Scheinen steht', async () => {
    alleScheine = [mitZeiten([960])];
    await bisZurVorschau();

    expect(
      screen.getByText(/weniger, als auf noch nicht verrechneten Scheinen unterschrieben ist/),
    ).toBeInTheDocument();
  });

  /*
    JE PERSON, TAG UND SATZ — Prüflauf 24.09.2026, F5. Die Summe stimmt
    (8 h bestätigt, 8 h verrechnet), aber die acht Stunden auf dem Schein
    sind Manfreds vom 21., und verrechnet werden Max' vom 20.
  */
  it('nennt unterschriebene Stunden, die trotz gleicher Summe fehlen', async () => {
    alleScheine = [
      {
        ...mitZeiten([]),
        datum: '2026-08-21',
        zeiten: [{ datum: '2026-08-21', mitarbeiter: 'Manfred Monteur', minuten: 480 }],
      },
    ];
    await bisZurVorschau();

    expect(screen.getByText(/aber nicht jede unterschriebene Stunde steht darauf/)).toBeInTheDocument();
    expect(screen.getByText(/21\.08\. · Manfred Monteur · Facharbeiter: unterschrieben/)).toBeInTheDocument();
    expect(screen.queryByText(/mehr, als der Kunde unterschrieben hat/)).not.toBeInTheDocument();
  });

  it('schweigt, wenn der Schein schon auf einer Rechnung steht', async () => {
    // Folgerechnung: die sechzehn Stunden sind verrechnet, der Schein steht
    // auf der ersten Rechnung. Sonst schlüge jede zweite Rechnung Alarm.
    alleScheine = [mitZeiten([960])];
    offene = [
      {
        id: 'r0', companyId: 'perl', invoiceNumber: 'RE-2026-0001', projectNumber: '2026-042',
        customerName: 'Baumeister Gruber', paymentStatus: 'Offen', linkedWorkSheets: ['sa1'],
        totalNetto: 100, totalVat: 20, totalBrutto: 120, invoiceDate: '2026-08-25',
        dueDate: '2026-09-08',
      } as unknown as Invoice & { id: string },
    ];
    await bisZurVorschau();

    expect(screen.getByText(/Ein Schein bestätigt/)).toBeInTheDocument();
    expect(screen.queryByText(/weniger, als auf noch nicht verrechneten/)).not.toBeInTheDocument();
  });

  /*
    OHNE SCHEIN GIBT ES NICHTS ZU VERGLEICHEN. „Sie verrechnen 8 Stunden,
    bestätigt sind 0" stünde sonst bei jeder Baustelle ohne Schein da.
  */
  it('sagt gar nichts, wenn es keinen unterschriebenen Schein gibt', async () => {
    alleScheine = [];
    await bisZurVorschau();

    // Beide Wortformen: bei null Scheinen hiesse es „0 Scheine bestätigen",
    // und ein Test nur auf „bestätigt" ginge daran vorbei.
    expect(
      screen.queryByText(/Schein bestätigt|Scheine bestätigen/),
    ).not.toBeInTheDocument();
  });

  it('kappt die Rechnung nicht auf die Scheinstunden', async () => {
    // Die Warnung ist ein Hinweis, keine Grenze: geleistete Arbeit zu
    // verschenken wäre der teurere Fehler.
    alleScheine = [mitZeiten([240])];
    const bestaetigen = await bisZurVorschau();
    expect(bestaetigen).toBeInTheDocument();
    // 8 h stehen weiterhin in der Vorschau, nicht 4 h.
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
  });
});

/**
 * Scheitert die Forderungsabfrage, darf keine Karte so tun, als wüsste sie es.
 *
 * `listUnpaidInvoices` trägt ZWEI Karten, und beide sagten bei einem
 * Fehlschlag etwas Falsches statt gar nichts:
 *
 *   Mahnlauf              rechnete über eine leere Liste und verschwand — das
 *                         sieht aus wie „nichts zu mahnen", ist aber „ich
 *                         weiss es nicht". Der Unterschied sind offene
 *                         Forderungen, die niemand anmahnt.
 *
 *   Nicht verrechnete     sucht Scheine, die auf KEINER Rechnung stehen.
 *   Leistung              Fehlen die offenen Forderungen, erscheinen Scheine
 *                         als unverrechnet, die längst auf einer offenen
 *                         Rechnung stehen — eine falsche Anschuldigung.
 */
describe('Wenn die offenen Forderungen nicht kommen', () => {
  const alt = (tage: number) =>
    new Date(Date.now() - tage * 86_400_000).toISOString().slice(0, 10);

  it('sagt es, statt zu schweigen', async () => {
    listUnpaidInvoices.mockRejectedValueOnce(new Error('kein Netz'));
    zeige();
    expect(
      await screen.findByText(/offenen Forderungen konnten nicht geladen werden/),
    ).toBeInTheDocument();
  });

  /*
    UND ZIEHT BEIDE KARTEN EIN. Eine Karte, die auf unvollständiger Grundlage
    rechnet, ist schlimmer als keine — sie wird geglaubt.
  */
  it('meldet keine unverrechnete Leistung auf halber Grundlage', async () => {
    // Ein alter Schein, der bei geglückter Abfrage als unverrechnet gälte.
    alleScheine = [
      {
        id: 'alt', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Baumeister Gruber', datum: alt(90), status: 'Unterschrieben',
        abrechnung: 'Regie', zeiten: [], material: [],
        erstelltVonUid: 'm1', erstelltVonName: 'Max',
      } as WorkSheet & { id: string },
    ];
    listUnpaidInvoices.mockRejectedValueOnce(new Error('kein Netz'));
    zeige();

    await screen.findByText(/offenen Forderungen konnten nicht geladen werden/);
    expect(screen.queryByText(/Nicht verrechnete Leistung/)).not.toBeInTheDocument();
  });

  it('zeigt beide Karten wieder, sobald die Abfrage durchgeht', async () => {
    alleScheine = [
      {
        id: 'alt', companyId: 'perl', projectNumber: '2026-042',
        customerName: 'Baumeister Gruber', datum: alt(90), status: 'Unterschrieben',
        abrechnung: 'Regie', zeiten: [], material: [],
        erstelltVonUid: 'm1', erstelltVonName: 'Max',
      } as WorkSheet & { id: string },
    ];
    zeige();

    expect(await screen.findByText(/Nicht verrechnete Leistung/)).toBeInTheDocument();
    expect(
      screen.queryByText(/offenen Forderungen konnten nicht geladen werden/),
    ).not.toBeInTheDocument();
  });
});

/**
 * Zahlungseingänge (Stufe 10.1).
 *
 * WAS ES VORHER GAB: einen Haken. Jemand stellte „Bezahlt" ein, und damit war
 * die Rechnung erledigt — ohne Datum, ohne Betrag, ohne Teilzahlung. Der
 * Mahnlauf rechnete danach weiter mit dem Bruttobetrag, und wer 400 von
 * 1.000 € überwiesen hatte, wurde über 1.000 € gemahnt.
 */
describe('Zahlungen erfassen', () => {
  const offeneRechnung = (p: Partial<Invoice> = {}): Invoice & { id: string } =>
    ({
      id: 'r-zahl',
      companyId: 'perl',
      invoiceNumber: 'RE-2026-0042',
      projectNumber: '2026-042',
      customerName: 'Familie Huber',
      invoiceDate: '2026-07-01',
      dueDate: '2026-07-15',
      totalNetto: 1000,
      totalVat: 200,
      totalBrutto: 1200,
      vatRate: 0.2,
      paymentStatus: 'Offen',
      ...p,
    }) as unknown as Invoice & { id: string };

  beforeEach(() => {
    erfassteZahlungen = [];
    bisherigeZahlungen = [];
  });

  it('schreibt Datum, Betrag und Art so, wie sie im Formular stehen', async () => {
    rechnungen = [offeneRechnung()];
    zeige();
    await screen.findByText(/RE-2026-0042/);

    await userEvent.click(
      await screen.findByRole('button', { name: /Weitere Aktionen für Rechnung RE-2026-0042/ }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Zahlung erfassen' }));

    /*
      DER OFFENE REST STEHT VORAUSGEFÜLLT DA. Er ist in den allermeisten
      Fällen der richtige Betrag; die Teilzahlung ist die Ausnahme und
      überschreibt ihn.
    */
    const betrag = await screen.findByLabelText(/^Betrag/);
    expect((betrag as HTMLInputElement).value).toBe('1200');

    await userEvent.clear(betrag);
    await userEvent.type(betrag, '400');
    await userEvent.click(screen.getByRole('button', { name: 'Zahlung eintragen' }));

    await waitFor(() => expect(createZahlung).toHaveBeenCalled());
    expect(erfassteZahlungen[0]).toMatchObject({
      invoiceId: 'r-zahl',
      betrag: 400,
      art: 'Überweisung',
    });
  });

  it('rechnet den Kopf nach einer Teilzahlung neu (Launch-Check, M14)', async () => {
    // Vorher stand nach 400 € weiter „offen € 1 200,00" über der Liste.
    rechnungen = [offeneRechnung()];
    listZahlungen.mockImplementation(async () =>
      erfassteZahlungen.map((z, i) => ({ id: `z${i}`, ...z })));
    zeige();
    await screen.findByText(/RE-2026-0042/);
    await userEvent.click(
      await screen.findByRole('button', { name: /Weitere Aktionen für Rechnung RE-2026-0042/ }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Zahlung erfassen' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/offen € 1\s200,00/);

    const betrag = await screen.findByLabelText(/^Betrag/);
    await userEvent.clear(betrag);
    await userEvent.type(betrag, '400');
    await userEvent.click(screen.getByRole('button', { name: 'Zahlung eintragen' }));

    await waitFor(() => expect(dialog).toHaveTextContent('offen € 800,00'));
    listZahlungen.mockImplementation(async () => bisherigeZahlungen);
  });

  /*
    DIE ZEILE SAGT, WAS SCHON DA IST. Ohne diese Angabe müsste jemand die
    Rechnung öffnen, um zu sehen, warum der Mahnlauf einen anderen Betrag
    fordert als die Liste zeigt.
  */
  it('zeigt bei einer Teilzahlung, was bezahlt und was offen ist', async () => {
    rechnungen = [offeneRechnung({ paymentStatus: 'Teilbezahlt', bezahltBetrag: 400 })];
    zeige();
    expect(await screen.findByText(/400,00 bezahlt · € 800,00 offen/)).toBeInTheDocument();
  });

  /*
    GEMELDET: „nach einer Teilzahlung lässt sich nicht mehr mahnen". Mahnen
    ging — man sah nur nicht mehr, dass man sollte: das Abzeichen sagt
    „Teilbezahlt", und der Rest stand unter „Offen" statt „Überfällig".
  */
  it('führt eine angezahlte Rechnung nach Ablauf des Ziels als überfällig', async () => {
    rechnungen = [offeneRechnung({ paymentStatus: 'Teilbezahlt', bezahltBetrag: 400, dueDate: '2026-07-15' })];
    zeige();
    expect(await screen.findByText(/800,00 offen/)).toHaveTextContent(/offen · überfällig$/);

    const kachel = screen.getAllByText('Überfällig').find((e) => e.tagName === 'P')!.parentElement!;
    expect(kachel).toHaveTextContent('€ 800,00');

    // Auch der Filter „Überfällig" zeigt sie.
    await userEvent.selectOptions(document.getElementById('invfilter')!, 'Überfällig');
    expect(screen.getByText(/RE-2026-0042/)).toBeInTheDocument();
    // Und die Zahlungserinnerung steht im Menü.
    await userEvent.click(screen.getByRole('button', { name: /Weitere Aktionen für Rechnung RE-2026-0042/ }));
    expect(await screen.findByRole('menuitem', { name: /Zahlungserinnerung erzeugen/ })).toBeInTheDocument();
  });

  /*
    Die Startseite verlinkt ihre Kachel „Überfällig" mit `?status=`. Ohne
    den Filter landete man in der vollen Liste und suchte selbst.
  */
  it('übernimmt den Filter aus der Adresse, mit der die Startseite hierher verlinkt', async () => {
    rechnungen = [
      offeneRechnung({ paymentStatus: 'Teilbezahlt', bezahltBetrag: 400 }),
      offeneRechnung({ id: 'r-frisch', invoiceNumber: 'RE-2026-0043', dueDate: '2099-01-15' }),
    ];
    zeige('/invoices?status=%C3%9Cberf%C3%A4llig');
    expect(await screen.findByText(/RE-2026-0042/)).toBeInTheDocument();
    expect(screen.queryByText(/RE-2026-0043/)).toBeNull();
    expect((document.getElementById('invfilter') as HTMLSelectElement).value).toBe('Überfällig');
  });

  it('zeigt bei einem unbekannten Filter in der Adresse alle', async () => {
    rechnungen = [
      offeneRechnung({ paymentStatus: 'Teilbezahlt', bezahltBetrag: 400 }),
      offeneRechnung({ id: 'r-frisch', invoiceNumber: 'RE-2026-0043', dueDate: '2099-01-15' }),
    ];
    zeige('/invoices?status=kaputt');
    expect(await screen.findByText(/RE-2026-0043/)).toBeInTheDocument();
    expect(screen.getByText(/RE-2026-0042/)).toBeInTheDocument();
    expect((document.getElementById('invfilter') as HTMLSelectElement).value).toBe('alle');
  });

  it('sagt nichts von überfällig, solange das Ziel noch läuft', async () => {
    rechnungen = [offeneRechnung({ paymentStatus: 'Teilbezahlt', bezahltBetrag: 400, dueDate: '2099-01-15' })];
    zeige();
    expect(await screen.findByText(/800,00 offen/)).not.toHaveTextContent(/überfällig/);
    const kachel = screen.getAllByText('Überfällig').find((e) => e.tagName === 'P')!.parentElement!;
    expect(kachel).toHaveTextContent('€ 0,00');
  });

  /*
    EINE STORNIERTE RECHNUNG MIT ZAHLUNG IST EIN GUTHABEN. Sie als „nichts
    offen" zu zeigen wäre richtig und würde trotzdem das Wesentliche
    verschweigen: der Betrieb schuldet dem Kunden Geld.
  */
  it('nennt das Guthaben nach einem Storno beim Namen', async () => {
    rechnungen = [offeneRechnung({ paymentStatus: 'Storniert', bezahltBetrag: 1200 })];
    zeige();
    expect(await screen.findByText(/Guthaben des Kunden/)).toBeInTheDocument();
  });

  /*
    DER HAKEN IST WEG, und das gehört geprüft: bliebe der Menüpunkt stehen,
    wäre er eine Sackgasse — die Datenbank weist den Schreibversuch ab.
  */
  it('bietet „Auf Bezahlt setzen" nicht mehr an', async () => {
    rechnungen = [offeneRechnung()];
    zeige();
    await screen.findByText(/RE-2026-0042/);
    await userEvent.click(
      await screen.findByRole('button', { name: /Weitere Aktionen für Rechnung RE-2026-0042/ }),
    );
    expect(screen.queryByRole('menuitem', { name: /Auf „Bezahlt" setzen/ })).toBeNull();
    expect(await screen.findByRole('menuitem', { name: 'Zahlung erfassen' })).toBeInTheDocument();
  });
});

describe('Ohne Anzahlungen bleibt die Maske, wie sie war', () => {
  it('zeigt gar keine Auswahl der Rechnungsart', async () => {
    /*
      DER NORMALFALL, und er ist der häufigste: ein Betrieb, der schlicht
      Rechnungen stellt. Für ihn darf Stufe 10.2 nicht einmal sichtbar sein.
    */
    zeige();
    await screen.findByRole('combobox', { name: /Baustelle/ });
    expect(screen.queryByRole('combobox', { name: /Art der Rechnung/ })).toBeNull();
  });

  it('legt trotzdem eine Einzelrechnung an', async () => {
    const bestaetigen = await bisZurVorschau();
    await userEvent.click(bestaetigen);
    await waitFor(() => expect(lege).toHaveBeenCalled());
    expect((lege.mock.calls[0][0] as Invoice).art).toBe('einzel');
  });
});

describe('Anzahlung, Teilrechnung, Schlussrechnung', () => {
  // Dieser Betrieb hat die Arten in den Einstellungen eingeschaltet.
  beforeEach(() => {
    authWert.company.rechnungsarten = true;
  });

  /** Eine bezahlte Anzahlung über 1.200 € brutto auf derselben Baustelle. */
  const ANZAHLUNG: Invoice & { id: string } = {
    id: 'a1',
    companyId: 'perl',
    invoiceNumber: 'RE-2026-1001',
    projectNumber: '2026-042',
    customerName: 'Familie Huber',
    invoiceDate: '2026-05-02',
    dueDate: '2026-05-16',
    art: 'anzahlung',
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    paymentStatus: 'Bezahlt',
  } as Invoice & { id: string };

  it('stellt eine Anzahlung ohne Stunden und ohne Belege zusammen', async () => {
    /*
      Eine Anzahlung ist Geld auf eine Leistung, die erst kommt. Nähme sie
      Stunden mit, wären die als verrechnet gesperrt, fielen aus der
      Schlussrechnung heraus — und der Abzug zöge sie ein zweites Mal ab.
    */
    const bestaetigen = await bisZurVorschau('anzahlung');
    expect(screen.getByDisplayValue('Anzahlung gemäß Vereinbarung')).toBeTruthy();
    expect(screen.queryByDisplayValue(/Facharbeiterstunden/)).toBeNull();

    await userEvent.click(bestaetigen);
    await waitFor(() => expect(lege).toHaveBeenCalled());
    const inv = lege.mock.calls[0][0] as Invoice;
    expect(inv.art).toBe('anzahlung');
    expect(inv.linkedEntries).toEqual([]);
    // Gesperrt wird nichts: die Liste, die zum Sperren geht, ist leer.
    expect(markiere).toHaveBeenCalledWith('timeEntries', [], 'RE-2026-1099');
  });

  it('verlangt für die Anzahlung keinen Leistungszeitraum', async () => {
    // Die Leistung ist noch nicht erbracht — ein Datum wäre erfunden.
    await bisZurVorschau('anzahlung');
    expect(screen.queryByText(/Ohne Leistungszeitraum/)).toBeNull();
  });

  it('bietet die Anzahlung der Baustelle zum Abzug an und rechnet den Rest aus', async () => {
    derBaustelle = [ANZAHLUNG];
    await bisZurVorschau('schluss');

    const haken = await screen.findByRole('checkbox', { name: /RE-2026-1001/ });
    await userEvent.click(haken);

    /*
      DIE STEUERFALLE: ohne Abzug stünde die Steuer der Anzahlung ein zweites
      Mal auf einem Beleg desselben Betriebs — und er schuldete sie zweimal
      (§ 11 Abs 12 UStG).
    */
    expect(screen.getByText(/Gesamtleistung brutto/)).toBeTruthy();
    expect(screen.getByText(/Restforderung brutto/)).toBeTruthy();
  });

  it('schreibt Forderung und Gesamtleistung getrennt in die Rechnung', async () => {
    /*
      Acht Stunden Facharbeit zu 65 € sind 520 € netto, 104 € USt, 624 €
      brutto. Die Anzahlung über 240 € brutto geht davon ab.
    */
    derBaustelle = [{ ...ANZAHLUNG, totalNetto: 200, totalVat: 40, totalBrutto: 240 }];
    const bestaetigen = await bisZurVorschau('schluss');
    await userEvent.click(await screen.findByRole('checkbox', { name: /RE-2026-1001/ }));
    await userEvent.click(bestaetigen);

    await waitFor(() => expect(lege).toHaveBeenCalled());
    const inv = lege.mock.calls[0][0] as Invoice;
    expect(inv.art).toBe('schluss');
    /*
      DIE FORDERUNG IST DER REST, die Gesamtleistung steht daneben. An
      `total*` hängen offene Posten, Mahnlauf und Zahlungsstand: stünde dort
      die volle Leistung, mahnte der Betrieb 624 € ein, von denen 240 €
      längst bezahlt sind.
    */
    expect(inv.totalNetto).toBe(320);
    expect(inv.totalVat).toBe(64);
    expect(inv.totalBrutto).toBe(384);
    expect(inv.gesamtNetto).toBe(520);
    expect(inv.gesamtVat).toBe(104);
    expect(inv.gesamtBrutto).toBe(624);
    expect(inv.vorrechnungen).toEqual([
      {
        invoiceId: 'a1',
        invoiceNumber: 'RE-2026-1001',
        invoiceDate: '2026-05-02',
        netto: 200,
        vat: 40,
        brutto: 240,
      },
    ]);
  });

  it('lässt Art und Abzug beim erneuten Drucken nicht verschwinden', async () => {
    /*
      Der zweite Druck muss denselben Beleg ergeben wie der erste. Bekäme das
      PDF die Forderung statt der Gesamtleistung, zöge es ein zweites Mal ab —
      und über derselben Nummer stünde ein anderer Betrag.
    */
    rechnungen = [
      {
        id: 's1',
        companyId: 'perl',
        invoiceNumber: 'RE-2026-1050',
        projectNumber: '2026-042',
        customerName: 'Familie Huber',
        invoiceDate: '2026-09-01',
        dueDate: '2026-09-15',
        art: 'schluss',
        totalNetto: 2000, totalVat: 400, totalBrutto: 2400,
        gesamtNetto: 3000, gesamtVat: 600, gesamtBrutto: 3600,
        vorrechnungen: [
          { invoiceId: 'a1', invoiceNumber: 'RE-2026-1001', invoiceDate: '2026-05-02', netto: 1000, vat: 200, brutto: 1200 },
        ],
        positions: [{ label: 'Facharbeiterstunden', qty: 40, unit: 'h', unitPrice: 75, netto: 3000 }],
        paymentStatus: 'Offen',
      } as Invoice & { id: string },
    ];
    zeige();
    await screen.findByText(/RE-2026-1050/);
    await userEvent.click(
      await screen.findByRole('button', { name: /Weitere Aktionen für Rechnung RE-2026-1050/ }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'PDF erneut laden' }));

    await waitFor(() => expect(pdfAusgabe).toHaveBeenCalled());
    const opts = pdfAusgabe.mock.calls[0][0] as {
      art: string;
      vorrechnungen: unknown[];
      assembled: { totalBrutto: number };
    };
    expect(opts.art).toBe('schluss');
    expect(opts.vorrechnungen).toHaveLength(1);
    // Die VOLLE Leistung — den Rest rechnet das PDF selbst.
    expect(opts.assembled.totalBrutto).toBe(3600);
  });

  it('lässt keine Rechnung anlegen, die ins Minus liefe', async () => {
    /*
      Das wäre eine Gutschrift: Zahlungsstand, offene Posten und Mahnlauf
      rechnen alle mit einer Forderung, die man begleichen kann. Auf null
      gekappt verschwände der Betrag, den der Betrieb zurückschuldet.
    */
    derBaustelle = [{ ...ANZAHLUNG, totalNetto: 10000, totalVat: 2000, totalBrutto: 12000 }];
    const bestaetigen = await bisZurVorschau('schluss');
    await userEvent.click(await screen.findByRole('checkbox', { name: /RE-2026-1001/ }));

    expect(screen.getByText(/wäre eine Gutschrift/)).toBeTruthy();
    expect((bestaetigen as HTMLButtonElement).disabled).toBe(true);
  });

  it('bietet keine Rechnung an, die Belege verbraucht hat', async () => {
    // Ihre Stunden sind gesperrt und stehen in dieser Rechnung gar nicht mehr
    // — ein Abzug zöge sie ein zweites Mal ab.
    derBaustelle = [{ ...ANZAHLUNG, art: 'teil', linkedEntries: ['z9'] }];
    await bisZurVorschau('schluss');
    expect(await screen.findByText(/keine Anzahlung, die nicht schon abgezogen wäre/)).toBeTruthy();
  });

  it('fällt auf die Einzelrechnung zurück, wenn der Betrieb die Arten abdreht', async () => {
    /*
      Die Einstellung kann sich ändern, während jemand eine Rechnung
      vorbereitet — sie kommt aus den Betriebsdaten und nicht aus dieser
      Maske. Bliebe die Auswahl dann im Zustand stehen, entstünde ein Beleg
      über eine Einstellung, die es nicht mehr gibt. Deshalb ist die Art
      ABGELEITET und nicht bloss ausgeblendet.
    */
    const { rerender } = zeige();
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /Baustelle/ }),
      '2026-042',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Art der Rechnung/ }),
      'anzahlung',
    );

    authWert.company.rechnungsarten = false;
    rerender(
      <MemoryRouter>
        <ToastProvider>
          <InvoicesView />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('combobox', { name: /Art der Rechnung/ })).toBeNull();
    // Der Knopf heisst wieder wie bei einer gewöhnlichen Rechnung.
    expect(screen.getByRole('button', { name: 'Positionen zusammenstellen' })).toBeTruthy();
  });

  it('meldet es, wenn die bisherigen Rechnungen nicht geladen werden konnten', async () => {
    /*
      Stillschweigen wäre hier das Teuerste: eine Schlussrechnung ohne ihre
      Anzahlungen sieht vollständig aus und weist dieselbe Steuer zweimal aus.
    */
    baustellenAbfrageWirft = true;
    await bisZurVorschau('schluss');
    expect(await screen.findByText(/konnten nicht geladen werden/)).toBeTruthy();
  });
});

describe('Rechnungen suchen — über alle, nicht nur die geladenen', () => {
  const rechnung = (id: string, nummer: string, kunde: string) =>
    ({
      id, invoiceNumber: nummer, projectNumber: '2025-007', customerName: kunde,
      invoiceDate: '2025-03-10', dueDate: '2025-03-24', positions: [], totalNetto: 100, totalVat: 20,
      totalBrutto: 120, vatRate: 0.2, paymentStatus: 'Bezahlt',
    }) as unknown as Invoice & { id: string };

  it('steht immer da und findet auch eine Rechnung, die nicht geladen ist', async () => {
    rechnungen = [rechnung('neu', 'RE-2026-1010', 'Familie Maier')];
    suchTreffer = [rechnung('alt', 'RE-2025-1001', 'Familie Huber')];
    zeige();
    await userEvent.type(await screen.findByLabelText('Suche'), 'Huber');
    expect(await screen.findByText('RE-2025-1001 · Familie Huber')).toBeInTheDocument();
    expect(suche).toHaveBeenLastCalledWith('perl', 'Huber');
    expect(screen.queryByText('RE-2026-1010 · Familie Maier')).not.toBeInTheDocument();
  });

  it('nimmt den Suchbegriff aus der Adresse — so verlinkt die Kundenakte', async () => {
    suchTreffer = [rechnung('alt', 'RE-2025-1001', 'Familie Huber')];
    zeige('/invoices?suche=RE-2025-1001');
    expect(await screen.findByLabelText('Suche')).toHaveValue('RE-2025-1001');
    expect(await screen.findByText('RE-2025-1001 · Familie Huber')).toBeInTheDocument();
  });

  it('sagt, wenn die Suche nicht erreichbar ist — und sucht im Geladenen', async () => {
    sucheWirft = true;
    rechnungen = [rechnung('neu', 'RE-2026-1010', 'Familie Maier')];
    zeige();
    await userEvent.type(await screen.findByLabelText('Suche'), 'Maier');
    expect(await screen.findByText(/Suche über alle Rechnungen ist gerade nicht erreichbar/)).toBeInTheDocument();
    expect(screen.getByText('RE-2026-1010 · Familie Maier')).toBeInTheDocument();
  });
});


/**
 * LAUNCH-CHECK 25.09.2026, K3: eine Pauschalbaustelle (Angebot 275 € netto)
 * bekam eine Stundenrechnung über 6 h × 65 €. Das Angebot ist die Rechnung.
 */
describe('Pauschalbaustelle', () => {
  const ANGEBOT = {
    id: 'q1', quoteNumber: 'AN-2026-0003', status: 'Angenommen', quoteDate: '2026-08-01',
    positions: [
      { label: 'Heizkörper tauschen', qty: 1, unit: 'Pauschale', unitPrice: 200, netto: 200 },
      { label: 'Arbeitszeit', qty: 1, unit: 'h', unitPrice: 75, netto: 75 },
    ],
    discount: null, subtotalNetto: 275, totalNetto: 275, totalVat: 55, totalBrutto: 330,
  };

  it('übernimmt das angenommene Angebot statt der Stunden', async () => {
    PROJEKT.billingMode = 'Pauschal';
    angebote = [ANGEBOT];
    scheine = [SCHEIN];
    katalog = KATALOG;
    await bisZurVorschau();
    expect(screen.getByDisplayValue('Heizkörper tauschen')).toBeInTheDocument();
    expect(screen.getByText(/Positionen kommen aus dem Angebot AN-2026-0003 \(€ 275,00 netto\)/)).toBeInTheDocument();
    // Weder die gebuchten 8 Stunden noch das Material des Scheins als eigene Zeile.
    expect(screen.queryByDisplayValue('Eckventil 1/2 Zoll')).toBeNull();
    expect(screen.queryByDisplayValue(/Facharbeiter/)).toBeNull();
  });

  it('bietet die Pauschale nicht ein zweites Mal an', async () => {
    PROJEKT.billingMode = 'Pauschal';
    angebote = [ANGEBOT];
    derBaustelle = [{ id: 'r1', invoiceNumber: 'RE-2026-1002', projectNumber: '2026-042', paymentStatus: 'Offen' } as Invoice & { id: string }];
    zeige();
    const auswahl = await screen.findByRole('combobox', { name: /Baustelle/ });
    await userEvent.selectOptions(auswahl, '2026-042');
    await userEvent.click(screen.getByRole('button', { name: 'Positionen zusammenstellen' }));
    expect(await screen.findByText(/Pauschale ist mit RE-2026-1002 bereits verrechnet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rechnung erstellen/ })).toBeNull();
  });

  it('ohne angenommenes Angebot steht eine Null da, die ausgefüllt werden will', async () => {
    PROJEKT.billingMode = 'Pauschal';
    await bisZurVorschau();
    expect(screen.getByDisplayValue('Pauschale gemäß Vereinbarung')).toBeInTheDocument();
    expect(screen.getByText(/ohne angenommenes Angebot/)).toBeInTheDocument();
  });

  it('eine Regiebaustelle rechnet weiter die Stunden', async () => {
    PROJEKT.billingMode = 'Regie';
    angebote = [ANGEBOT];
    await bisZurVorschau();
    expect(screen.getByDisplayValue(/Facharbeiterstunden/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Heizkörper tauschen')).toBeNull();
    expect(screen.queryByText(/Pauschalbaustelle/)).toBeNull();
  });
});


/**
 * LAUNCH-CHECK 25.09.2026, M1: nur der Firmenname war Pflicht, und
 * RE-2026-1500 ging ohne Anschrift des Ausstellers hinaus.
 */
describe('Der Aussteller auf der Rechnung', () => {
  afterEach(() => {
    authWert.company.addressLine = 'Hauptstraße 1 · 2700 Wiener Neustadt';
  });

  it('ohne Anschrift des Betriebs keine Rechnung', async () => {
    authWert.company.addressLine = undefined;
    const bestaetigen = await bisZurVorschau();
    expect(screen.getByText(/Anschrift des Betriebs fehlt/)).toBeInTheDocument();
    // Die Buchhaltung darf die Firmendaten nicht ändern — sie bekommt den Weg gesagt.
    expect(screen.getByText(/Die Geschäftsführung trägt sie in den Firmendaten ein/)).toBeInTheDocument();
    expect(bestaetigen).toBeDisabled();
  });

  it('mit Anschrift geht es wie immer', async () => {
    const bestaetigen = await bisZurVorschau();
    expect(screen.queryByText(/Anschrift des Betriebs fehlt/)).toBeNull();
    expect(bestaetigen).toBeEnabled();
  });
});

/**
 * LAUNCH-CHECK 25.09.2026, M13: die Kennzahl „Bezahlt" zählte die 200 € auf
 * der stornierten RE-2026-1500 mit — Geld, das dem Kunden als Guthaben
 * zurückgehört.
 */
describe('Die Kennzahl „Bezahlt"', () => {
  it('zählt kein Guthaben — weder auf einem Storno noch als Überzahlung', async () => {
    rechnungen = [
      { id: 's', invoiceNumber: 'RE-2026-1500', projectNumber: '2026-042', customerName: 'Max', paymentStatus: 'Storniert', totalBrutto: 504, bezahltBetrag: 200 },
      { id: 'b', invoiceNumber: 'RE-2026-1501', projectNumber: '2026-042', customerName: 'Max', paymentStatus: 'Überzahlt', totalBrutto: 100, bezahltBetrag: 130 },
    ] as unknown as (Invoice & { id: string })[];
    zeige();
    const kachel = (await screen.findByText('Bezahlt', { selector: 'p, span, div, dt' })).parentElement!;
    expect(kachel).toHaveTextContent('€ 100,00');
    expect(kachel).not.toHaveTextContent('€ 330,00');
  });
});

/**
 * AM SCHREIBTISCH STEHT DIE LISTE ALS TABELLE — mit denselben Angaben und
 * demselben Menü wie die Listenzeile am Telefon. Und nur einmal: beide
 * Formen versteckt nebeneinander hiessen jede Rechnung doppelt im DOM.
 */
describe('Rechnungen am Schreibtisch', () => {
  const schreibtisch = mitSchreibtisch();

  const TEILBEZAHLT = {
    id: 't',
    invoiceNumber: 'RE-2026-2001',
    projectNumber: '2026-042',
    customerName: 'Baumeister Gruber',
    invoiceDate: '2026-08-20',
    dueDate: '2026-12-31',
    totalBrutto: 1000,
    bezahltBetrag: 400,
    paymentStatus: 'Teilbezahlt',
  };
  const STORNIERT = {
    id: 's',
    invoiceNumber: 'RE-2026-2002',
    projectNumber: '2026-043',
    customerName: 'Familie Huber',
    invoiceDate: '2026-08-21',
    dueDate: '2026-09-20',
    totalBrutto: 500,
    paymentStatus: 'Storniert',
    cancellationNote: 'Doppelt erfasst',
  };

  async function tabelle() {
    rechnungen = [TEILBEZAHLT, STORNIERT] as unknown as (Invoice & { id: string })[];
    schreibtisch();
    zeige();
    return (await screen.findByRole('columnheader', { name: 'Betrag' })).closest('table')!;
  }

  it('zeigt Nummer, Kunde, Datum, fällig, Betrag und Status als Spalten', async () => {
    const t = await tabelle();
    const koepfe = within(t).getAllByRole('columnheader').map((k) => k.textContent);
    expect(koepfe).toEqual(['Nummer', 'Kunde', 'Datum', 'Fällig', 'Betrag', 'Status', 'Aktionen']);
    const zeile = within(t).getByRole('row', { name: /RE-2026-2001/ });
    expect(zeile).toHaveTextContent('Baumeister Gruber');
    expect(zeile).toHaveTextContent('20.08.2026');
    expect(zeile).toHaveTextContent('31.12.2026');
    // Der Betrag steht in einer Zahlenspalte — rechtsbündig.
    expect(within(zeile).getByText(/^€ 1.000,00$/)).toHaveClass('tabelle-zahl');
  });

  it('verliert nichts, was die Listenzeile sagt: Teilzahlung und Storno-Grund', async () => {
    const t = await tabelle();
    expect(within(t).getByText(/€ 400,00 bezahlt · € 600,00 offen/)).toBeInTheDocument();
    expect(within(t).getByText('Storno: Doppelt erfasst')).toBeInTheDocument();
  });

  it('trägt dasselbe Menü, und jede Rechnung steht nur einmal da', async () => {
    const t = await tabelle();
    expect(screen.getAllByText('RE-2026-2001')).toHaveLength(1);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    const menues = screen.getAllByRole('button', { name: /Weitere Aktionen für Rechnung/ });
    expect(menues).toHaveLength(2);
    menues.forEach((m) => expect(t).toContainElement(m));

    await userEvent.click(
      screen.getByRole('button', { name: 'Weitere Aktionen für Rechnung RE-2026-2001' }),
    );
    expect(await screen.findByRole('menuitem', { name: 'Zahlung erfassen' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Stornieren' })).toBeInTheDocument();
  });
});
