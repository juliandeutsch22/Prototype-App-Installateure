import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Role, Wartung } from '@/types';

/**
 * Die Wartungsansicht — geprüft wird der ABLAUF, nicht die Liste.
 *
 * Der Wert dieses Bereichs hängt an einem einzigen Schritt: dem Eintragen der
 * erledigten Wartung, mit dem der nächste Termin nachrückt. Ohne ihn wäre das
 * hier nach einem Jahr eine Sammlung roter Zeilen, die niemand mehr ansieht —
 * dieselbe Karteileiche wie vorher im Kalender, nur auf einem Bildschirm.
 *
 * Deshalb prüft dieser Test genau das: was die Ansicht als anstehend zeigt,
 * und was beim Eintragen tatsächlich in die Datenschicht geht.
 */

/**
 * „Heute" im Test. Fest verdrahtet, weil die Ansicht `todayStr()` benutzt —
 * ein Test, der mit dem echten Datum rechnet, hätte an genau einem Tag im
 * Jahr ein anderes Ergebnis.
 */
const HEUTE = '2026-06-01';
vi.mock('@/lib/time', async () => {
  const echt = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...echt, todayStr: () => HEUTE };
});

const wartung = (
  id: string,
  customerName: string,
  faelligAm: string,
  extra: Partial<Wartung> = {},
): Wartung & { id: string } => ({
  id,
  companyId: 'perl',
  customerId: `k-${id}`,
  customerName,
  anlage: 'Therme Vaillant ecoTEC',
  intervallMonate: 12,
  faelligAm,
  aktiv: true,
  ...extra,
});

/*
  Vier Vereinbarungen, die zusammen die ganze Skala abdecken: längst
  überfällig, in zwei Wochen fällig, erst im Herbst, und eine ruhende, die
  trotz weit zurückliegendem Termin NICHT anstehen darf.
*/
let bestand: (Wartung & { id: string })[] = [];

const listWartungen = vi.fn(async () => bestand);
const wartungErledigt = vi.fn(async () => undefined);
const createWartung = vi.fn(async () => 'neu');
const updateWartung = vi.fn(async () => undefined);

const wartungEingeplant = vi.fn(async () => undefined);

vi.mock('@/lib/db/wartungen', () => ({
  listWartungen: () => listWartungen(),
  createWartung: (...a: unknown[]) => createWartung(...(a as [])),
  updateWartung: (...a: unknown[]) => updateWartung(...(a as [])),
  deleteWartung: vi.fn(async () => undefined),
  wartungErledigt: (...a: unknown[]) => wartungErledigt(...(a as [])),
  wartungEingeplant: (...a: unknown[]) => wartungEingeplant(...(a as [])),
  /* Die Suche des Servers: hier über den Bestand, wie die Datenbank mitten im Wort. */
  searchWartungen: (_c: string, begriff: string) =>
    Promise.resolve(bestand.filter((w) => `${w.customerName} ${w.anlage} ${w.address ?? ''}`.toLowerCase().includes(begriff.toLowerCase()))),
}));

/*
  Die Baustellen kommen nur wegen der Projektnummern herein: daraus entsteht
  der Vorschlag, und gegen sie wird geprüft, ob die Nummer noch frei ist.
*/
let baustellen: { projectNumber: string }[] = [];
const createProject = vi.fn<(a0: string, a1: Record<string, unknown>) => Promise<string>>(
  async () => 'p-neu',
);
const listRecentProjects = vi.fn(async () => baustellen);
const reserveProjectNumber = vi.fn<(a0: string, a1: unknown) => Promise<string | null>>(
  async () => 'B-2026-0015',
);
vi.mock('@/lib/db/projects', () => ({
  listRecentProjects: () => listRecentProjects(),
  createProject: (c: string, p: Record<string, unknown>) => createProject(c, p),
  reserveProjectNumber: (c: string, o: unknown) => reserveProjectNumber(c, o),
}));

