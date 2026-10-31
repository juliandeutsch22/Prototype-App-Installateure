import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';
import type { MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import AdminOrdersView from '@/features/orders/AdminOrdersView';

/**
 * Anforderungen — der zweite Schritt des Materialablaufs, die Seite der
 * Projektleitung.
 *
 * Hier liegt die einzige Stelle, an der ein Klick den LAGERBESTAND
 * VERÄNDERT: der Übergang auf „Erledigt". Deshalb hängt der wichtigste Test
 * daran, dass dieser eine Übergang durch die Rückfrage geht und jeder andere
 * nicht — eine Rückfrage bei jedem Statuswechsel wäre nach dem dritten Mal
 * weggeklickt, und dann wirkt auch die vierte nicht mehr.
 */

function anforderung(p: Partial<MaterialOrder> & { id: string }): WithId<MaterialOrder> {
  return {
    companyId: 'perl',
    materialName: 'Kupferrohr 15mm',
    quantity: 2,
    status: 'Offen',
    transactionType: 'order',
    userId: 'u1',
    userName: 'Max Mustermann',
    createdAt: { toDate: () => new Date('2026-09-01T08:00:00Z') },
    ...p,
  } as unknown as WithId<MaterialOrder>;
}

let anforderungen: WithId<MaterialOrder>[] = [];
let ladefehler: string | null = null;

const statusSetzen = vi.fn();
const loeschen = vi.fn();
const eiligSetzen = vi.fn();

/* Mit welcher ABFRAGE-Grenze zuletzt abonniert wurde. */
let letzteHolgrenze = 0;
/* Wie oft abonniert wurde — ein veralteter Stand holt neu (R7-M3). */
let abos = 0;

/** Ältere Anforderungen, die nur die Suche auf dem Server kennt (17 I). */
let nurAufDemServer: WithId<MaterialOrder>[] = [];
/** Wie der Server: dieselben Felder, über alle Anforderungen. */
const sucheAnforderungen = vi.fn(async (_c: string, begriff: string) =>
  [...anforderungen, ...nurAufDemServer].filter((o) =>
    [o.materialName, o.userName, o.projectNumber, o.note].some((v) => v?.toLowerCase().includes(begriff.toLowerCase()))));

vi.mock('@/lib/db/materialOrders', () => ({
  ORDER_STATUS_FLOW: ['Offen', 'In Bearbeitung', 'Abholbereit', 'Erledigt'],
  ANFORDERUNG_TREFFER: 100,
  sucheAnforderungen: (c: string, b: string) => sucheAnforderungen(c, b),
  subscribeAllOrders: (
    _c: string,
    max: number,
    cb: (rows: WithId<MaterialOrder>[]) => void,
    onError: (e: Error) => void,
  ) => {
    letzteHolgrenze = max;
    abos += 1;
    if (ladefehler) onError(new Error(ladefehler));
    else cb(anforderungen);
    return () => undefined;
  },
  updateOrderStatus: (...a: unknown[]) => statusSetzen(...a),
  deleteOrder: (...a: unknown[]) => loeschen(...a),
  anforderungEiligSetzen: (...a: unknown[]) => eiligSetzen(...a),
  createReturn: (...a: unknown[]) => retoureAnlegen(...a),
}));

const retoureAnlegen = vi.fn<(...a: unknown[]) => Promise<string>>(async () => 'r1');
vi.mock('@/lib/db/materials', async (echt) => ({
  ...(await echt<typeof import('@/lib/db/materials')>()),
  sucheKatalog: async () => [{ id: 'm1', companyId: 'perl', name: 'Kupferrohr 15mm', unit: 'm', stock: 3 }],
}));
vi.mock('@/lib/db/projects', async (echt) => ({
  ...(await echt<typeof import('@/lib/db/projects')>()),
  listActiveProjects: async () => [],
  listRecentProjects: async () => [],
  listProjectsByNumbers: async () => [],
}));

const ausLager = vi.fn();
const aufEinkaufsliste = vi.fn();
let vorschlag: string | null = null;
let lagerPosten: unknown[] = [];
let lagerFehler = false;
const grosshaendler = [
  { id: 'gh1', companyId: 'perl', name: 'Holter', active: true, bestellEmail: 'vertreter@holter.test' },
  { id: 'gh2', companyId: 'perl', name: 'Frauenthal', active: true },
];
vi.mock('@/lib/db/einkauf', () => ({
  listGrosshaendler: () => Promise.resolve(grosshaendler),
  ausLager: (...a: unknown[]) => ausLager(...a),
  aufEinkaufsliste: (...a: unknown[]) => aufEinkaufsliste(...a),
  lieferantVorschlag: () => Promise.resolve(vorschlag),
  katalogFuer: () => Promise.resolve(new Map()),
  alsBestelltMarkieren: vi.fn(),
  geliefert: vi.fn(),
  grosshaendlerSpeichern: vi.fn(),
  grosshaendlerZuordnen: vi.fn(),
  vonEinkaufslisteNehmen: vi.fn(),
  listLagerPosten: () =>
    lagerFehler ? Promise.reject(new Error('weg')) : Promise.resolve(lagerPosten),
  lagerPostenAnlegen: vi.fn(),
  lagerPostenBestellt: vi.fn(),
  lagerPostenLoeschen: vi.fn(),
  lagerPostenZuordnen: vi.fn(),
  artikelSuchen: () => Promise.resolve([]),
}));

const authWert = {
  user: { uid: 'pl', companyId: 'perl', name: 'Planer', role: 'Projektleiter' as const },
  company: { id: 'perl', name: 'Perl Installationen' },
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

/* Die Belegschaft für „Zurückgebracht von“ (A4, 24.10.2026). */
let belegschaft: Promise<unknown[]> | null = null;
const belegschaftLaden = vi.fn(() => belegschaft ?? Promise.resolve([
  { uid: 'pl', name: 'Planer', active: true },
  { uid: 'm7', name: 'Max Monteur', active: true },
  { uid: 'alt', name: 'Ausgeschieden', active: false },
]));
vi.mock('@/lib/db/users', () => ({ listUsers: () => belegschaftLaden() }));

function zeige() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AdminOrdersView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 2, 9, 0, 0));
  anforderungen = [];
  nurAufDemServer = [];
  sucheAnforderungen.mockClear();
  ladefehler = null;
  statusSetzen.mockReset();
  statusSetzen.mockResolvedValue({ art: 'geaendert' });
  loeschen.mockReset();
  loeschen.mockResolvedValue(undefined);
  eiligSetzen.mockReset();
  eiligSetzen.mockResolvedValue(undefined);
  ausLager.mockReset();
  ausLager.mockResolvedValue(true);
  aufEinkaufsliste.mockReset();
  aufEinkaufsliste.mockResolvedValue(true);
  abos = 0;
  vorschlag = null;
  lagerPosten = [];
  lagerFehler = false;
  belegschaft = null;
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Die Anforderung im Seitenfenster öffnen — die Zeile selbst ist antippbar
 * (Linie „Lot“, E4). Bis zum Umbau lagen Status und Löschen im „⋯“ der Zeile.
 */
