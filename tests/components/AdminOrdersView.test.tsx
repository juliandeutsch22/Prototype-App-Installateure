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

/* Mit welcher ABFRAGE-Grenze zuletzt abonniert wurde. */
let letzteHolgrenze = 0;

vi.mock('@/lib/db/materialOrders', () => ({
  ORDER_STATUS_FLOW: ['Offen', 'In Bearbeitung', 'Abholbereit', 'Erledigt'],
  subscribeAllOrders: (
    _c: string,
    max: number,
    cb: (rows: WithId<MaterialOrder>[]) => void,
    onError: (e: Error) => void,
  ) => {
    letzteHolgrenze = max;
    if (ladefehler) onError(new Error(ladefehler));
    else cb(anforderungen.slice(0, max));
    return () => undefined;
  },
  listOrdersPage: async (_c: string, suche: string, tab: string, vor?: { id: string }) => {
    letzteHolgrenze = 50;
    if (ladefehler) throw new Error(ladefehler);
    const q = suche.trim().toLowerCase();
    const treffer = anforderungen.filter((o) => tab === 'retouren' ? o.transactionType === 'return'
      : o.transactionType !== 'return' && (tab === 'archiv' ? o.status === 'Erledigt' : o.status !== 'Erledigt'))
      .filter((o) => !q || [o.materialName, o.userName, o.projectNumber, o.note].some((s) => s?.toLowerCase().includes(q)));
    const start = vor ? treffer.findIndex((o) => o.id === vor.id) + 1 : 0;
    const zeilen = treffer.slice(start, start + 50);
    return { zeilen, naechste: treffer.length > start + 50 ? { id: zeilen[49].id, zeit: '2026-01-01T00:00:00Z' } : null };
  },
  subscribeOrderChanges: () => () => undefined,
  listPurchasingOrders: async () => anforderungen.filter((o) => o.beschaffung === 'einkauf' && o.status !== 'Erledigt'),
  updateOrderStatus: (...a: unknown[]) => statusSetzen(...a),
  deleteOrder: (...a: unknown[]) => loeschen(...a),
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
  ladefehler = null;
  statusSetzen.mockReset();
  statusSetzen.mockResolvedValue(undefined);
  loeschen.mockReset();
  loeschen.mockResolvedValue(undefined);
  ausLager.mockReset();
  ausLager.mockResolvedValue(undefined);
  aufEinkaufsliste.mockReset();
  aufEinkaufsliste.mockResolvedValue(undefined);
  vorschlag = null;
  lagerPosten = [];
  lagerFehler = false;
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

describe('Anforderungen — der Abschluss zieht vom Lager ab', () => {
  it('fragt vor „Erledigt“ nach und bucht erst nach der Bestätigung', async () => {
    anforderungen = [anforderung({ id: 'o1', status: 'Abholbereit' })];
    zeige();

    await statusWaehlen('Erledigt');

    expect(await screen.findByText(/vom Lagerbestand abgezogen/)).toBeInTheDocument();
    expect(statusSetzen).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abschließen' }));
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('o1', 'Erledigt'));
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
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('o1', 'In Bearbeitung'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

describe('Anforderungen — Reiter und Abzeichen widersprechen sich nicht', () => {
  it('nennt den Reiter „Laufend“, weil er mehr zählt als das „offen“ im Menü', async () => {
    // Prüflauf 24.09.2026, F13: Menü „1 offene", Reiter „Offen 3".
    anforderungen = [
      anforderung({ id: 'a', status: 'Offen' }),
      anforderung({ id: 'b', status: 'In Bearbeitung' }),
      anforderung({ id: 'c', status: 'Abholbereit' }),
    ];
    zeige();
    // Seit dem Umbau ein Segment mit der Zahl im Namen; geschützt bleibt der Name.
    expect(await bereich(/^Laufend\s*3$/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^Offen\s*\d/ })).not.toBeInTheDocument();
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
    // Seit der Designlinie „Fassung 3" steht die Anzahl als „· 1" hinter dem
    // Titel; geprüft werden weiter Reihenfolge, Name und Anzahl der Gruppen.
    const titel = gruppen.map((h) => (h.textContent ?? '').replace(/[·\s]/g, ''));
    expect(titel).toEqual(['Offen1', 'Abholbereit1']);
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
    expect(await screen.findByText(/Nichts passt zu/)).toBeInTheDocument();
  });

  it('blendet das Suchfeld bei wenigen Zeilen aus', async () => {
    // Ein Suchfeld über drei Zeilen ist Ballast auf einem Telefonschirm.
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();

    await screen.findByText('Kupferrohr 15mm');
    expect(screen.queryByRole('searchbox', { name: /Suche/ })).not.toBeInTheDocument();
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
    expect(letzteHolgrenze).toBe(50);
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

    expect(screen.queryByText(/nur in diesen gesucht/)).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: /Weitere Anforderungen laden/ }));
    expect(letzteHolgrenze).toBe(50);
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
    await waitFor(() => expect(ausLager).toHaveBeenCalledWith('o1'));
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
    await waitFor(() => expect(aufEinkaufsliste).toHaveBeenCalledWith('o1', 'gh1'));
  });

  it('lässt den Großhändler offen, wenn „später zuordnen“ gewählt ist', async () => {
    anforderungen = [anforderung({ id: 'o1' })];
    zeige();
    await userEvent.click(within(await oeffnen()).getByRole('button', { name: 'Nicht auf Lager – auf die Einkaufsliste' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Großhändler')).toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Auf die Liste' }));
    await waitFor(() => expect(aufEinkaufsliste).toHaveBeenCalledWith('o1', null));
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
    await waitFor(() => expect(statusSetzen).toHaveBeenCalledWith('a', 'Erledigt'));
    expect(ausLager).toHaveBeenCalledWith('b');
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


describe('Serversuche der Anforderungen', () => {
  it('findet eine alte Notiz und lässt das Suchfeld beim einzelnen Treffer offen', async () => {
    anforderungen = Array.from({ length: 251 }, (_, i) => anforderung({ id: `alt-${i}`,
      materialName: `Material ${i}`, note: i === 250 ? 'Seltene alte Kommission' : undefined }));
    zeige();
    const suche = await screen.findByLabelText('Suche');
    await userEvent.type(suche, 'Seltene alte Kommission');
    expect(await screen.findByText('Material 250')).toBeInTheDocument();
    expect(screen.getByLabelText('Suche')).toHaveValue('Seltene alte Kommission');
  });
});
