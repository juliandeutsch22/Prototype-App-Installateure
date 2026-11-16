import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Quote } from '@/types';

/**
 * Die Angebotsseite.
 *
 * GEMELDET: „ein erstelltes Angebot kann man nicht als PDF herunterladen oder
 * überhaupt ansehen im Nachhinein". Positionen und Anmerkungen gab es nach dem
 * Anlegen nirgends mehr zu sehen, und dem Kunden liess sich nichts schicken.
 */

const ANGEBOT: Quote & { id: string } = {
  id: '11111111-2222-3333-4444-555555555555',
  companyId: 'perl',
  quoteNumber: 'AN-2026-0007',
  customerId: 'k1',
  customerName: 'Gemeinde Neudorf',
  address: 'Volksschule, Schulgasse 2, 2700 Wiener Neustadt',
  quoteDate: '2026-09-01',
  validUntil: '2099-10-01',
  status: 'Versendet',
  positions: [
    { label: 'Facharbeiterstunden', qty: 16, unit: 'h', unitPrice: 78, netto: 1248 },
    { label: 'Geberit Duofix', qty: 1, unit: 'Stk', unitPrice: 289.9, netto: 289.9 },
  ],
  subtotalNetto: 1537.9,
  totalNetto: 1537.9,
  totalVat: 307.58,
  totalBrutto: 1845.48,
  vatRate: 0.2,
  kalkulierteStunden: 16,
  notes: 'WC im Erdgeschoss tauschen.\nArbeiten nur in den Ferien.',
};

const KUNDE: Customer & { id: string } = {
  id: 'k1',
  companyId: 'perl',
  name: 'Gemeinde Neudorf',
  address: 'Rathausplatz 1, 2700 Wiener Neustadt',
};

let angebot: (Quote & { id: string }) | null = ANGEBOT;
let kundeScheitert = false;
const updateQuote = vi.fn<(a0: string, a1: unknown) => Promise<void>>(async () => undefined);
const deleteQuote = vi.fn<(a0: string) => Promise<void>>(async () => undefined);
const pdf = vi.fn<(a0: unknown) => Promise<void>>(async () => undefined);
const annehmen = vi.fn(async () => ({ projectNumber: 'B-2026-0007', abgeleitet: 'B-2026-0007' }));

/** Die Fassungen rundherum (M17). */
let fassungen: (Quote & { id: string })[] = [];
const VORGAENGER = { ...ANGEBOT, id: '99999999-2222-3333-4444-555555555555', quoteNumber: 'AN-2026-0003' };
/** Der Stand des Vorgängers — für den Papierkorb, wenn eine andere Fassung angenommen ist (M01d). */
let vorgaengerStand: Quote['status'] = 'Versendet';
vi.mock('@/lib/db/quotes', () => ({
  getQuote: vi.fn(async (_c: string, qid: string) => (qid === VORGAENGER.id ? { ...VORGAENGER, status: vorgaengerStand } : angebot)),
  listFassungen: vi.fn(async () => fassungen),
  updateQuote: (id: string, d: unknown) => updateQuote(id, d),
  deleteQuote: (id: string) => deleteQuote(id),
  annahmeZuruecknehmen: (id: string, g: string) => zuruecknehmen(id, g),
}));
/* Die Rücknahme einer Annahme (A1): was die Datenbank tut und was an der Baustelle hängt. */
const zuruecknehmen = vi.fn<(id: string, g: string) => Promise<Record<string, unknown>>>(async () => ({
  status: 'Versendet', baustelle: 'PR-2026-0007', baustelleId: null, ergebnis: 'geloescht', wiederOffen: [],
}));
const LEER = {
  zeitbuchungen: 0, einsaetze: 0, scheine: 0, rechnungen: 0, anforderungen: 0, ruestlisten: 0,
  dokumente: 0, termine: 0, nachrichten: 0, angebote: [] as { id: string; nummer: string; status: string }[],
};
let verwendung = LEER;
vi.mock('@/lib/db/projects', () => ({
  baustelleVerwendung: vi.fn(async () => verwendung),
}));
vi.mock('@/lib/db/customers', () => ({
  listCustomersByIds: vi.fn(async () => {
    if (kundeScheitert) throw new Error('kein Netz');
    return [KUNDE];
  }),
}));
/** Die Firmendaten der Ausstellung (seit 24.10.2026): mit Stand die von damals. */
const belegFirma = vi.fn(async (f: Record<string, unknown>, stand?: string | null) =>
  stand ? { ...f, addressLine: 'Hauptplatz 1 · 2700 Wiener Neustadt', bankName: 'Alte Bank' } : f);