const kunden: (Customer & { id: string })[] = [
  { id: 'k1', companyId: 'perl', name: 'Hausverwaltung Nord' },
];
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => kunden) }));

let rolle: Role = 'Geschäftsführung';
vi.mock('@/app/AuthContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'chef',
      email: 'chefin@perl.at',
      name: 'Julian Deutsch',
      role: rolle,
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
  }),
}));

const { default: WartungenView } = await import('@/features/maintenance/WartungenView');

function zeichne() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WartungenView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rolle = 'Geschäftsführung';
  bestand = [
    wartung('w1', 'Bäckerei Stein', '2026-04-10', { zuletztAm: '2025-04-10' }),
    wartung('w2', 'Hausverwaltung Nord', '2026-06-14'),
    wartung('w3', 'Familie Huber', '2026-11-02'),
    wartung('w4', 'Gasthaus Alt', '2025-01-01', { aktiv: false }),
  ];
  baustellen = [{ projectNumber: '2026-014' }, { projectNumber: '2025-087' }];
  listWartungen.mockClear();
  wartungErledigt.mockClear();
  createWartung.mockClear();
  updateWartung.mockClear();
  wartungEingeplant.mockClear();
  createProject.mockClear();
  listRecentProjects.mockClear();
  listRecentProjects.mockResolvedValue(baustellen);
});

/**
 * Der Abschnitt „Steht an" als eigener Bereich, ohne den Bestand darunter.
 *
 * GEWARTET WIRD AUF DIE DATEN, NICHT AUF DIE ÜBERSCHRIFT. Die Karte trägt
 * ihren Titel schon während des Ladens — „Steht an (0)" neben einem
 * Skelettblock. Ein `findByText(/^Steht an/)` ist damit sofort erfüllt, und
 * die Zusicherung danach läuft gegen den Ladezustand.
 *
 * Genau daran ist der Testlauf auf `main` gescheitert, nachdem er im
 * Zweig zweimal grün war: der Fehler hing an der Laufzeit der Maschine, nicht
 * am Code. Ein Test, der von der Tagesform abhängt, ist schlimmer als keiner
 * — er blockiert den Deploy und man sucht die Ursache im Falschen.
 */
async function anstehendeZeilen() {
  /*
    Irgendeine echte Zeile: sie erscheint erst, wenn die Abfrage zurück ist.
    `findAll`, weil der Test auch dann tragen soll, wenn dieselbe Vereinbarung
    an zwei Stellen steht (etwa im Seitenfenster).
  */
  await screen.findAllByText(/Bäckerei Stein/);
  /*
    SEIT DER LINIE „LOT“ sind „Steht an“ und „Alle“ zwei Ansichten derselben
    Liste (Segmente), keine zwei Karten. Die Liste ist die Karte, in der die
    Auswahl steht; „Steht an“ ist die Vorgabe.
  */
  const wahl = screen.getByRole('group', { name: 'Wartungen zeigen' });
  expect(within(wahl).getByRole('button', { name: 'Steht an' })).toHaveAttribute('aria-pressed', 'true');
  const karte = wahl.closest('section');
  if (!karte) throw new Error('Liste „Steht an“ nicht gefunden');
  return within(karte as HTMLElement);
}

/**
 * Wartet, bis die Ansicht fertig geladen hat — für Tests ohne Zeilenbezug.
 * Auf eine anstehende Zeile: „Familie Huber“ (erst im Herbst) steht seit der
 * Linie „Lot“ nur unter „Alle“.
 */
async function geladen() {
  await screen.findAllByText(/Bäckerei Stein/);
}

/** Zur Ansicht „Alle“ wechseln — der ganze Bestand. */
async function alleZeigen(nutzer: ReturnType<typeof userEvent.setup>) {
  await nutzer.click(screen.getByRole('button', { name: 'Alle' }));
}