async function oeffnen(name: RegExp | string = /^Kupferrohr 15mm/) {
  const muster = typeof name === 'string' ? new RegExp(`^${name}`) : name;
  await userEvent.click(await screen.findByRole('button', { name: muster }));
  return screen.findByRole('dialog', { name: 'Anforderung' });
}

/** Den Status von Hand setzen — im Seitenfenster, wie vorher im „⋯“ (D11). */
async function statusWaehlen(status: string) {
  const fenster = await oeffnen();
  await userEvent.click(within(fenster).getByRole('button', { name: `Auf „${status}“ setzen` }));
}

/** Ein Bereich der Seite — seit dem Umbau Segmente statt Reiter. */
const bereich = (name: RegExp | string) => screen.findByRole('button', { name });

describe('Nachträglich eilig (17 F)', () => {
  it('im Seitenfenster: „Als eilig markieren“ — und bei einer eiligen „Nicht mehr eilig“', async () => {
    anforderungen = [anforderung({ id: 'o1', projectNumber: '2026-042' })];
    zeige();
    let fenster = await oeffnen();
    await userEvent.click(within(fenster).getByRole('button', { name: 'Als eilig markieren' }));
    await waitFor(() => expect(eiligSetzen).toHaveBeenCalledWith('o1', true));

    anforderungen = [anforderung({ id: 'o2', projectNumber: '2026-042', isUrgent: true, materialName: 'Dichtung' })];
    eiligSetzen.mockClear();
    zeige();
    fenster = await oeffnen('Dichtung');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Nicht mehr eilig' }));
    await waitFor(() => expect(eiligSetzen).toHaveBeenCalledWith('o2', false));
  });

  it('ohne Baustelle kein Knopf — die übrigen Grenzen prüft `eiligMoeglich` (Einheit)', async () => {
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();
    const fenster = await oeffnen();
    expect(within(fenster).queryByRole('button', { name: /eilig/i })).toBeNull();
  });
});

describe('Anforderungen — der Abschluss zieht vom Lager ab', () => {
  it('fragt vor „Erledigt“ nach und bucht erst nach der Bestätigung', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'Abholbereit' })];
    zeige();

    await statusWaehlen('Erledigt');

    expect(await screen.findByText(/vom Lagerbestand abgezogen/)).toBeInTheDocument();
    expect(statusSetzen).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abschließen' }));
    // Mit dem Stand, den die Ansicht gesehen hat (R7-M3).
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith(
      'o1', 'Erledigt', { von: 'Abholbereit', trotzFehlbestand: false }));
  });

  it('bucht nichts, wenn die Rückfrage abgebrochen wird', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'Abholbereit' })];
    zeige();

    await statusWaehlen('Erledigt');
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(statusSetzen).not.toHaveBeenCalled();
  });

  it('schaltet jeden ANDEREN Status ohne Rückfrage durch', async () => {
    /**
     * Eine Rückfrage bei jedem Schritt wäre nach dem dritten Mal reflexhaft
     * weggeklickt — und dann schützt auch die vierte nicht mehr. Nur der
     * Schritt, der Bestand bewegt, fragt nach.
     */
    anforderungen = [anforderung({ id: 'o1', status: 'Offen' })];
    zeige();

    await statusWaehlen('In Bearbeitung');
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith(
      'o1', 'In Bearbeitung', { von: 'Offen', trotzFehlbestand: false }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Status: In Bearbeitung')).toBeInTheDocument();
  });

  it('meldet einen gescheiterten Statuswechsel, statt ihn zu verschlucken', async () => {
    // Ohne Meldung sprang der Status nicht um und der Nutzer sah nichts —
    // er hielt die Anforderung für erledigt.
    statusSetzen.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    anforderungen = [anforderung({ id: 'o1', status: 'Offen' })];
    zeige();

    await statusWaehlen('In Bearbeitung');
    expect(await screen.findByText(/konnte nicht geändert werden/)).toBeInTheDocument();
  });
});

/*
  RUNDE 7, R7-M2: „Abholbereit“ von Hand ging an der Lagerprüfung vorbei.
  Jetzt antwortet die Datenbank mit den Zahlen; übersteuert wird nur nach
  einer Rückfrage, die sie nennt.
*/
describe('Anforderungen — „Abholbereit“ von Hand nur mit freiem Bestand (R7-M2)', () => {
  const FEHLT = { art: 'fehlbestand', bestand: 10, zugesagt: 10, frei: 0, angefordert: 2, einheit: 'Stk' };

  it('fragt mit den Zahlen nach, statt abholbereit zu melden — und übersteuert erst nach der Bestätigung', async () => {
    statusSetzen.mockResolvedValueOnce(FEHLT);
    anforderungen = [anforderung({ id: 'o1', status: 'Offen' })];
    zeige();
    await statusWaehlen('Abholbereit');

    const dialog = await screen.findByRole('dialog', { name: 'Trotz Fehlbestand abholbereit?' });
    const zahl = (wort: string) => within(dialog).getByText(wort).nextElementSibling?.textContent;
    expect(zahl('Im Regal')).toBe('10 Stk');
    expect(zahl('Schon zugesagt')).toBe('10 Stk');
    expect(zahl('Frei')).toBe('0 Stk');
    expect(zahl('Angefordert')).toBe('2 Stk');
    expect(statusSetzen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Status: Abholbereit')).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Trotzdem abholbereit' }));
    await waitFor(() => expect(statusSetzen).toHaveBeenLastCalledWith(
      'o1', 'Abholbereit', { von: 'Offen', trotzFehlbestand: true }));
    expect(await screen.findByText(/trotz Fehlbestand, im Verlauf vermerkt/)).toBeInTheDocument();
  });

  it('Gegenprobe: abgebrochen bleibt es beim einen, abgewiesenen Versuch', async () => {
    statusSetzen.mockResolvedValueOnce(FEHLT);
    anforderungen = [anforderung({ id: 'o1', status: 'Offen' })];
    zeige();
    await statusWaehlen('Abholbereit');
    const dialog = await screen.findByRole('dialog', { name: 'Trotz Fehlbestand abholbereit?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(statusSetzen).toHaveBeenCalledTimes(1);
    expect(statusSetzen.mock.calls[0][2]).toEqual({ von: 'Offen', trotzFehlbestand: false });
  });

  it('zeigt die Übersteuerung im Verlauf — wer, wann, mit den Zahlen', async () => {
    anforderungen = [anforderung({
      id: 'o1', status: 'Abholbereit',
      lagerUebersteuert: [{
        am: '2026-09-02T07:30:00+00:00', von: 'u9', name: 'Vera Verwaltung',
        bestand: 10, zugesagt: 10, frei: 0, angefordert: 2, einheit: 'Stk',
      }],
    })];
    zeige();
    const fenster = await oeffnen();
    const verlauf = within(fenster).getByRole('list', { name: 'Verlauf der Anforderung' });
    expect(within(verlauf).getByText('Abholbereit trotz Fehlbestand')).toBeInTheDocument();
    expect(within(verlauf).getByText('Vera Verwaltung · im Regal 10, zugesagt 10, frei 0, angefordert 2 Stk')).toBeInTheDocument();
  });
});