vi.mock('@/lib/db/aussteller', () => ({
  belegFirma: (f: Record<string, unknown>, stand?: string | null) => belegFirma(f, stand),
}));
vi.mock('@/features/quotes/angebotPdf', () => ({
  downloadAngebotPdf: (o: unknown) => pdf(o),
  angebotPdfBlob: (o: unknown) => pdfBlob(o),
}));
/* F16: per Mail — welches Angebot (Datum!) als PDF hinausgeht und was gesendet wird. */
const pdfBlob = vi.fn<(o: unknown) => Promise<Blob>>(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
const belegPerMail = vi.fn<(a: unknown) => Promise<object>>(async () => ({ versand: 'v1', an: ['amt@neudorf.at'], kopie: 'office@perl.at', angebotVersendet: true }));
vi.mock('@/lib/db/belegMail', () => ({
  BelegMailNichtEingerichtet: class extends Error {},
  belegMailStand: vi.fn(async () => ({ eingerichtet: true, absender: 'office@senklot.at' })),
  belegPerMail: (a: unknown) => belegPerMail(a),
  listBelegVersand: vi.fn(async () => []),
}));
/*
  Die Annahme-Links (M02a) prüft `AngebotLink.test.tsx`; hier hat das Angebot
  keinen — so, wie jedes Angebot vor dem Paket dastand.
*/
vi.mock('@/lib/db/angebotLinks', () => ({
  listAngebotLinks: vi.fn(async () => []),
  angebotLinkErzeugen: vi.fn(),
  angebotLinkWiderrufen: vi.fn(),
  angebotLinkGesehen: vi.fn(async () => undefined),
}));
/* Der Auftragseingang, aus dem das Angebot entstand (M02b) — ab Werk keiner. */
let ausEingang: { id: string; nummer: string } | null = null;
const getEingangZu = vi.fn<(c: string, z: { quoteId: string }) => Promise<typeof ausEingang>>(async () => ausEingang);
vi.mock('@/lib/db/auftragseingaenge', () => ({
  getEingangZu: (c: string, z: { quoteId: string }) => getEingangZu(c, z),
}));
vi.mock('@/features/quotes/angebotAnnehmen', () => ({
  angebotAnnehmen: (...a: unknown[]) => annehmen(...(a as [])),
  annahmeMeldung: (r: { projectNumber: string }) => `Baustelle ${r.projectNumber} angelegt`,
}));

const rolle = { wert: 'Geschäftsführung' as string };
const authWert = {
  user: {
    uid: 'chef',
    email: 'chefin@perl.at',
    name: 'Chefin',
    get role() {
      return rolle.wert as 'Geschäftsführung';
    },
    companyId: 'perl',
    docId: 'chef',
  },
  company: { id: 'perl', name: 'Perl Installationen' } as { id: string; name: string; modules?: Record<string, boolean>; belegMailAntwort?: string },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: AngebotView } = await import('@/features/quotes/AngebotView');

/** Die Angebotsliste als Ziel — mit der Adresse, damit ein Test sieht, WOHIN es ging. */
function Liste() {
  const { search } = useLocation();
  return <p>Angebotsliste{search}</p>;
}

/**
 * Seit der Linie „Lot“ liegen die seltenen Aktionen (ablehnen, kopieren,
 * löschen) im „⋯“ des Seitenkopfs — ein Tipp weiter als in der früheren
 * Karte „Weiter“. Was die Tests schützen, bleibt: dass es sie gibt und was
 * sie tun.
 */
async function mehrMenue(nutzer: ReturnType<typeof userEvent.setup>, eintrag: string) {
  await nutzer.click(await screen.findByRole('button', { name: /^Weitere Aktionen für Angebot AN-2026-0007/ }));
  await nutzer.click(screen.getByRole('menuitem', { name: eintrag }));
}

function zeige(id = ANGEBOT.id) {
  return render(
    <MemoryRouter initialEntries={[`/quotes/${id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/quotes/:id" element={<AngebotView />} />
          <Route path="/quotes" element={<Liste />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  angebot = { ...ANGEBOT };
  verwendung = LEER;
  zuruecknehmen.mockClear();
  fassungen = [];
  kundeScheitert = false;
  rolle.wert = 'Geschäftsführung';
  vorgaengerStand = 'Versendet';
  updateQuote.mockClear();
  deleteQuote.mockClear();
  pdf.mockClear();
  annehmen.mockClear();
  ausEingang = null;
  getEingangZu.mockClear();
  authWert.company = { id: 'perl', name: 'Perl Installationen' };
});

/* PER MAIL (F16): der Knopf am Schritt, A12 auch hier, und was hinausgeht. */
describe('Angebot per Mail (F16)', () => {
  it('Entwurf mit zurückliegendem Datum: erst das Datum auf heute, dann das PDF mit dem neuen Datum, dann senden', async () => {
    const nutzer = userEvent.setup();
    authWert.company = { id: 'perl', name: 'Perl Installationen', belegMailAntwort: 'office@perl.at' };
    angebot = { ...ANGEBOT, status: 'Entwurf', quoteDate: '2026-09-01', validUntil: '2026-10-01' };
    pdfBlob.mockClear();
    belegPerMail.mockClear();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Per Mail senden' }));
    const fenster = await screen.findByRole('dialog', { name: 'Angebot per Mail' });
    expect(within(fenster).getByRole('checkbox', { name: /Angebotsdatum auf heute setzen \(statt 01\.09\.2026\)/ })).toBeChecked();
    // Beim Kunden steht keine Adresse — sie wird eingetragen.
    await nutzer.type(within(fenster).getByRole('textbox', { name: /^An/ }), 'amt@neudorf.at');
    await nutzer.click(await within(fenster).findByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(belegPerMail).toHaveBeenCalled());
    const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
    expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, expect.objectContaining({ quoteDate: heute }));
    expect(updateQuote.mock.invocationCallOrder[0]).toBeLessThan(pdfBlob.mock.invocationCallOrder[0]);
    expect((pdfBlob.mock.calls[0][0] as { quote: { quoteDate: string } }).quote.quoteDate).toBe(heute);
    expect(belegPerMail.mock.calls[0][0]).toMatchObject({ art: 'angebot', beleg: ANGEBOT.id, an: ['amt@neudorf.at'] });
  });

  it('Gegenprobe: im Einblick und für ein leeres Angebot gibt es den Knopf nicht', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf', positions: [] };
    const { unmount } = zeige();
    expect(await screen.findByText(/Noch ohne Position/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Per Mail senden' })).toBeNull();
    unmount();
    angebot = { ...ANGEBOT, status: 'Versendet' };
    zeige();
    expect(await screen.findByRole('button', { name: 'Per Mail senden' })).toBeInTheDocument();
  });
});

/* AUS EINGANG (M02b): woher das Angebot kam — mit Weg zum Eingang. */
describe('Der Eingang hinter dem Angebot (M02b)', () => {
  it('„Aus Eingang EG-…“ unter den Angaben, über die Kennung des Angebots gesucht', async () => {
    ausEingang = { id: 'e1', nummer: 'EG-2026-0005' };
    zeige();
    expect(await screen.findByRole('link', { name: 'Aus Eingang EG-2026-0005' })).toHaveAttribute('href', '/eingaenge/e1');
    expect(getEingangZu).toHaveBeenCalledWith('perl', { quoteId: ANGEBOT.id });
  });

  it('Gegenprobe: mit abgeschaltetem Auftragseingang wird nicht gesucht und nichts gezeigt', async () => {
    ausEingang = { id: 'e1', nummer: 'EG-2026-0005' };
    authWert.company = { id: 'perl', name: 'Perl Installationen', modules: { 'baustellen.auftragseingang': false } };
    zeige();
    expect(await screen.findByText('AN-2026-0007')).toBeInTheDocument();
    expect(getEingangZu).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Aus Eingang/ })).toBeNull();
  });
});

describe('Ein Angebot ansehen', () => {
  it('zeigt Positionen, Summen und Anmerkungen', async () => {
    zeige();
    const positionen = (await screen.findByText(/Positionen \(2\)/)).closest('section')!;
    expect(within(positionen).getByText('Facharbeiterstunden')).toBeInTheDocument();
    expect(within(positionen).getByText('Geberit Duofix')).toBeInTheDocument();
    expect(within(positionen).getByText(/16 h ×/)).toBeInTheDocument();
    expect(within(positionen).getByText('Brutto').nextSibling).toHaveTextContent(/1.845,48/);
    expect(screen.getByText(/WC im Erdgeschoss tauschen/)).toBeInTheDocument();
  });

  it('Titel mit der Summe ihrer Positionen, Text ohne Beträge, Rabatt an der Position (M18)', async () => {
    angebot = {
      ...ANGEBOT,
      positions: [
        { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
        { label: 'Waschtisch', qty: 2, unit: 'Stk', unitPrice: 100, netto: 180, rabattProzent: 10 },
        { art: 'text', label: 'Fliesen bauseits', qty: 0, unit: '', unitPrice: 0, netto: 0 },
        { label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 300 },
      ],
    };
    zeige();
    // Gezählt werden die Positionen, nicht Titel und Text.
    const positionen = (await screen.findByText(/Positionen \(2\)/)).closest('section')!;
    expect(within(positionen).getByText('Bad')).toBeInTheDocument();
    expect(within(positionen).getByText(/Summe € 480,00/)).toBeInTheDocument();
    expect(within(positionen).getByText('Fliesen bauseits')).toBeInTheDocument();
    expect(within(positionen).getByText(/2 Stk × € 100,00, abzüglich 10 % Rabatt/)).toBeInTheDocument();
  });

  /*
    PLANLINIE (E30): die Positionen als Stückliste — laufende Nummer nur für
    Positionen, die Bruttosumme unter der Doppellinie, die Angebotsnummer als
    Stempel neben dem Titel.
  */
  it('stellt die Positionen als Stückliste mit Pos-Spalte und Summe dar (Planlinie)', async () => {
    angebot = {
      ...ANGEBOT,
      positions: [
        { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
        { label: 'Waschtisch', qty: 2, unit: 'Stk', unitPrice: 100, netto: 180, rabattProzent: 10 },
        { art: 'text', label: 'Fliesen bauseits', qty: 0, unit: '', unitPrice: 0, netto: 0 },
        { label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 300 },
      ],
    };
    zeige();
    const positionen = (await screen.findByText(/Positionen \(2\)/)).closest('section')!;
    const tabelle = within(positionen).getByRole('table');
    expect(within(tabelle).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Pos', 'Bezeichnung', 'Netto']);
    const zeilen = within(tabelle).getAllByRole('row').map((r) => r.querySelector('td.pos')?.textContent ?? null);
    // Kopf, Titel, Waschtisch, Text, WC, dann die Summen: nur Positionen sind nummeriert.
    expect(zeilen.slice(0, 5)).toEqual([null, '', '01', '', '02']);
    expect(within(positionen).getByText('Brutto').closest('tr')).toHaveClass('summe');
    expect(within(positionen).getByText('Netto', { selector: 'td' }).closest('tr')).not.toHaveClass('summe');
    expect(screen.getByRole('heading', { level: 1, name: 'Angebot' })).toBeInTheDocument();
    expect(screen.getByText(ANGEBOT.quoteNumber, { selector: '.stempel' })).toBeInTheDocument();
  });

  it('verlinkt Kunde und — nach der Annahme — die Baustelle', async () => {
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007', projectId: 'p9' };
    zeige();
    expect(await screen.findByRole('link', { name: 'Gemeinde Neudorf' })).toHaveAttribute(
      'href',
      '/customers/k1',
    );
    expect(screen.getByRole('link', { name: 'B-2026-0007' })).toHaveAttribute(
      'href',
      '/admin-projects/p9',
    );
  });

  it('gibt beiden Links die volle Tastfläche (Prüflauf 25.09.2026, P4-09)', async () => {
    // Alleinstehende Links waren nur so hoch wie ihre Zeile (20 px).
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007', projectId: 'p9' };
    zeige();
    const kunde = await screen.findByRole('link', { name: 'Gemeinde Neudorf' });
    expect(kunde.className).toMatch(/\bmin-h-touch\b/);
    expect(screen.getByRole('link', { name: 'B-2026-0007' }).className).toMatch(/\bmin-h-touch\b/);
  });

  it('sagt „gibt es nicht“, statt einen Ladefehler vorzutäuschen', async () => {
    angebot = null;
    zeige();
    expect(await screen.findByText(/gibt es nicht \(mehr\)/)).toBeInTheDocument();
  });

  it('warnt, wenn die Bindefrist eines offenen Angebots abgelaufen ist', async () => {
    angebot = { ...ANGEBOT, validUntil: '2020-01-01' };
    zeige();
    // E72: im Seitenkopf kurz „abgelaufen“ wie in der Liste; der Verlauf sagt es ausführlich.
    expect(await screen.findByText('abgelaufen')).toBeInTheDocument();
    expect(screen.getByText(/Die Bindefrist ist abgelaufen/)).toBeInTheDocument();
  });
});

describe('Das PDF', () => {
  it('geht mit der Anschrift aus dem Kundenstamm hinaus', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText(/Positionen \(2\)/);
    await nutzer.click(screen.getByRole('button', { name: /PDF herunterladen/ }));
    expect(pdf).toHaveBeenCalledTimes(1);
    const o = pdf.mock.calls[0][0] as { quote: Quote; kunde: Customer };
    expect(o.quote.quoteNumber).toBe('AN-2026-0007');
    expect(o.kunde.address).toBe('Rathausplatz 1, 2700 Wiener Neustadt');
  });

  it('ein versendetes Angebot mit den Firmendaten seines Versands (24.10.2026)', async () => {
    angebot = { ...ANGEBOT, ausstellerStand: 'st-1' } as typeof ANGEBOT;
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText(/Positionen \(2\)/);
    await nutzer.click(screen.getByRole('button', { name: /PDF herunterladen/ }));
    await waitFor(() => expect(pdf).toHaveBeenCalledTimes(1));
    expect((pdf.mock.calls[0][0] as { company: { bankName?: string } }).company.bankName).toBe('Alte Bank');
  });

  it('wartet, wenn der Kunde nicht geladen werden konnte — statt an die falsche Anschrift', async () => {
    kundeScheitert = true;
    zeige();
    expect(await screen.findByText(/Anschrift des Kunden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF herunterladen/ })).toBeDisabled();
  });
});

describe('Weiter mit dem Angebot', () => {
  it('nimmt an und legt die Baustelle an', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Annehmen → Baustelle' }));
    // Erst die Rückfrage (Launch-Check, M8) — vorher legte der Klick allein an.
    expect(annehmen).not.toHaveBeenCalled();
    await nutzer.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annehmen' }));
    expect(annehmen).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Baustelle B-2026-0007 angelegt')).toBeInTheDocument();
  });

  // Runde 6, G15: eine ersetzte Fassung ist erledigt — kein Annehmen mehr.
  it('zeigt eine ersetzte Fassung als ersetzt, ohne „Annehmen“ (G15)', async () => {
    angebot = { ...ANGEBOT, status: 'Ersetzt' };
    zeige();
    expect(await screen.findByText('Eine andere Fassung dieses Angebots wurde angenommen.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annehmen → Baustelle' })).toBeNull();
  });

  it('nimmt nicht an, wenn die neue Fassung schon angenommen ist — und sagt welche (G15)', async () => {
    fassungen = [{ ...ANGEBOT, id: 'neu', quoteNumber: 'AN-2026-0008', status: 'Angenommen', vorgaengerId: ANGEBOT.id }];
    zeige();
    expect(await screen.findByText(/Die Fassung AN-2026-0008 ist schon angenommen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annehmen → Baustelle' })).toBeNull();
  });

  it('sagt im Dialog, dass die offene neue Fassung danach ersetzt ist (G15)', async () => {
    fassungen = [{ ...ANGEBOT, id: 'neu', quoteNumber: 'AN-2026-0008', status: 'Entwurf', vorgaengerId: ANGEBOT.id }];
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText(/AN-2026-0008/);
    await nutzer.click(await screen.findByRole('button', { name: 'Annehmen → Baustelle' }));
    expect(within(await screen.findByRole('dialog')).getByText(/Damit gilt AN-2026-0008 als ersetzt/)).toBeInTheDocument();
  });

  it('vermerkt die Ablehnung — seit A5 erst nach der Rückfrage', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await mehrMenue(nutzer, 'Als abgelehnt markieren');
    const dialog = await screen.findByRole('dialog', { name: 'Als abgelehnt markieren?' });
    expect(updateQuote).not.toHaveBeenCalled();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Als abgelehnt markieren' }));
    await waitFor(() => expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, { status: 'Abgelehnt' }));
  });

  /*
    BEWUSST ANGEPASST (M01d): hier stand „löscht einen Entwurf nach Rückfrage
    und kehrt zur Liste zurück“. Aus dem harten Löschen ist das Verwerfen in
    den Papierkorb geworden; geschützt bleibt, dass es nur nach Rückfrage
    geschieht — und jetzt auch, dass NICHT gelöscht wird.
  */
  it('verwirft einen Entwurf nach Rückfrage in den Papierkorb — gelöscht wird nichts', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    const nutzer = userEvent.setup();
    zeige();
    await mehrMenue(nutzer, 'Verwerfen');
    const dialog = await screen.findByRole('dialog', { name: 'Entwurf verwerfen?' });
    expect(dialog).toHaveTextContent(/kommt in den Papierkorb/);
    expect(dialog).toHaveTextContent(/Einstellungen · Papierkorb lässt es sich wiederherstellen/);
    expect(updateQuote).not.toHaveBeenCalled();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Verwerfen' }));
    expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, { status: 'Verworfen' });
    expect(deleteQuote).not.toHaveBeenCalled();
  });

  // Befund 09.11.2026: der Eingang, aus dem der Entwurf stammt, steht in der Rückfrage. Gegenprobe: ohne die Änderung fehlt er.
  it('stammt der Entwurf aus einem Eingang, nennt die Rückfrage ihn', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    ausEingang = { id: 'e1', nummer: 'EG-2026-0005' };
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByRole('link', { name: /Aus Eingang EG-2026-0005/ });
    await mehrMenue(nutzer, 'Verwerfen');
    const dialog = await screen.findByRole('dialog', { name: 'Entwurf verwerfen?' });
    expect(dialog).toHaveTextContent(/aus dem Eingang EG-2026-0005: Er bleibt übernommen und lässt sich dort wieder öffnen/);
  });

  it('im Papierkorb: nur lesen, „Wiederherstellen“ als einziger Schritt — kein PDF, kein „⋯“', async () => {
    angebot = {
      ...ANGEBOT, status: 'Verworfen', verworfenAm: Date.parse('2026-11-02T09:00:00+01:00'), verworfenVonName: 'Paul Projektleiter',
    };
    const nutzer = userEvent.setup();
    zeige();
    expect(await screen.findByText(/verworfen von Paul Projektleiter am 02\.11\.2026/)).toBeInTheDocument();
    expect(screen.getAllByText('Im Papierkorb').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /PDF herunterladen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Weitere Aktionen/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Annehmen|versendet/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Zum Papierkorb' })).toHaveAttribute('href', '/settings/papierkorb');
    await nutzer.click(screen.getByRole('button', { name: 'Wiederherstellen' }));
    expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, { status: 'Entwurf' });
  });

  it('im Papierkorb, wenn inzwischen eine andere Fassung angenommen ist: kein Wiederherstellen, aber der Grund', async () => {
    angebot = { ...ANGEBOT, status: 'Verworfen', verworfenAm: Date.parse('2026-11-02T09:00:00+01:00'), vorgaengerId: VORGAENGER.id };
    vorgaengerStand = 'Angenommen';
    zeige();
    expect(await screen.findByText(/Die Fassung AN-2026-0003 ist inzwischen angenommen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wiederherstellen' })).toBeNull();
  });

  it('im Papierkorb sieht die Buchhaltung es nur — ohne Wiederherstellen', async () => {
    rolle.wert = 'Buchhaltung';
    angebot = { ...ANGEBOT, status: 'Verworfen', verworfenAm: Date.parse('2026-11-02T09:00:00+01:00') };
    zeige();
    await screen.findByText(/Positionen \(/);
    expect(screen.queryByRole('button', { name: 'Wiederherstellen' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Zum Papierkorb' })).toBeNull();
  });

  it('führt einen Entwurf zum Bearbeiten — ein versendetes Angebot nicht', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    const { unmount } = zeige();
    expect(await screen.findByRole('link', { name: 'Bearbeiten' }))
      .toHaveAttribute('href', `/quotes?bearbeiten=${ANGEBOT.id}`);
    unmount();

    angebot = { ...ANGEBOT, status: 'Versendet' };
    zeige();
    await screen.findByRole('button', { name: /Annehmen/ });
    expect(screen.queryByRole('link', { name: 'Bearbeiten' })).not.toBeInTheDocument();
  });

  it('bietet ein angenommenes Angebot nicht noch einmal zum Annehmen an', async () => {
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007' };
    zeige();
    // Gewartet wird auf den Kartentitel „Positionen (2)“ — „Positionen“ allein steht auch in der Sprungleiste.
    await screen.findByText(/Positionen \(/);
    expect(screen.queryByRole('button', { name: /Annehmen/ })).toBeNull();
    // Ansehen und PDF bleiben.
    expect(screen.getByRole('button', { name: /PDF herunterladen/ })).toBeEnabled();
  });

  it('lässt die Buchhaltung ansehen, aber nichts ändern', async () => {
    rolle.wert = 'Buchhaltung';
    zeige();
    await screen.findByText(/Positionen \(/);
    expect(screen.queryByRole('button', { name: /Annehmen/ })).toBeNull();
    // Auch das „⋯“ mit Ablehnen, Kopieren und Löschen gibt es für sie nicht.
    expect(screen.queryByRole('button', { name: /^Weitere Aktionen/ })).toBeNull();
    expect(screen.getByRole('button', { name: /PDF herunterladen/ })).toBeEnabled();
  });
});

/*
  TESTBERICHT 30.09.2026, M17 — überarbeiten ohne zu ändern: neue Fassung
  oder Kopie, und die Fassungen verweisen aufeinander.
*/
describe('Fassungen eines Angebots (M17)', () => {
  it('bietet beim versendeten Angebot „Neue Fassung“ und „Als Kopie anlegen“ an', async () => {
    const nutzer = userEvent.setup();
    zeige();
    expect(await screen.findByRole('link', { name: 'Neue Fassung' })).toHaveAttribute(
      'href', `/quotes?neueFassung=${ANGEBOT.id}`,
    );
    // Die Kopie steht seit der Linie „Lot“ im „⋯“ und führt an dieselbe Adresse.
    await mehrMenue(nutzer, 'Als Kopie anlegen');
    expect(await screen.findByText(`Angebotsliste?kopie=${ANGEBOT.id}`)).toBeInTheDocument();
  });

  it('Gegenprobe: ein Entwurf wird bearbeitet, nicht neu gefasst', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    zeige();
    expect(await screen.findByRole('link', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neue Fassung' })).toBeNull();
  });

  it('verweist auf den Vorgänger und auf spätere Fassungen', async () => {
    angebot = { ...ANGEBOT, vorgaengerId: VORGAENGER.id };
    fassungen = [{ ...ANGEBOT, id: '88888888-2222-3333-4444-555555555555', quoteNumber: 'AN-2026-0009', status: 'Entwurf' }];
    zeige();
    expect(await screen.findByRole('link', { name: 'AN-2026-0003' })).toHaveAttribute('href', `/quotes/${VORGAENGER.id}`);
    expect(screen.getByRole('link', { name: 'AN-2026-0009 (Entwurf)' })).toBeInTheDocument();
  });
});

/*
  LINIE „LOT“ (Protokoll E7): die Akte beginnt mit der Zusammenfassung, der
  Verlauf steht als Lot, und der nächste Schritt hängt am Punkt, an dem das
  Angebot gerade steht. Seltenes liegt im „⋯“ des Seitenkopfs.
*/
describe('Die Akte auf der Linie „Lot“', () => {
  it('beginnt mit den Kennzahlen — Arbeitszeit und Bindefrist — vor den Positionen', async () => {
    zeige();
    const positionen = (await screen.findByText(/Positionen \(2\)/)).closest('section')!;
    const kennzahl = screen.getByText('Kalk. Stunden');
    expect(kennzahl.nextElementSibling).toHaveTextContent('16 h');
    expect(screen.getByText('Gültig bis').nextElementSibling).toHaveTextContent('01.10.2099');
    // Im Dokument vor den Positionen: am Handy steht sie zuerst.
    expect(kennzahl.compareDocumentPosition(positionen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('zeigt den Verlauf als Lot: das versendete Angebot steht „jetzt“ beim Versand, mit dem nächsten Schritt', async () => {
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    const punkte = within(lot).getAllByRole('listitem');
    expect(punkte.map((p) => p.querySelector('.lot-titel')?.textContent)).toEqual(['Angebot erstellt', 'Versendet']);
    expect(punkte[1]).toHaveAttribute('aria-current', 'step');
    expect(within(punkte[1]).getByText('Wartet auf die Antwort des Kunden.')).toBeInTheDocument();
    expect(within(punkte[1]).getByRole('button', { name: 'Annehmen → Baustelle' })).toBeInTheDocument();
  });

  it('Gegenprobe: ein angenommenes Angebot hat keinen „jetzt“-Punkt und keinen Schritt mehr', async () => {
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007' };
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    expect(within(lot).getByText('Angenommen')).toBeInTheDocument();
    expect(within(lot).getByText('Baustelle B-2026-0007')).toBeInTheDocument();
    expect(lot.querySelector('[aria-current]')).toBeNull();
    expect(within(lot).queryByRole('button')).toBeNull();
  });

  /*
    SEIT 12.10.2026 (17 G): die Datenbank hält fest, wann versendet,
    angenommen oder abgelehnt wurde. Gegenprobe: ein älteres Angebot ohne
    diese Zeitpunkte zeigt keinen erfundenen Tag (die beiden Prüfungen
    darüber bleiben wie sie waren).
  */
  it('nennt den Tag des Versands und der Annahme — der Versand bleibt als eigener Punkt', async () => {
    angebot = {
      ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007',
      versendetAm: Date.UTC(2026, 9, 3, 10), angenommenAm: Date.UTC(2026, 9, 9, 10),
    };
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    const punkte = within(lot).getAllByRole('listitem');
    expect(punkte.map((p) => p.querySelector('.lot-titel')?.textContent)).toEqual(['Angebot erstellt', 'Versendet', 'Angenommen']);
    expect(within(punkte[1]).getByText('03.10.2026')).toBeInTheDocument();
    expect(within(punkte[2]).getByText('09.10.2026')).toBeInTheDocument();
  });

  it('beim versendeten Angebot: Tag des Versands und Bindefrist in einer Zeile', async () => {
    angebot = { ...ANGEBOT, versendetAm: Date.UTC(2026, 9, 3, 10) };
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    expect(within(lot).getByText('am 03.10.2026 · gültig bis 01.10.2099')).toBeInTheDocument();
  });

  it('ein abgelehntes nennt den Tag der Ablehnung', async () => {
    angebot = { ...ANGEBOT, status: 'Abgelehnt', abgelehntAm: Date.UTC(2026, 9, 7, 10) };
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    const punkte = within(lot).getAllByRole('listitem');
    expect(punkte.map((p) => p.querySelector('.lot-titel')?.textContent)).toEqual(['Angebot erstellt', 'Abgelehnt']);
    expect(within(punkte[1]).getByText('07.10.2026')).toBeInTheDocument();
  });

  it('nennt die abgelaufene Bindefrist auch am Punkt im Verlauf', async () => {
    angebot = { ...ANGEBOT, validUntil: '2020-01-01' };
    zeige();
    const lot = await screen.findByRole('list', { name: 'Verlauf des Angebots' });
    expect(within(lot).getByText(/Die Bindefrist ist abgelaufen\./)).toBeInTheDocument();
  });

  // BEWUSST ANGEPASST (M01d): „Löschen“ heißt beim Entwurf jetzt „Verwerfen“; was geschützt ist, bleibt — nur beim Entwurf.
  it('legt die seltenen Aktionen je Status ins „⋯“ — Verwerfen nur beim Entwurf', async () => {
    const nutzer = userEvent.setup();
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    const { unmount } = zeige();
    await nutzer.click(await screen.findByRole('button', { name: /^Weitere Aktionen für Angebot AN-2026-0007/ }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Als abgelehnt markieren', 'Als Kopie anlegen', 'Verwerfen',
    ]);
    unmount();

    // Gegenprobe: angenommen bleiben die Kopie und (seit A1) die Rücknahme der Annahme.
    angebot = { ...ANGEBOT, status: 'Angenommen', projectNumber: 'B-2026-0007' };
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: /^Weitere Aktionen für Angebot AN-2026-0007/ }));
    // Seit A1 (Durchsicht 15.11.2026) mit dem Rückweg aus der Annahme; seit F16 geht es auf Wunsch noch einmal per Mail.
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Annahme zurücknehmen', 'Per Mail senden …', 'Als Kopie anlegen']);
  });

  it('führt mit der Sprungleiste zu den Abschnitten der Akte', async () => {
    zeige();
    const leiste = await screen.findByRole('navigation', { name: 'Auf dieser Seite' });
    const ziele = within(leiste).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(ziele).toEqual(['#angebot-verlauf', '#angebot-angaben', '#angebot-positionen', '#angebot-anmerkungen']);
    for (const z of ziele) expect(document.querySelector(z!)).not.toBeNull();
  });
});

/*
  LIEGENSCHAFT AM ANGEBOT (M02c): unter den Angaben, mit Weg zur Akte —
  nur mit der Unterfähigkeit; ohne sie steht dort nichts (die Daten bleiben).
*/
describe('Liegenschaft am Angebot (M02c)', () => {
  it('mit der Unterfähigkeit: Liegenschaft und Top mit Weg zur Akte', async () => {
    authWert.company = { id: 'perl', name: 'Perl Installationen', modules: { 'kunden.liegenschaften': true } };
    angebot = { ...ANGEBOT, liegenschaftId: 'l1', topId: 't2', liegenschaftBezeichnung: 'WHA Schulgasse 2', topBezeichnung: 'Top 2' };
    zeige();
    expect(await screen.findByRole('link', { name: 'WHA Schulgasse 2 · Top 2' })).toHaveAttribute('href', '/liegenschaften/l1');
  });

  it('ohne sie keine Angabe', async () => {
    angebot = { ...ANGEBOT, liegenschaftId: 'l1', liegenschaftBezeichnung: 'WHA Schulgasse 2' };
    zeige();
    expect(await screen.findByText('Ort der Leistung')).toBeInTheDocument();
    expect(screen.queryByText(/WHA Schulgasse 2/)).toBeNull();
  });
});

/*
  ANNAHME ZURÜCKNEHMEN (Durchsicht 15.11.2026, A1 / F7). Ein angenommenes
  Angebot hatte keinen Rückweg — das „⋯“ bot nur „Als Kopie anlegen“.
*/
describe('Annahme zurücknehmen (A1)', () => {
  const ANGENOMMEN = {
    ...ANGEBOT, status: 'Angenommen' as const, projectNumber: 'PR-2026-0007', projectId: 'p7',
    versendetAm: Date.parse('2026-09-02T08:00:00Z'), angenommenAm: Date.parse('2026-09-05T08:00:00Z'),
  };

  it('fragt mit Pflichtgrund, sagt die Folge für die Baustelle und nimmt dann zurück', async () => {
    angebot = { ...ANGENOMMEN };
    verwendung = { ...LEER, angebote: [{ id: ANGEBOT.id, nummer: 'AN-2026-0007', status: 'Angenommen' }] };
    const nutzer = userEvent.setup();
    zeige();
    await mehrMenue(nutzer, 'Annahme zurücknehmen');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ist danach wieder versendet/)).toBeInTheDocument();
    expect(await within(dialog).findByText('Die Baustelle PR-2026-0007 wird gelöscht — an ihr hängt sonst nichts.')).toBeInTheDocument();
    const knopf = within(dialog).getByRole('button', { name: 'Annahme zurücknehmen' });
    expect(knopf).toBeDisabled();
    await nutzer.type(within(dialog).getByLabelText(/Grund/), 'Kunde ist zurückgetreten');
    await nutzer.click(knopf);
    await waitFor(() => expect(zuruecknehmen).toHaveBeenCalledWith(ANGEBOT.id, 'Kunde ist zurückgetreten'));
    expect(await screen.findByText(/Annahme zurückgenommen — AN-2026-0007 ist wieder versendet\. Baustelle PR-2026-0007 gelöscht\./)).toBeInTheDocument();
  });

  it('hängt etwas an der Baustelle, sagt die Rückfrage: abgeschlossen, nicht gelöscht', async () => {
    angebot = { ...ANGENOMMEN };
    verwendung = { ...LEER, zeitbuchungen: 2, einsaetze: 1, angebote: [{ id: ANGEBOT.id, nummer: 'AN-2026-0007', status: 'Angenommen' }] };
    const nutzer = userEvent.setup();
    zeige();
    await mehrMenue(nutzer, 'Annahme zurücknehmen');
    expect(await screen.findByText(/wird abgeschlossen, nicht gelöscht: an ihr hängen 2 Zeitbuchungen und 1 Einsatz/)).toBeInTheDocument();
  });

  /*
    EIN NACHTRAG (A3) wird nur von seiner Baustelle gelöst. Gegenprobe: vorher
    stand hier „Die Baustelle … wird gelöscht“ — die Rückfrage fragte nach
    dem, was an der Baustelle hängt, und die Meldung verschwieg die Folge.
  */
  it('ein Nachtrag: die Rückfrage sagt „gelöst, Budget sinkt“, nicht „gelöscht“ — und die Meldung ebenso', async () => {
    angebot = { ...ANGENOMMEN, nachtrag: true };
    verwendung = { ...LEER, angebote: [{ id: ANGEBOT.id, nummer: 'AN-2026-0007', status: 'Angenommen' }] };
    zuruecknehmen.mockResolvedValueOnce({ status: 'Versendet', baustelle: 'PR-2026-0007', baustelleId: null, ergebnis: 'nachtrag_entfernt', wiederOffen: [] });
    const nutzer = userEvent.setup();
    zeige();
    await mehrMenue(nutzer, 'Annahme zurücknehmen');
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Der Nachtrag wird von Baustelle PR-2026-0007 gelöst, ihr Stundenbudget sinkt um 16 h. Die Baustelle selbst bleibt, wie sie ist.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/wird gelöscht/)).toBeNull();
    await nutzer.type(within(dialog).getByLabelText(/Grund/), 'Nachtrag doppelt erfasst');
    await nutzer.click(within(dialog).getByRole('button', { name: 'Annahme zurücknehmen' }));
    expect(await screen.findByText(/Annahme zurückgenommen — AN-2026-0007 ist wieder versendet\. Nachtrag von Baustelle PR-2026-0007 gelöst\./)).toBeInTheDocument();
  });

  it('der Verlauf nennt die Rücknahme mit ihrem Grund', async () => {
    angebot = {
      ...ANGEBOT, status: 'Versendet', versendetAm: Date.parse('2026-09-02T08:00:00Z'),
      annahmeZurueckgenommenAm: Date.parse('2026-09-06T08:00:00Z'), annahmeZurueckgenommenGrund: 'Falsche Fassung angenommen',
    };
    zeige();
    expect(await screen.findByText('Annahme zurückgenommen')).toBeInTheDocument();
    expect(screen.getByText('Grund: Falsche Fassung angenommen')).toBeInTheDocument();
  });

  it('bleibt gleich: ein versendetes Angebot bietet keine Rücknahme an', async () => {
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: /^Weitere Aktionen für Angebot AN-2026-0007/ }));
    expect(screen.queryByRole('menuitem', { name: 'Annahme zurücknehmen' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Als abgelehnt markieren' })).toBeInTheDocument();
  });
});

/*
  VERSENDEN ERST MIT POSITION, RÜCKFRAGE UND RÜCKWEG (Durchsicht 15.11.2026,
  A5). Ein Tipp machte einen leeren Entwurf zum versendeten Angebot — ohne
  Rückfrage und ohne Weg zurück.
*/
describe('Versenden und der Weg zurück (A5)', () => {
  it('ein leerer Entwurf wird nicht versendet: die Rückfrage sagt warum, ein Annahme-Link wird nicht angeboten', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf', positions: [] };
    const nutzer = userEvent.setup();
    zeige();
    expect(await screen.findByText(/Noch ohne Position — versenden und verlinken geht erst mit einer/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annahme-Link' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Als versendet markieren' }));
    const dialog = await screen.findByRole('dialog', { name: 'Als versendet markieren?' });
    expect(within(dialog).getByText(/hat noch keine Position/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Als versendet markieren' })).toBeDisabled();
    expect(updateQuote).not.toHaveBeenCalled();
  });

  it('mit Position: erst nach der Rückfrage versendet', async () => {
    angebot = { ...ANGEBOT, status: 'Entwurf' };
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Als versendet markieren' }));
    const dialog = await screen.findByRole('dialog', { name: 'Als versendet markieren?' });
    expect(within(dialog).getByText(/Zurück in den Entwurf geht, solange kein Annahme-Link geöffnet wurde/)).toBeInTheDocument();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Als versendet markieren' }));
    // Seit A12 kommt das Angebotsdatum mit, wenn es zurückliegt (eigene Prüfung unten).
    await waitFor(() => expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, expect.objectContaining({ status: 'Versendet' })));
  });

  it('versendet, Link nie geöffnet: „Zurück in den Entwurf“ — geöffnet: nicht mehr', async () => {
    const nutzer = userEvent.setup();
    const r = zeige();
    await mehrMenue(nutzer, 'Zurück in den Entwurf');
    const dialog = await screen.findByRole('dialog', { name: 'Zurück in den Entwurf?' });
    await nutzer.click(within(dialog).getByRole('button', { name: 'Zurück in den Entwurf' }));
    await waitFor(() => expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, { status: 'Entwurf' }));
    r.unmount();

    const { listAngebotLinks } = await import('@/lib/db/angebotLinks');
    vi.mocked(listAngebotLinks).mockResolvedValueOnce([{
      id: 'l1', quoteId: ANGEBOT.id, abrechnung: 'Pauschal', praefix: 'PB', gueltigBis: '2099-01-01',
      schnappschussHash: 'a'.repeat(64), erzeugtAm: 1, geoeffnetAnzahl: 1, zuerstGeoeffnetAm: 2, zustand: 'offen',
    }]);
    zeige();
    await screen.findByText(/Geöffnet am/);
    await nutzer.click(screen.getByRole('button', { name: /^Weitere Aktionen für Angebot AN-2026-0007/ }));
    expect(screen.queryByRole('menuitem', { name: 'Zurück in den Entwurf' })).toBeNull();
  });

  it('eine im Büro vermerkte Ablehnung lässt sich zurücknehmen — zurück auf „Versendet“', async () => {
    angebot = { ...ANGEBOT, status: 'Abgelehnt', versendetAm: Date.parse('2026-09-02T08:00:00Z') };
    const nutzer = userEvent.setup();
    zeige();
    await mehrMenue(nutzer, 'Ablehnung zurücknehmen');
    const dialog = await screen.findByRole('dialog', { name: 'Ablehnung zurücknehmen?' });
    expect(within(dialog).getByText(/ist danach wieder versendet/)).toBeInTheDocument();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Ablehnung zurücknehmen' }));
    await waitFor(() => expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, { status: 'Versendet' }));
  });
});

/* A8: die Arbeitsangaben aus dem Eingang stehen beim Angebot. */
describe('Angaben vor Ort (A8)', () => {
  it('zeigt Ansprechpartner, Dringlichkeit und Wunschtermin — ohne sie keine leeren Zeilen', async () => {
    angebot = { ...ANGEBOT, ansprechpartnerName: 'Frau Huber', ansprechpartnerTelefon: '0664 555', dringlichkeit: 'notfall', wunschtermin: '2026-11-20' };
    const r = zeige();
    expect(await screen.findByText('Frau Huber · 0664 555')).toBeInTheDocument();
    expect(screen.getByText('Notfall')).toBeInTheDocument();
    expect(screen.getByText('20.11.2026')).toBeInTheDocument();
    r.unmount();
    angebot = { ...ANGEBOT };
    zeige();
    await screen.findByText('Ort der Leistung');
    expect(screen.queryByText('Ansprechpartner vor Ort')).toBeNull();
    expect(screen.queryByText('Wunschtermin')).toBeNull();
  });
});

/* A12: das Angebotsdatum — beim Versand auf heute, wenn es zurückliegt. */
describe('Angebotsdatum beim Versand (A12)', () => {
  it('bietet „auf heute setzen“ an und schickt Datum und verschobene Bindefrist mit dem Versand', async () => {
    const { todayStr } = await import('@/lib/time');
    angebot = { ...ANGEBOT, status: 'Entwurf', quoteDate: '2020-01-01', validUntil: '2020-01-31' };
    const nutzer = userEvent.setup();
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: 'Als versendet markieren' }));
    const dialog = await screen.findByRole('dialog', { name: 'Als versendet markieren?' });
    expect(within(dialog).getByRole('checkbox', { name: /Angebotsdatum auf heute setzen \(statt 01\.01\.2020\)/ })).toBeChecked();
    await nutzer.click(within(dialog).getByRole('button', { name: 'Als versendet markieren' }));
    await waitFor(() => expect(updateQuote).toHaveBeenCalledWith(ANGEBOT.id, expect.objectContaining({
      status: 'Versendet', quoteDate: todayStr(),
    })));
  });
});