describe('Wartungen', () => {
  it('zeigt oben nur, was wirklich ansteht', async () => {
    zeichne();
    const an = await anstehendeZeilen();

    // Überfällig und binnen Vorlauf fällig: ja.
    expect(an.getByText(/Bäckerei Stein/)).toBeTruthy();
    expect(an.getByText(/Hausverwaltung Nord/)).toBeTruthy();
    // Im November: nein.
    expect(an.queryByText(/Familie Huber/)).toBeNull();
    /*
      Die ruhende Vereinbarung ist der Fall, der ohne eigene Prüfung
      durchrutscht: ihr Termin liegt über ein Jahr zurück, sie wäre unter
      jeder reinen Datumsbetrachtung die dringendste Zeile der Seite.
    */
    expect(an.queryByText(/Gasthaus Alt/)).toBeNull();
  });

  it('nennt die Überfälligkeit in Tagen, nicht nur als Farbe', async () => {
    zeichne();
    const an = await anstehendeZeilen();
    // 10. April bis 1. Juni sind 52 Tage.
    expect(an.getByText('Seit 52 Tagen überfällig.')).toBeTruthy();
  });

  it('trägt eine erledigte Wartung ein und rückt den Termin nach', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    const an = await anstehendeZeilen();

    const zeile = an.getByText(/Bäckerei Stein/).closest('li');
    await nutzer.click(within(zeile as HTMLElement).getByRole('button', { name: 'Erledigt' }));

    /*
      Der Dialog nennt den künftigen Termin, BEVOR jemand bestätigt. Wer eine
      Wartung einträgt, verschiebt damit eine Zusage um ein Jahr; das soll
      nicht erst hinterher in der Liste auffallen.
    */
    expect(screen.getByText(/Nächster Termin: 01\.06\.2027/)).toBeTruthy();

    await nutzer.click(screen.getByRole('button', { name: 'Eintragen' }));

    expect(wartungErledigt).toHaveBeenCalledWith('w1', {
      erledigtAm: HEUTE,
      intervallMonate: 12,
      projectNumber: undefined,
    });
  });

  it('rechnet den neuen Termin mit dem im Dialog geänderten Intervall', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    const an = await anstehendeZeilen();

    const zeile = an.getByText(/Bäckerei Stein/).closest('li');
    await nutzer.click(within(zeile as HTMLElement).getByRole('button', { name: 'Erledigt' }));

    await nutzer.selectOptions(screen.getByLabelText('Intervall ab jetzt'), '24');
    // Zwei Jahre, nicht eines — und die Vorschau sagt es vor dem Bestätigen.
    expect(screen.getByText(/Nächster Termin: 01\.06\.2028/)).toBeTruthy();

    await nutzer.click(screen.getByRole('button', { name: 'Eintragen' }));
    expect(wartungErledigt).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ intervallMonate: 24 }),
    );
  });

  it('lädt die Liste nach dem Eintragen neu, damit der Termin nicht alt stehenbleibt', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    const an = await anstehendeZeilen();
    expect(listWartungen).toHaveBeenCalledTimes(1);

    const zeile = an.getByText(/Bäckerei Stein/).closest('li');
    await nutzer.click(within(zeile as HTMLElement).getByRole('button', { name: 'Erledigt' }));
    await nutzer.click(screen.getByRole('button', { name: 'Eintragen' }));

    expect(listWartungen).toHaveBeenCalledTimes(2);
  });

  /*
    PRÜFLAUF 24.09.2026, D14: jede fällige Wartung stand zweimal mit denselben
    Knöpfen auf der Seite — oben unter „Steht an", unten im Bestand —, und wer
    unten „Erledigt" drückte, suchte oben, warum sie noch dasteht. Seit der
    Linie „Lot“ sind beides Ansichten derselben Liste; geschützt bleibt, dass
    eine Vereinbarung nur EINMAL mit ihren Knöpfen dasteht — in jeder Ansicht.
  */
  it('trägt eine fällige Wartung nur einmal mit ihren Knöpfen (Prüflauf 24.09.2026, D14)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await anstehendeZeilen();
    expect(screen.getAllByText(/Bäckerei Stein/)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Erledigt' })).toHaveLength(2); // Bäckerei Stein und Hausverwaltung Nord

    await alleZeigen(nutzer);
    expect(screen.getAllByText(/Bäckerei Stein/)).toHaveLength(1);
    const zeile = screen.getByText(/Bäckerei Stein/).closest('li') as HTMLElement;
    expect(within(zeile).getAllByRole('button', { name: 'Erledigt' })).toHaveLength(1);
  });

  it('bietet der Verwaltung kein Eintragen an — sie darf es serverseitig nicht', async () => {
    rolle = 'Verwaltung';
    zeichne();
    const an = await anstehendeZeilen();
    expect(an.getByText(/Bäckerei Stein/)).toBeTruthy();
    expect(an.queryByRole('button', { name: 'Erledigt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Neue Wartung' })).toBeNull();
  });

  it('legt keine Wartung ohne Termin an', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();

    await nutzer.click(screen.getByRole('button', { name: 'Neue Wartung' }));
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Anlage'), 'Therme im Stiegenhaus');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(createWartung).not.toHaveBeenCalled();
    expect(await screen.findByText(/Ohne Termin wüsste niemand/)).toBeTruthy();
  });

  it('schlägt aus der letzten Wartung den nächsten Termin vor', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();

    await nutzer.click(screen.getByRole('button', { name: 'Neue Wartung' }));
    const zuletzt = screen.getByLabelText('Zuletzt gewartet') as HTMLInputElement;
    await nutzer.type(zuletzt, '2026-03-15');
    await nutzer.tab();

    expect((screen.getByLabelText('Nächster Termin') as HTMLInputElement).value).toBe('2027-03-15');
  });

  it('rechnet den Termin neu, sobald sich das Intervall ändert (M39)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();

    await nutzer.click(screen.getByRole('button', { name: 'Neue Wartung' }));
    await nutzer.type(screen.getByLabelText('Zuletzt gewartet'), '2026-01-31');
    await nutzer.selectOptions(screen.getByLabelText('Intervall'), '6');
    // Monatsende bleibt Monatsende — wie in der Datenbank.
    expect((screen.getByLabelText('Nächster Termin') as HTMLInputElement).value).toBe('2026-07-31');
    expect(screen.getByText(/plus Intervall berechnet/)).toBeTruthy();
  });

  it('speichert Anlagendaten und Preis (M39)', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();

    await nutzer.click(screen.getByRole('button', { name: 'Neue Wartung' }));
    await nutzer.selectOptions(screen.getByLabelText('Kunde'), 'k1');
    await nutzer.type(screen.getByLabelText('Anlage'), 'Therme');
    await nutzer.type(screen.getByLabelText('Zuletzt gewartet'), '2026-03-15');
    await nutzer.type(screen.getByLabelText('Hersteller'), 'Vaillant');
    await nutzer.type(screen.getByLabelText('Typ'), 'ecoTEC plus');
    await nutzer.type(screen.getByLabelText('Seriennummer'), '21184500');
    await nutzer.type(screen.getByLabelText('Baujahr'), '2018');
    await nutzer.type(screen.getByLabelText(/Preis je Wartung/), '149');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(createWartung).toHaveBeenCalled());
    expect((createWartung.mock.calls[0] as unknown[])[1]).toMatchObject({
      hersteller: 'Vaillant', typ: 'ecoTEC plus', seriennummer: '21184500', baujahr: 2018, preis: 149,
      faelligAm: '2027-03-15',
    });
  });
});