/*
  RUNDE 7, R7-M3 (Altbefund F14, T080/T081): traf ein Statuswechsel nichts
  mehr, weil jemand anderes schneller war, meldete die Ansicht trotzdem
  Erfolg. Jetzt: ein Hinweis und der neue Stand.
*/
describe('Anforderungen — kein Erfolg für einen veralteten Stand (R7-M3)', () => {
  it('Status von Hand: Hinweis statt „Status: …“, und die Liste wird neu geholt', async () => {
    statusSetzen.mockResolvedValueOnce({ art: 'veraltet' });
    anforderungen = [anforderung({ id: 'o1', status: 'Offen' })];
    zeige();
    await statusWaehlen('In Bearbeitung');
    expect(await screen.findByText(/Inzwischen von jemand anderem geändert/)).toBeInTheDocument();
    expect(screen.queryByText('Status: In Bearbeitung')).not.toBeInTheDocument();
    await waitFor(() => expect(abos).toBeGreaterThan(1));
  });

  it('„Aus Lager“, das nichts mehr traf: Hinweis statt „abholbereit“', async () => {
    ausLager.mockResolvedValueOnce(false);
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /^Aus Lager: Kupferrohr 15mm/ }));
    expect(await screen.findByText(/Inzwischen von jemand anderem geändert/)).toBeInTheDocument();
    expect(screen.queryByText(/aus dem Lager — abholbereit/)).not.toBeInTheDocument();
  });

  it('„Abgeholt“, das schon gebucht war: Hinweis statt Erfolg', async () => {
    statusSetzen.mockResolvedValueOnce({ art: 'veraltet' });
    anforderungen = [anforderung({ id: 'o1', status: 'Abholbereit' })];
    zeige();
    await statusWaehlen('Erledigt');
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Abschließen' }));
    expect(await screen.findByText(/Inzwischen von jemand anderem geändert/)).toBeInTheDocument();
    expect(screen.queryByText('Status: Erledigt')).not.toBeInTheDocument();
  });

  it('gleich geblieben: was traf, meldet weiter Erfolg', async () => {
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: /^Aus Lager: Kupferrohr 15mm/ }));
    expect(await screen.findByText('Kupferrohr 15mm: aus dem Lager — abholbereit')).toBeInTheDocument();
    expect(abos).toBe(1);
  });
});

describe('Anforderungen — Reiter und Abzeichen widersprechen sich nicht', () => {
  it('nennt den Reiter „Laufend“, weil er mehr zählt als das „offen“ im Menü', async () => {
    // Prüflauf 24.09.2026, F13: Menü „1 offene", Reiter „Offen 3".
    anforderungen = [
      anforderung({ id: 'a', status: 'Offen' }),
      anforderung({ id: 'b', status: 'In Bearbeitung' }),
      anforderung({ id: 'c', status: 'Abholbereit' }),
    ];
    zeige();
    // Geschützt bleibt der Name. Seit Runde 6 (G6) ohne Zahl: „Laufend“ ist Bestand (E26).
    expect(await bereich(/^Laufend$/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^Offen\s*\d/ })).not.toBeInTheDocument();
  });
});

/*
  DIE LISTENLEISTE WIE ÜBER JEDER LISTE (Testbericht Runde 6, G6; E26).
  Gegenprobe: mit der alten Anordnung (Bereiche gestreckt über der Seite,
  Suche erst ab zehn Anforderungen, Baustelle allein in der Karte) schlagen
  die ersten drei fehl; die beiden letzten halten fest, was gleich bleibt.
*/
describe('Anforderungen — eine Listenleiste (Runde 6, G6)', () => {
  it('Bereiche, Suche und Baustelle stehen in einer Leiste, die Bereiche links', async () => {
    anforderungen = [anforderung({ id: 'o1', projectNumber: '2026-042' })];
    const { container } = zeige();
    const feld = await screen.findByRole('combobox', { name: 'Bestellungen nach Baustelle filtern' });
    const leiste = feld.closest('.listenleiste')!;
    expect(leiste).not.toBeNull();
    expect(leiste.firstElementChild).toHaveClass('listenleiste-reiter');
    expect(within(leiste as HTMLElement).getByRole('group', { name: 'Bereich' })).toBeInTheDocument();
    expect(within(leiste as HTMLElement).getByRole('searchbox', { name: 'Suche' })).toBeInTheDocument();
    expect(feld.closest('.listenleiste-zusatz')).not.toBeNull();
    expect(container.querySelectorAll('.listenleiste')).toHaveLength(1);
  });

  it('sucht auch bei wenigen Anforderungen — und findet', async () => {
    anforderungen = [
      anforderung({ id: 'o1', materialName: 'Kugelhahn' }),
      anforderung({ id: 'o2', materialName: 'Muffe', userName: 'Erna Beispiel' }),
    ];
    zeige();
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Suche' }), 'Erna');
    await waitFor(() => expect(screen.queryByText('Kugelhahn')).toBeNull());
    expect(screen.getByText('Muffe')).toBeInTheDocument();
  });

  it('„Laufend“ und „Retouren“ ohne Zahl — sie zählen Bestand', async () => {
    anforderungen = [
      anforderung({ id: 'a', status: 'Offen' }),
      anforderung({ id: 'r', status: 'Erledigt', transactionType: 'return', condition: 'neu' }),
    ];
    zeige();
    expect(await bereich('Laufend')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retouren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erledigt' })).toBeInTheDocument();
  });

  it('gleich geblieben: „Einkauf“ zählt weiter, was zu bestellen ist; dort keine Suche und keine Baustelle', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'In Bearbeitung', beschaffung: 'einkauf', supplierId: 'gh1', projectNumber: '2026-042' })];
    zeige();
    await userEvent.click(await bereich(/^Einkauf 1$/));
    expect(await screen.findByText('Zu bestellen')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Bereich' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Bestellungen nach Baustelle filtern' })).toBeNull();
  });

  it('gleich geblieben: bei den Retouren keine Auswahl der Baustelle', async () => {
    anforderungen = [
      anforderung({ id: 'o1', projectNumber: '2026-042' }),
      anforderung({ id: 'r', status: 'Erledigt', transactionType: 'return', condition: 'neu', projectNumber: '2026-042' }),
    ];
    zeige();
    await userEvent.click(await bereich('Retouren'));
    expect(await screen.findByRole('searchbox', { name: 'Suche' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Bestellungen nach Baustelle filtern' })).toBeNull();
  });
});

/*
  DER ZUSTAND IN DER FESTEN SPALTE (E27; Runde 6, G6): unter „Erledigt“
  standen „Eil“ und die Herkunft hinter dem Zustand und schoben ihn je Zeile
  hin und her. Gegenprobe: mit den Marken rechts hinter dem Zustand folgt
  ihm nicht der Pfeil, und „aus Lager“ steht nicht im Namen.
*/
describe('Anforderungen — „Erledigt“ mit dem Zustand an fester Stelle', () => {
  it('rechts nur der Zustand vor dem Pfeil, Eil und Herkunft beim Namen', async () => {
    anforderungen = [
      anforderung({ id: 'a', materialName: 'Kugelhahn', status: 'Erledigt', isUrgent: true, beschaffung: 'lager' }),
      anforderung({ id: 'b', materialName: 'Muffe', status: 'Erledigt' }),
    ];
    render(
      <MemoryRouter initialEntries={['/anforderungen?reiter=erledigt']}>
        <ToastProvider>
          <AdminOrdersView />
        </ToastProvider>
      </MemoryRouter>,
    );
    const knopf = await screen.findByRole('button', { name: /^Kugelhahn/ });
    expect(within(knopf).getByText('aus Lager')).toBeInTheDocument();
    expect(within(knopf).getByText('Eil')).toBeInTheDocument();
    for (const zeile of document.querySelectorAll('li.zeile')) {
      const zustand = zeile.querySelector('.zeile-zustand')!;
      expect(zustand.nextElementSibling).toHaveClass('zeile-pfeil');
    }
  });
});

describe('Anforderungen — die Reihenfolge der Arbeit', () => {
  it('stellt Eilzustellungen an den Anfang ihrer Gruppe', async () => {
    /**
     * Eine Eilzustellung ging zwischen zwanzig gewöhnlichen Zeilen unter,
     * obwohl genau sie den Anlass zum Handeln gibt.
     */
    anforderungen = [
      anforderung({ id: 'a', materialName: 'Gewöhnlich', status: 'Offen',
        createdAt: { toDate: () => new Date('2026-09-01T07:00:00Z') } as never }),
      anforderung({ id: 'b', materialName: 'Eilig', status: 'Offen', isUrgent: true,
        createdAt: { toDate: () => new Date('2026-09-01T09:00:00Z') } as never }),
    ];
    zeige();

    const zeilen = await screen.findAllByRole('listitem');
    expect(within(zeilen[0]).getByText('Eilig')).toBeInTheDocument();
  });

  it('trennt die Arbeitsschritte in eigene Gruppen', async () => {
    // Vorher lagen Offen, In Bearbeitung und Abholbereit in einer Liste — man
    // musste jede Zeile lesen, um zu wissen, was als Nächstes zu tun ist.
    anforderungen = [
      anforderung({ id: 'a', status: 'Offen' }),
      anforderung({ id: 'b', status: 'Abholbereit' }),
    ];
    zeige();

    // Nur die Gruppenüberschriften (h3), nicht der Kartentitel darüber.
    const gruppen = await screen.findAllByRole('heading', { level: 3 });
    // Seit der Planlinie (E30) steht die Anzahl im Achskreis VOR dem Titel;
    // geprüft werden weiter Reihenfolge, Name und Anzahl der Gruppen.
    const titel = gruppen.map((h) => (h.textContent ?? '').replace(/[·\s]/g, ''));
    expect(titel).toEqual(['1Offen', '1Abholbereit']);
  });

  it('hält Erledigtes und Retouren aus dem offenen Reiter heraus', async () => {
    anforderungen = [
      anforderung({ id: 'a', status: 'Erledigt' }),
      anforderung({ id: 'b', status: 'Offen', transactionType: 'return', condition: 'neu' }),
    ];
    zeige();

    expect(await screen.findByText('Aktuell keine offenen Bestellungen.')).toBeInTheDocument();
  });

  it('führt eine Retoure unter Retouren, auch wenn ihr Status „Offen“ lautet', async () => {
    // Die Zuordnung hängt am transactionType, nicht am Status. Liefe sie über
    // den Status, verschwände eine Retoure aus beiden Reitern.
    anforderungen = [
      anforderung({ id: 'b', status: 'Offen', transactionType: 'return', condition: 'neu' }),
    ];
    zeige();

    await userEvent.click(await bereich(/^Retouren/));
    expect(await screen.findByText('Neu / OVP', { exact: false })).toBeInTheDocument();
  });

  it('bietet einer Retoure keine Statusauswahl an', async () => {
    // Sie ist bei der Erfassung bereits abgeschlossen und gebucht. Ein
    // zweites „Erledigt" darüber wäre ein zweiter Lagerzugriff.
    anforderungen = [
      anforderung({ id: 'b', status: 'Erledigt', transactionType: 'return', condition: 'neu' }),
    ];
    zeige();

    await userEvent.click(await bereich(/^Retouren/));
    await screen.findByText('Neu / OVP', { exact: false });
    // Im Seitenfenster steht kein Status zur Wahl — nur das Löschen.
    const fenster = await oeffnen();
    expect(within(fenster).queryByRole('button', { name: /setzen$/ })).toBeNull();
    expect(within(fenster).getByRole('button', { name: /Anforderung löschen/ })).toBeInTheDocument();
  });
});

describe('Anforderungen — die Notiz des Monteurs', () => {
  it('steht in einer eigenen Zeile, mit „Notiz:“ davor', async () => {
    /*
      GEMELDET: „die Notiz wird nirgends angezeigt". Sie hing im selben Grau
      an Name und Baustelle und ging darin unter.
    */
    anforderungen = [anforderung({ id: 'o1', note: 'Bitte bis Donnerstag', projectNumber: 'B-2026-0001' })];
    zeige();

    const notiz = await screen.findByText('Bitte bis Donnerstag', { exact: false });
    expect(notiz.tagName).toBe('SPAN');
    expect(notiz).toHaveTextContent(/^Notiz: Bitte bis Donnerstag$/);
    expect(notiz.className).toMatch(/\bblock\b/);
  });

  it('lässt die Zeile weg, wenn es keine Notiz gibt', async () => {
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();
    await screen.findByText('Kupferrohr 15mm');
    expect(screen.queryByText(/Notiz:/)).toBeNull();
  });
});

describe('Anforderungen — suchen und filtern', () => {
  it('durchsucht Material, Besteller, Baustelle und Notiz', async () => {
    anforderungen = Array.from({ length: 10 }, (_, i) =>
      anforderung({ id: `o${i}`, materialName: `Ding ${i}`, userName: i === 3 ? 'Erna Beispiel' : 'Max' }),
    );
    zeige();

    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'Erna');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByText('Ding 3')).toBeInTheDocument();
  });

  it('sagt bei einer erfolglosen Suche, wonach gesucht wurde', async () => {
    anforderungen = Array.from({ length: 10 }, (_, i) => anforderung({ id: `o${i}` }));
    zeige();

    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'Wasserhahn');
    expect(await screen.findByText(/Gesucht wurde „.+“ in Material, Person und Baustelle\./)).toBeInTheDocument();
  });

  /*
    SUCHE ÜBER ALLE ANFORDERUNGEN (17 I). Gegenprobe: mit der alten Suche im
    Geladenen schlagen beide fehl; die beiden Prüfungen darüber bleiben, wie
    sie waren.
  */
  it('findet im Archiv auch eine Anforderung jenseits der geladenen — und öffnet sie im Seitenfenster', async () => {
    anforderungen = Array.from({ length: 10 }, (_, i) => anforderung({ id: `o${i}`, materialName: `Ding ${i}`, status: 'Erledigt' }));
    nurAufDemServer = [anforderung({ id: 'alt', materialName: 'Uralt-Ventil', status: 'Erledigt', userName: 'Erna Beispiel' })];
    render(
      <MemoryRouter initialEntries={['/anforderungen?reiter=erledigt']}>
        <ToastProvider>
          <AdminOrdersView />
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'Uralt');
    expect(await screen.findByText('Uralt-Ventil')).toBeInTheDocument();
    expect(sucheAnforderungen).toHaveBeenLastCalledWith('perl', 'Uralt');
    const fenster = await oeffnen(/^Uralt-Ventil/);
    expect(within(fenster).getAllByText(/Erna Beispiel/).length).toBeGreaterThan(0);
    // Während gesucht wird, geht es über alle — kein „Weitere laden“.
    expect(screen.queryByRole('button', { name: /Weitere Anforderungen laden/ })).toBeNull();
  });

  it('ist die Suche über alle nicht erreichbar, sagt sie es — und sucht im Geladenen', async () => {
    sucheAnforderungen.mockRejectedValueOnce(new Error('offline'));
    anforderungen = Array.from({ length: 10 }, (_, i) =>
      anforderung({ id: `o${i}`, materialName: `Ding ${i}`, userName: i === 3 ? 'Erna Beispiel' : 'Max' }));
    zeige();
    await userEvent.type(await screen.findByRole('searchbox', { name: /Suche/ }), 'E');
    expect(await screen.findByText(/Die Suche über alle Anforderungen ist gerade nicht erreichbar/)).toBeInTheDocument();
    expect(screen.getByText('Ding 3')).toBeInTheDocument();
  });

});