/**
 * Aus der fälligen Wartung wird eine Baustelle.
 *
 * DIE SACKGASSE WAR DER PUNKT. Die Liste sagte, was fällig ist, und hörte
 * dort auf: Baustelle von Hand anlegen, Kunden abtippen, Adresse abtippen,
 * einplanen, und nach getaner Arbeit die Projektnummer in den
 * Erledigt-Dialog zurücktippen.
 *
 * Schlimmer als die Tipparbeit war, dass die Liste den Fortschritt nicht
 * kannte: „fällig" hiess sowohl „noch nichts passiert" als auch „steht
 * längst im Einsatzplan".
 */
describe('Baustelle aus einer Wartung', () => {
  it('legt sie mit Kunde, Standort und Anlage an und merkt sie vor', async () => {
    // Der Bestand nach dem Schema des Betriebs — Vorsatz B, wie ab Werk.
    listRecentProjects.mockResolvedValue([{ projectNumber: 'B-2026-0014' }]);
    reserveProjectNumber.mockClear();
    bestand = [
      wartung('w1', 'Bäckerei Stein', '2026-04-10', {
        address: 'Lindengasse 4/12',
        hinweis: 'Schlüssel bei Frau Berger',
      }),
    ];
    const nutzer = userEvent.setup();
    zeichne();

    await screen.findAllByText(/Bäckerei Stein/);
    await nutzer.click((await screen.findAllByRole('button', { name: 'Baustelle anlegen' }))[0]);

    /*
      VORGESCHLAGEN NACH DEM SCHEMA DES BETRIEBS, vergeben aus dem Zähler —
      derselbe Weg wie bei „Neue Baustelle". Bis zum 23.09.2026 stand hier
      „2026-015": ohne den Vorsatz, den der Betrieb eingestellt hat.
    */
    const feld = await screen.findByLabelText(/Projektnummer/);
    expect(feld).toHaveValue('B-2026-0015');

    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));

    await vi.waitFor(() => expect(createProject).toHaveBeenCalled());
    // Den Anfangsstand liest seit dem Launch-Check die Datenbank selbst.
    expect(reserveProjectNumber).toHaveBeenCalledWith('perl', { seedFrom: 0, praefix: 'B' });
    expect(createProject.mock.calls[0][1]).toMatchObject({
      projectNumber: 'B-2026-0015',
      customerName: 'Bäckerei Stein',
      address: 'Lindengasse 4/12',
      status: 'Aktiv',
    });
    // Und die Wartung weiss davon — sonst stünde sie morgen wieder als
    // „nichts passiert" da und die Baustelle entstünde ein zweites Mal.
    expect(wartungEingeplant).toHaveBeenCalledWith('w1', 'B-2026-0015');
  });

  it('lässt eine eigene Nummer stehen und fasst den Zähler nicht an', async () => {
    // Manche Betriebe führen die Nummer des Auftraggebers.
    reserveProjectNumber.mockClear();
    bestand = [wartung('w1', 'Bäckerei Stein', '2026-04-10')];
    const nutzer = userEvent.setup();
    zeichne();
    await screen.findAllByText(/Bäckerei Stein/);
    await nutzer.click((await screen.findAllByRole('button', { name: 'Baustelle anlegen' }))[0]);
    const feld = await screen.findByLabelText(/Projektnummer/);
    await nutzer.clear(feld);
    await nutzer.type(feld, 'HV-Nord-7');
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));

    await vi.waitFor(() => expect(createProject).toHaveBeenCalled());
    expect(reserveProjectNumber).not.toHaveBeenCalled();
    expect(createProject.mock.calls[0][1]).toMatchObject({ projectNumber: 'HV-Nord-7' });
  });

  /*
    ZWEI BAUSTELLEN MIT DERSELBEN NUMMER wären der teuerste Fehler dieser
    Kette: Zeiten, Scheine und Rechnungen hängen an der Nummer, nicht an der
    Dokument-ID. Wer die Nummer von Hand überschreibt, geht am Zähler vorbei
    — deshalb wird beim Speichern noch einmal geprüft.
  */
  it('legt keine Baustelle auf eine schon vergebene Nummer', async () => {
    bestand = [wartung('w1', 'Bäckerei Stein', '2026-04-10')];
    const nutzer = userEvent.setup();
    zeichne();

    await screen.findAllByText(/Bäckerei Stein/);
    await nutzer.click((await screen.findAllByRole('button', { name: 'Baustelle anlegen' }))[0]);

    const feld = await screen.findByLabelText(/Projektnummer/);
    await nutzer.clear(feld);
    await nutzer.type(feld, '2026-014');
    await nutzer.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(await screen.findByText(/schon vergeben/)).toBeInTheDocument();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('zeigt eine eingeplante Wartung als eingeplant und bietet sie nicht erneut an', async () => {
    bestand = [wartung('w1', 'Bäckerei Stein', '2026-04-10', { offeneBaustelle: '2026-014' })];
    zeichne();

    await screen.findAllByText(/Bäckerei Stein/);
    expect(screen.getAllByText(/Eingeplant auf Baustelle/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Baustelle anlegen' })).not.toBeInTheDocument();
  });

  it('füllt den Erledigt-Dialog mit der eingeplanten Baustelle', async () => {
    // Die Nummer kennt die App — niemand soll sie abtippen und sich dabei
    // vertippen. Genau daran hing vorher die Verbindung in die Historie.
    bestand = [wartung('w1', 'Bäckerei Stein', '2026-04-10', { offeneBaustelle: '2026-014' })];
    const nutzer = userEvent.setup();
    zeichne();

    await screen.findAllByText(/Bäckerei Stein/);
    await nutzer.click((await screen.findAllByRole('button', { name: 'Erledigt' }))[0]);
    expect(await screen.findByLabelText(/Baustelle/)).toHaveValue('2026-014');
  });

  it('bietet an einer erst im Herbst fälligen Wartung nichts zum Anlegen', async () => {
    // Sonst legte jemand Baustellen auf Vorrat an, und der Einsatzplan füllte
    // sich mit Arbeit, die noch ein halbes Jahr Zeit hat.
    bestand = [wartung('w3', 'Familie Huber', '2026-11-02')];
    const nutzer = userEvent.setup();
    zeichne();

    // Unter „Steht an" steht sie gar nicht; unter „Alle" ohne den Knopf.
    expect(await screen.findByText(/steht keine Wartung an/)).toBeInTheDocument();
    await alleZeigen(nutzer);
    await screen.findAllByText(/Familie Huber/);
    expect(screen.queryByRole('button', { name: 'Baustelle anlegen' })).not.toBeInTheDocument();
    // Auch nicht im Seitenfenster der Anlage, wo alle Schritte stehen.
    await nutzer.click(screen.getByRole('button', { name: /Familie Huber/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Wartung' });
    expect(within(fenster).getByRole('button', { name: 'Erledigt' })).toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: 'Baustelle anlegen' })).toBeNull();
  });
});

/*
  LINIE „LOT“ (Protokoll E6/E7): die Liste zeigt den Arbeitsstand, nach
  Dringlichkeit gruppiert, mit Suche und „Alle“; die ganze Zeile öffnet die
  Anlage im Seitenfenster, mit den Wartungen als Lot.
*/
describe('Wartungen auf der Linie „Lot“', () => {
  function zeichneMit(pfad: string) {
    return render(
      <MemoryRouter initialEntries={[pfad]}>
        <ToastProvider>
          <WartungenView />
        </ToastProvider>
      </MemoryRouter>,
    );
  }

  it('zeigt unter „Alle“ den ganzen Bestand — auch die späte und die ruhende', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();
    // Gegenprobe zum Arbeitsstand: dort fehlen beide.
    expect(screen.queryByText(/Familie Huber/)).toBeNull();
    expect(screen.queryByText(/Gasthaus Alt/)).toBeNull();
    await alleZeigen(nutzer);
    expect(screen.getByText(/Familie Huber/)).toBeInTheDocument();
    expect(screen.getByText(/Gasthaus Alt/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Alle Vereinbarungen/ })).toHaveTextContent('· 4');
  });

  it('nimmt die Ansicht aus der Adresse — als Lesezeichen', async () => {
    zeichneMit('/wartungen?ansicht=alle');
    expect(await screen.findByText(/Familie Huber/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('gruppiert nach Dringlichkeit: überfällig vor fällig', async () => {
    zeichne();
    await geladen();
    const koepfe = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(koepfe).toEqual(['Überfällig· 1', 'Fällig in den nächsten 30 Tagen· 1']);
  });

  it('zeigt je Gruppe höchstens 20 Zeilen, dann „und N weitere anzeigen“', async () => {
    const nutzer = userEvent.setup();
    bestand = Array.from({ length: 25 }, (_, i) =>
      wartung(`u${i}`, `Kunde ${String(i).padStart(2, '0')}`, `2026-05-${String(i + 1).padStart(2, '0')}`));
    zeichne();
    await screen.findByText('Kunde 00');
    expect(screen.getAllByRole('button', { name: 'Erledigt' })).toHaveLength(20);
    await nutzer.click(screen.getByRole('button', { name: 'und 5 weitere anzeigen' }));
    expect(screen.getAllByRole('button', { name: 'Erledigt' })).toHaveLength(25);
  });

  it('sucht auch im Arbeitsstand — und nur dort, wo die Wartung ansteht', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    await geladen();
    await nutzer.type(screen.getByLabelText('Suche'), 'Nord');
    // Auf die Antwort warten: dazwischen steht das Gerüst, nicht die alte Liste.
    expect(await screen.findByText(/Hausverwaltung Nord/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText(/Bäckerei Stein/)).toBeNull();
  });

  it('öffnet mit der ganzen Zeile die Anlage — mit den Wartungen als Lot und allen Schritten', async () => {
    const nutzer = userEvent.setup();
    bestand = [
      wartung('w1', 'Bäckerei Stein', '2026-04-10', {
        zuletztAm: '2025-04-10', letzteBaustelle: 'B-2025-0031', hersteller: 'Vaillant', typ: 'ecoTEC', preis: 149,
      }),
    ];
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: /Bäckerei Stein/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Wartung' });
    expect(within(fenster).getByText('Vaillant ecoTEC')).toBeInTheDocument();
    expect(within(fenster).getByText('€ 149,00 netto')).toBeInTheDocument();
    const lot = within(fenster).getByRole('list', { name: 'Wartungen dieser Anlage' });
    const punkte = within(lot).getAllByRole('listitem');
    expect(punkte.map((p) => p.querySelector('.lot-titel')?.textContent)).toEqual(['Zuletzt gewartet', 'Nächste Wartung']);
    expect(within(punkte[0]).getByText('Baustelle B-2025-0031')).toBeInTheDocument();
    expect(punkte[1]).toHaveAttribute('aria-current', 'step');

    // Gegenprobe zur Herbst-Wartung: die überfällige ohne Baustelle bietet das Anlegen an.
    expect(within(fenster).getByRole('button', { name: 'Baustelle anlegen' })).toBeInTheDocument();
    // „Bearbeiten“ steht unter „Steht an“ hier, nicht in der Zeile.
    expect(screen.getAllByRole('button', { name: 'Bearbeiten' })).toHaveLength(1);
    await nutzer.click(within(fenster).getByRole('button', { name: 'Bearbeiten' }));
    expect(await screen.findByRole('dialog', { name: 'Wartung ändern' })).toBeInTheDocument();
    expect(screen.getByLabelText('Anlage')).toHaveValue('Therme Vaillant ecoTEC');
  });

  it('trägt je Ansicht ihren zweiten Schritt: „Baustelle anlegen“ unter „Steht an“, „Bearbeiten“ unter „Alle“', async () => {
    const nutzer = userEvent.setup();
    zeichne();
    const an = await anstehendeZeilen();
    const zeile = () => screen.getByText(/Bäckerei Stein/).closest('li') as HTMLElement;
    expect(within(zeile()).getByRole('button', { name: 'Baustelle anlegen' })).toBeInTheDocument();
    expect(an.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();

    await alleZeigen(nutzer);
    expect(within(zeile()).getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();
    expect(within(zeile()).queryByRole('button', { name: 'Baustelle anlegen' })).toBeNull();
    // Ohne Seitenfenster direkt ins Formular — wie vor dem Umbau aus der Karte „Alle Vereinbarungen“.
    await nutzer.click(within(zeile()).getByRole('button', { name: 'Bearbeiten' }));
    expect(await screen.findByRole('dialog', { name: 'Wartung ändern' })).toBeInTheDocument();
  });

  it('Gegenprobe: eine ruhende Vereinbarung hat keinen „jetzt“-Punkt', async () => {
    const nutzer = userEvent.setup();
    zeichneMit('/wartungen?ansicht=alle');
    await nutzer.click(await screen.findByRole('button', { name: /Gasthaus Alt/ }));
    const lot = within(await screen.findByRole('dialog', { name: 'Wartung' })).getByRole('list', { name: 'Wartungen dieser Anlage' });
    expect(within(lot).getByText('Ruht')).toBeInTheDocument();
    expect(lot.querySelector('[aria-current]')).toBeNull();
  });

  it('lässt die Verwaltung die Anlage ansehen, aber nichts darin ändern', async () => {
    rolle = 'Verwaltung';
    const nutzer = userEvent.setup();
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: /Bäckerei Stein/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Wartung' });
    expect(within(fenster).getByRole('list', { name: 'Wartungen dieser Anlage' })).toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: /Bearbeiten|Erledigt|Baustelle anlegen/ })).toBeNull();
  });
});

/*
  GEFUNDEN BEIM UMBAU (Paket angebote, 07.10.2026): „Bearbeiten“ holte die
  Anlagendaten nicht ins Formular. Die Felder standen leer da, und beim
  Speichern schrieb die Ansicht Hersteller, Typ und Seriennummer als leer
  zurück — wer nur den Hinweis änderte, löschte die Anlagendaten.
*/
describe('Eine Wartung mit Anlagendaten bearbeiten', () => {
  it('zeigt die gespeicherten Anlagendaten und behält sie beim Speichern', async () => {
    const nutzer = userEvent.setup();
    bestand = [
      wartung('w1', 'Bäckerei Stein', '2026-04-10', {
        customerId: 'k1', hersteller: 'Vaillant', typ: 'ecoTEC plus', seriennummer: '21184500', baujahr: 2018, preis: 149,
      }),
    ];
    zeichne();
    await nutzer.click(await screen.findByRole('button', { name: /Bäckerei Stein/ }));
    await nutzer.click(within(await screen.findByRole('dialog', { name: 'Wartung' })).getByRole('button', { name: 'Bearbeiten' }));

    expect(screen.getByLabelText('Hersteller')).toHaveValue('Vaillant');
    expect(screen.getByLabelText('Seriennummer')).toHaveValue('21184500');
    await nutzer.clear(screen.getByLabelText('Hinweis'));
    await nutzer.type(screen.getByLabelText('Hinweis'), 'Schlüssel beim Nachbarn');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(updateWartung).toHaveBeenCalled());
    expect((updateWartung.mock.calls[0] as unknown[])[1]).toMatchObject({
      hinweis: 'Schlüssel beim Nachbarn',
      hersteller: 'Vaillant', typ: 'ecoTEC plus', seriennummer: '21184500', baujahr: 2018, preis: 149,
    });
  });
});