describe('Anforderungen — löschen', () => {
  it('löscht erst nach der Rückfrage', async () => {
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();

    const fenster = await oeffnen();
    await userEvent.click(within(fenster).getByRole('button', { name: /Anforderung löschen/ }));
    expect(loeschen).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog', { name: /Eintrag löschen/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loeschen).toHaveBeenCalledWith('o1'));
  });
});

describe('Anforderungen — wenn das Laden scheitert', () => {
  it('zeigt den Fehler, statt „nichts angefordert“ zu behaupten', async () => {
    ladefehler = 'Fehlende Berechtigung';
    zeige();
    expect(await screen.findByText(/Fehlende Berechtigung/)).toBeInTheDocument();
    expect(screen.queryByText('Aktuell keine offenen Bestellungen.')).not.toBeInTheDocument();
  });
});

/**
 * ZWEI GRENZEN, DIE LEICHT ZU VERWECHSELN SIND.
 *
 * „Weitere anzeigen" im Archiv hebt die ANZEIGE-Grenze an: es zeigt mehr von
 * dem, was schon geladen ist. Die ABFRAGE-Grenze stand fest bei zweihundert
 * und liess sich gar nicht anheben.
 *
 * Aufgefallen ist das erst beim Archiv: es wächst mit jeder erledigten
 * Anforderung, und ab der zweihundertsten fehlten die ältesten. Die Suche
 * fand sie nicht, und nichts unterschied das von „gibt es nicht" — derselbe
 * Fehler wie bei den Baustellen im September, nur eine Ansicht weiter.
 */
describe('Anforderungen — wie weit die Abfrage reicht', () => {
  const viele = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ({
        id: `o${i}`,
        companyId: 'perl',
        materialName: `Artikel ${i}`,
        quantity: 1,
        // Der Reiter „aktiv“ ist die Vorgabe und zeigt nur Offene.
        status: 'Offen',
        userId: 'u1',
        userName: 'Max Mustermann',
        projectNumber: '2026-001',
      }) as unknown as WithId<MaterialOrder>,
    );

  it('holt mit der Grenze, nicht unbegrenzt', async () => {
    anforderungen = viele(3);
    zeige();
    await screen.findByText(/Artikel 0/);
    expect(letzteHolgrenze).toBe(200);
  });

  it('schweigt, solange die Grenze nicht greift', async () => {
    anforderungen = viele(3);
    zeige();
    await screen.findByText(/Artikel 0/);
    expect(
      screen.queryByRole('button', { name: /Weitere Anforderungen laden/ }),
    ).not.toBeInTheDocument();
  });

  it('sagt es, sobald die Grenze erreicht ist, und holt dann mehr', async () => {
    anforderungen = viele(200);
    const nutzer = userEvent.setup();
    zeige();
    await screen.findByText(/Artikel 0/);

    // Seit 12.10.2026 (17 I) sucht die Suche über alle — der frühere Satz „nur in diesen gesucht“ wäre falsch.
    expect(screen.getByText(/200 von möglicherweise mehr geladen\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/nur in diesen gesucht/)).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: /Weitere Anforderungen laden/ }));
    expect(letzteHolgrenze).toBe(400);
  });
});

/**
 * DER LAGERIST HAKT AB. „Aus Lager" macht die Anforderung abholbereit (der
 * Monteur bekommt seine Meldung), „Nicht auf Lager" schickt sie auf die
 * Einkaufsliste. Beides nur, solange noch niemand nachgesehen hat.
 */
describe('Anforderungen — Lager oder Einkauf', () => {
  it('„Aus Lager“ bucht die Zeile als Lagerware', async () => {
    anforderungen = [anforderung({ id: 'o1', materialId: 'm1' })];
    zeige();
    // Der Knopf in der Zeile nennt für die Vorlesehilfe auch die Anforderung.
    await userEvent.click(await screen.findByRole('button', { name: /^Aus Lager: Kupferrohr 15mm/ }));
    await waitFor(() => expect(ausLager).toHaveBeenCalledWith('o1', 'Offen'));
    expect(aufEinkaufsliste).not.toHaveBeenCalled();
  });

  it('„Nicht auf Lager“ fragt nach dem Großhändler — mit Vorschlag aus dem Katalog', async () => {
    vorschlag = 'gh2';
    anforderungen = [anforderung({ id: 'o1', materialId: 'm1' })];
    zeige();
    // Seit dem Umbau im Seitenfenster der Anforderung.
    await userEvent.click(within(await oeffnen()).getByRole('button', { name: 'Nicht auf Lager – auf die Einkaufsliste' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Großhändler')).toHaveValue('gh2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Großhändler'), 'gh1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Auf die Liste' }));
    await waitFor(() => expect(aufEinkaufsliste).toHaveBeenCalledWith('o1', 'gh1', 'Offen'));
  });

  it('lässt den Großhändler offen, wenn „später zuordnen“ gewählt ist', async () => {
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();
    await userEvent.click(within(await oeffnen()).getByRole('button', { name: 'Nicht auf Lager – auf die Einkaufsliste' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Großhändler')).toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Auf die Liste' }));
    await waitFor(() => expect(aufEinkaufsliste).toHaveBeenCalledWith('o1', null, 'Offen'));
  });

  it('bietet beides nicht mehr an, sobald entschieden ist — und zeigt, wie', async () => {
    anforderungen = [
      anforderung({ id: 'o1', materialName: 'Aus dem Regal', status: 'Abholbereit', beschaffung: 'lager' }),
      anforderung({ id: 'o2', materialName: 'Beim Händler', status: 'In Bearbeitung',
        beschaffung: 'einkauf', supplierId: 'gh1', bestelltAm: Date.now() as never }),
    ];
    zeige();
    await screen.findByText('Aus dem Regal');
    expect(screen.queryByRole('button', { name: /^Aus Lager/ })).not.toBeInTheDocument();
    expect(screen.getByText('aus Lager')).toBeInTheDocument();
    expect(await screen.findByText('bestellt · Holter')).toBeInTheDocument();
  });

  it('zählt im Reiter „Einkauf“, was noch zu bestellen ist', async () => {
    anforderungen = [
      anforderung({ id: 'o1', status: 'In Bearbeitung', beschaffung: 'einkauf', supplierId: 'gh1' }),
      anforderung({ id: 'o2', status: 'In Bearbeitung', beschaffung: 'einkauf', supplierId: 'gh1',
        bestelltAm: Date.now() as never }),
    ];
    zeige();
    expect(await bereich(/^Einkauf 1$/)).toBeInTheDocument();
    await userEvent.click(await bereich(/^Einkauf/));
    expect(await screen.findByText('Zu bestellen')).toBeInTheDocument();
    expect(screen.getByText('Bestellt — noch nicht da')).toBeInTheDocument();
  });
  it('zählt eigenes Material des Büros im Reiter mit und zeigt es auf der Liste', async () => {
    lagerPosten = [
      { id: 'p1', companyId: 'perl', materialName: 'Kupferrohr 15', menge: 25, einheit: 'm', supplierId: 'gh1' },
      { id: 'p2', companyId: 'perl', materialName: 'Muffe', menge: 5, supplierId: 'gh1', bestelltAm: Date.now() },
    ];
    zeige();
    expect(await bereich(/^Einkauf 1$/)).toBeInTheDocument();
    await userEvent.click(await bereich(/^Einkauf/));
    expect(await screen.findByText('25 m × Kupferrohr 15')).toBeInTheDocument();
    expect(screen.getByText(/fürs Lager/)).toBeInTheDocument();
  });

  it('sagt, wenn das eigene Material nicht geladen werden konnte', async () => {
    lagerFehler = true;
    zeige();
    await userEvent.click(await bereich(/^Einkauf/));
    expect(await screen.findByText(/eigene Material auf der Einkaufsliste konnte nicht geladen werden/)).toBeInTheDocument();
  });
});

describe('Anforderungen — eine ruhige Zeile (Prüflauf 24.09.2026, D11; Linie „Lot“, E4)', () => {
  it('trägt genau einen Knopf für den nächsten Schritt und legt alles andere ins Seitenfenster', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'Offen' })];
    zeige();
    const zeile = (await screen.findByRole('button', { name: /^Aus Lager: Kupferrohr/ })).closest('li')!;
    // In der Zeile: das Kästchen, der Inhalt, EIN Schritt — kein „⋯“, kein Löschen.
    expect(within(zeile).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? 'Inhalt'))
      .toEqual(['Inhalt', 'Aus Lager: Kupferrohr 15mm ×2']);
    expect(within(zeile).queryByRole('button', { name: /Weitere Aktionen/ })).toBeNull();

    const fenster = await oeffnen();
    const knoepfe = within(fenster).getAllByRole('button').map((b) => b.textContent);
    // Der aktuelle Status steht nicht zur Wahl, alle anderen schon; Löschen zuletzt.
    expect(knoepfe).not.toContain('Auf „Offen“ setzen');
    expect(knoepfe).toContain('Auf „Erledigt“ setzen');
    expect(knoepfe).toContain('Nicht auf Lager – auf die Einkaufsliste');
    expect(knoepfe[knoepfe.length - 1]).toBe('Anforderung löschen …');
  });

  /*
    RUNDE 6, HINWEIS 7: „Abholbereit“ stand ohne Zeitpunkt im Verlauf, und
    welche Zeile „seit über 3 Tagen“ zählt, war nicht nachzuprüfen.
  */
  it('nennt an der Zeile, seit wann abholbereit — der Tag, nach dem gezählt wird (Hinweis 7)', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'Abholbereit', abholbereitSeit: new Date(2026, 7, 28, 15, 0).getTime() as never })];
    zeige();
    const zeile = (await screen.findByText('Kupferrohr 15mm', { exact: false })).closest('li') as HTMLElement;
    expect(within(zeile).getByText(/abholbereit seit 28\.08\.2026/)).toBeInTheDocument();
  });

  it('zeigt im Verlauf einer erledigten Anforderung, wann sie abholbereit und wann erledigt wurde (Hinweis 7)', async () => {
    anforderungen = [anforderung({
      id: 'o1', status: 'Erledigt',
      abholbereitSeit: new Date(2026, 7, 28, 15, 0).getTime() as never,
      erledigtAm: new Date(2026, 8, 1, 7, 30).getTime() as never,
    })];
    render(
      <MemoryRouter initialEntries={['/anforderungen?reiter=erledigt']}>
        <ToastProvider>
          <AdminOrdersView />
        </ToastProvider>
      </MemoryRouter>,
    );
    const fenster = await oeffnen();
    const verlauf = within(fenster).getByRole('list', { name: 'Verlauf der Anforderung' });
    const punkte = within(verlauf).getAllByRole('listitem').map((l) => [
      l.querySelector('.lot-titel')?.textContent, l.querySelector('.lot-zeit')?.textContent ?? '',
    ]);
    expect(punkte.slice(-2)).toEqual([['Abholbereit', '28.08.2026, 15:00'], ['Erledigt', '01.09.2026, 07:30']]);
  });

  it('zeigt im Seitenfenster Notiz und Verlauf aus den Zeitstempeln', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'In Bearbeitung', note: 'Kiste im Keller',
      beschaffung: 'einkauf', supplierId: 'gh1', bestelltAm: new Date(2026, 8, 1, 10, 0).getTime() as never })];
    zeige();
    const fenster = await oeffnen();
    expect(within(fenster).getByText('Kiste im Keller')).toBeInTheDocument();
    const verlauf = within(fenster).getByRole('list', { name: 'Verlauf der Anforderung' });
    const punkte = within(verlauf).getAllByRole('listitem').map((l) => l.querySelector('.lot-titel')?.textContent);
    expect(punkte).toEqual(['Angefordert', 'Auf der Einkaufsliste', 'Beim Großhändler bestellt']);
    // Der jetzige Stand ist der letzte Punkt.
    expect(within(verlauf).getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'step');
  });
});

/*
  DIE SAMMELAKTION (Linie „Lot“, E4): mehrere Anforderungen auf einmal einen
  Schritt weiter — über DIESELBE Funktion der Datenschicht wie der Knopf in der
  Zeile, je Anforderung einzeln, Teilfehler je Zeile.
*/
describe('Anforderungen — mehrere auf einmal', () => {
  it('schaltet jede gewählte über dieselbe Funktion wie die Einzelaktion', async () => {
    anforderungen = [
      anforderung({ id: 'a', materialName: 'Rohr A', status: 'Offen' }),
      anforderung({ id: 'b', materialName: 'Rohr B', status: 'Offen' }),
      anforderung({ id: 'c', materialName: 'Rohr C', status: 'Offen' }),
    ];
    zeige();
    // Gegenprobe: ohne Auswahl keine Sammelleiste.
    await screen.findByText('Rohr A');
    expect(screen.queryByRole('button', { name: 'Alle: nächster Schritt' })).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: /Rohr A .* auswählen/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Rohr C .* auswählen/ }));
    expect(screen.getByText('2 ausgewählt')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Alle: nächster Schritt' }));

    await waitFor(() => expect(ausLager).toHaveBeenCalledTimes(2));
    expect(ausLager.mock.calls.map((c) => c[0])).toEqual(['a', 'c']);
    expect(statusSetzen).not.toHaveBeenCalled();
  });

  it('meldet einen Teilfehler an der Zeile und lässt nur sie gewählt', async () => {
    ausLager.mockImplementation(async (id: string) => {
      if (id === 'b') throw new Error('Nur 3 Stk frei.');
    });
    anforderungen = [
      anforderung({ id: 'a', materialName: 'Rohr A', status: 'Offen' }),
      anforderung({ id: 'b', materialName: 'Rohr B', status: 'Offen' }),
    ];
    zeige();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Rohr A .* auswählen/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Rohr B .* auswählen/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Alle: nächster Schritt' }));

    const fehler = await screen.findByText('Nur 3 Stk frei.', { selector: '[role="alert"]' });
    expect(fehler.closest('li')).toHaveTextContent('Rohr B');
    expect(screen.getByText('1 ausgewählt')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Rohr B .* auswählen/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Rohr A .* auswählen/ })).not.toBeChecked();
  });

  it('fragt vor gesammelten Abholungen nach, wie die Einzelaktion — und bucht erst danach', async () => {
    anforderungen = [
      anforderung({ id: 'a', materialName: 'Rohr A', status: 'Abholbereit' }),
      anforderung({ id: 'b', materialName: 'Rohr B', status: 'Offen' }),
    ];
    zeige();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Rohr A .* auswählen/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Rohr B .* auswählen/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Alle: nächster Schritt' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/„Rohr A“ ×2 wird als erledigt gebucht und vom Lagerbestand abgezogen/)).toBeInTheDocument();
    expect(statusSetzen).not.toHaveBeenCalled();
    expect(ausLager).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Weiterschalten' }));
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('a', 'Erledigt', { von: 'Abholbereit' }));
    expect(ausLager).toHaveBeenCalledWith('b', 'Offen');
  });

  it('nennt, was inzwischen jemand anderes weitergeschaltet hat — nicht als Erfolg (R7-M3)', async () => {
    anforderungen = [
      anforderung({ id: 'a', materialName: 'Rohr A', status: 'Offen' }),
      anforderung({ id: 'b', materialName: 'Rohr B', status: 'Offen' }),
    ];
    ausLager.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    zeige();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Rohr A .* auswählen/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Rohr B .* auswählen/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Alle: nächster Schritt' }));
    expect(await screen.findByText('1 Anforderung einen Schritt weiter — 1 hatte inzwischen jemand anderes geändert.')).toBeInTheDocument();
  });

  it('Gegenprobe: abgebrochen wird nichts gebucht', async () => {
    anforderungen = [anforderung({ id: 'a', materialName: 'Rohr A', status: 'Abholbereit' })];
    zeige();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Rohr A .* auswählen/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Alle: nächster Schritt' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Abbrechen' }));
    expect(statusSetzen).not.toHaveBeenCalled();
  });

  it('bietet Zeilen ohne nächsten Schritt kein Kästchen an', async () => {
    // Was über die Einkaufsliste läuft, wird im Reiter „Einkauf“ weitergeschaltet.
    anforderungen = [anforderung({ id: 'a', materialName: 'Beim Händler', status: 'In Bearbeitung',
      beschaffung: 'einkauf', supplierId: 'gh1' })];
    zeige();
    await screen.findByText('Beim Händler');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('Anforderungen — der Bereich steht in der Adresse', () => {
  function zeigeAn(adresse: string) {
    return render(
      <MemoryRouter initialEntries={[adresse]}>
        <ToastProvider>
          <AdminOrdersView />
        </ToastProvider>
      </MemoryRouter>,
    );
  }

  it('öffnet „Retouren“ aus der Adresse', async () => {
    zeigeAn('/anforderungen?reiter=retouren');
    expect(await bereich(/^Retouren/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('Gegenprobe: Unbekanntes landet bei „Laufend“', async () => {
    zeigeAn('/anforderungen?reiter=irgendwas');
    expect(await bereich(/^Laufend/)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Filter mit Namen (Prüflauf 25.09.2026, P4-07)', () => {
  it('nennt die Auswahl „Bestellungen nach Baustelle filtern“ — ohne Namen hieß sie für die Vorlesehilfe nur „Auswahl“', async () => {
    // Die Auswahl steht nur, wenn es Baustellen zum Filtern gibt.
    anforderungen = [anforderung({ id: 'o1', projectNumber: '2026-042' })];
    zeige();
    expect(await screen.findByRole('combobox', { name: 'Bestellungen nach Baustelle filtern' })).toBeInTheDocument();
  });
});

/*
  DAS LAGER ERFASST, WAS IHM JEMAND HEREINBRINGT (20.10.2026) — im Reiter
  „Retouren“, mit demselben Formular wie unter „Material anfordern“.
*/
describe('Anforderungen — Retoure erfassen im Lager', () => {
  /** Das Fenster öffnen und das Material wählen — bis vor „Zurückgebracht von“. */
  async function retoureBisPerson() {
    zeige();
    await userEvent.click(await bereich(/^Retouren/));
    await userEvent.click(screen.getByRole('button', { name: 'Retoure erfassen' }));
    const fenster = await screen.findByRole('dialog', { name: 'Material zurückgeben' });
    await userEvent.type(within(fenster).getByRole('searchbox', { name: /^Material/ }), 'Kupfer');
    await userEvent.click(await within(fenster).findByRole('button', { name: /Kupferrohr 15mm zurückgeben/ }));
    await userEvent.selectOptions(within(fenster).getByRole('combobox', { name: /Zustand/ }), 'gebraucht');
    return fenster;
  }

  it('erfasst auf die Person, die zurückgebracht hat — gewählt aus der aktiven Belegschaft (A4)', async () => {
    retoureAnlegen.mockClear();
    const fenster = await retoureBisPerson();
    const wer = within(fenster).getByRole('combobox', { name: 'Zurückgebracht von' });
    await waitFor(() => expect(within(wer).getByRole('option', { name: 'Max Monteur' })).toBeInTheDocument());
    // Wer ausgeschieden ist, steht nicht zur Wahl.
    expect(within(wer).queryByRole('option', { name: 'Ausgeschieden' })).toBeNull();
    await userEvent.selectOptions(wer, 'm7');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Retoure erfassen' }));
    await waitFor(() => expect(retoureAnlegen).toHaveBeenCalledTimes(1));
    expect(retoureAnlegen.mock.calls[0]).toEqual(['perl', expect.objectContaining({
      materialId: 'm1', quantity: 1, condition: 'gebraucht', userId: 'm7', userName: 'Max Monteur',
    })]);
  });

  it('Gegenprobe: ohne Wahl erfasst das Lager nicht still auf den eigenen Namen', async () => {
    retoureAnlegen.mockClear();
    const fenster = await retoureBisPerson();
    await within(fenster).findByRole('option', { name: 'Max Monteur' });
    expect(within(fenster).getByRole('button', { name: 'Retoure erfassen' })).toBeDisabled();
    // Bringt das Lager selbst zurück, wählt es sich.
    await userEvent.selectOptions(within(fenster).getByRole('combobox', { name: 'Zurückgebracht von' }), 'pl');
    await userEvent.click(within(fenster).getByRole('button', { name: 'Retoure erfassen' }));
    await waitFor(() => expect(retoureAnlegen).toHaveBeenCalledTimes(1));
    expect(retoureAnlegen.mock.calls[0][1]).toMatchObject({ userId: 'pl', userName: 'Planer' });
  });

  it('kommt die Belegschaft nicht, sagt es das Fenster und erfasst nichts', async () => {
    retoureAnlegen.mockClear();
    belegschaft = Promise.reject(new Error('Netz weg'));
    belegschaft.catch(() => undefined);
    const fenster = await retoureBisPerson();
    expect(await within(fenster).findByText(/Belegschaft konnte nicht geladen werden/)).toBeInTheDocument();
    expect(within(fenster).getByRole('button', { name: 'Retoure erfassen' })).toBeDisabled();
  });

  it('nennt an der Retoure, wer zurückgebracht und wer erfasst hat', async () => {
    anforderungen = [
      anforderung({
        id: 'b', status: 'Erledigt', transactionType: 'return', condition: 'neu',
        userId: 'm7', userName: 'Max Monteur', erfasstVon: 'pl', erfasstVonName: 'Planer',
      }),
    ];
    zeige();
    await userEvent.click(await bereich(/^Retouren/));
    const fenster = await oeffnen();
    expect(within(fenster).getByText('Zurückgebracht von').nextSibling).toHaveTextContent('Max Monteur');
    expect(within(fenster).getByText('Erfasst von').nextSibling).toHaveTextContent('Planer');
    expect(within(fenster).getByText(/Max Monteur, erfasst von Planer/)).toBeInTheDocument();
  });

  it('Gleichbleiben: die eigene Rückgabe und Anforderungen nennen keinen eigenen Erfasser', async () => {
    anforderungen = [
      anforderung({ id: 'a', userId: 'u1', erfasstVon: 'u1', erfasstVonName: 'Max Mustermann' }),
    ];
    zeige();
    const fenster = await oeffnen();
    expect(within(fenster).getByText('Angefordert von').nextSibling).toHaveTextContent('Max Mustermann');
    expect(within(fenster).queryByText('Erfasst von')).toBeNull();
  });

  it('Gleichbleiben: in den übrigen Reitern steht kein „Retoure erfassen“', async () => {
    zeige();
    await screen.findByText('Aktuell keine offenen Bestellungen.');
    expect(screen.queryByRole('button', { name: 'Retoure erfassen' })).toBeNull();
  });
});
