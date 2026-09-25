import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { Customer, Role, Wartung } from '@/types';
import { mitSchreibtisch } from './schreibtisch';

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
}));

/*
  Die Baustellen kommen nur wegen der Projektnummern herein: daraus entsteht
  der Vorschlag, und gegen sie wird geprüft, ob die Nummer noch frei ist.
*/
let baustellen: { projectNumber: string }[] = [];
const createProject = vi.fn<[string, Record<string, unknown>], Promise<string>>(
  async () => 'p-neu',
);
const listRecentProjects = vi.fn(async () => baustellen);
const reserveProjectNumber = vi.fn<[string, unknown], Promise<string | null>>(
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
    `findAll`, weil dieselbe Vereinbarung zweimal auf dem Schirm steht — oben
    unter „Steht an", darunter im Bestand.
  */
  await screen.findAllByText(/Bäckerei Stein/);
  const ueberschrift = screen.getByText(/^Steht an/);
  const karte = ueberschrift.closest('section');
  if (!karte) throw new Error('Abschnitt „Steht an" nicht gefunden');
  return within(karte as HTMLElement);
}

/** Wartet, bis die Ansicht fertig geladen hat — für Tests ohne Zeilenbezug. */
async function geladen() {
  await screen.findAllByText(/Familie Huber/);
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

  it('trägt eine fällige Wartung nur einmal mit ihren Knöpfen (Prüflauf 24.09.2026, D14)', async () => {
    zeichne();
    await anstehendeZeilen();
    const alle = screen.getByText(/^Alle Vereinbarungen/).closest('section') as HTMLElement;
    const unten = within(alle).getByText(/Bäckerei Stein/).closest('li') as HTMLElement;
    // Unten nur noch „Bearbeiten" — „Erledigt" steht oben unter „Steht an".
    expect(within(unten).queryByRole('button', { name: 'Erledigt' })).toBeNull();
    expect(within(unten).queryByRole('button', { name: 'Baustelle anlegen' })).toBeNull();
    /*
      „Bearbeiten" liegt seit dem Durchgang nach der Linie im „⋯" der Zeile
      (docs/design/linie.md 3) — an jeder Zeile an derselben Stelle. Das Menü
      ist dasselbe wie oben und bietet nur das Bearbeiten an.
    */
    await userEvent.click(within(unten).getByRole('button', { name: /^Weitere Aktionen für Wartung Bäckerei Stein/ }));
    expect(screen.getAllByRole('menuitem').map((e) => e.textContent)).toEqual(['Bearbeiten']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Bearbeiten' }));
    expect(await screen.findByText('Wartung ändern')).toBeTruthy();
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
    zeichne();

    await screen.findAllByText(/Familie Huber/);
    expect(screen.queryByRole('button', { name: 'Baustelle anlegen' })).not.toBeInTheDocument();
  });
});

/*
  AM SCHREIBTISCH ALS TABELLE (docs/design/linie.md 4), wie die übrigen
  Büro-Listen: genau eine Form im DOM, dieselben Handgriffe.
*/
describe('Wartungen am Schreibtisch', () => {
  const schreibtisch = mitSchreibtisch();

  it('stehen als Tabelle mit Kunde, Standort, Termin, Intervall, Zuletzt und Status', async () => {
    schreibtisch();
    zeichne();
    const an = await anstehendeZeilen();
    const zeile = an.getByRole('row', { name: /Bäckerei Stein/ });
    const t = zeile.closest('table') as HTMLElement;
    expect(within(t).getAllByRole('columnheader').map((k) => k.textContent)).toEqual([
      'Kunde und Anlage', 'Standort', 'Termin', 'Intervall', 'Zuletzt', 'Status', 'Aktionen',
    ]);
    expect(zeile).toHaveTextContent('Therme Vaillant ecoTEC');
    expect(zeile).toHaveTextContent('10.04.2026');
    expect(zeile).toHaveTextContent('alle 12 Monate');
    expect(zeile).toHaveTextContent('10.04.2025');
    expect(zeile).toHaveTextContent('Seit 52 Tagen überfällig.');
    expect(within(zeile).getByRole('button', { name: 'Erledigt' })).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('trägt eine erledigte Wartung auch aus der Tabelle ein', async () => {
    schreibtisch();
    const nutzer = userEvent.setup();
    zeichne();
    const an = await anstehendeZeilen();
    const zeile = an.getByRole('row', { name: /Bäckerei Stein/ });
    await nutzer.click(within(zeile).getByRole('button', { name: 'Erledigt' }));
    await nutzer.click(screen.getByRole('button', { name: 'Eintragen' }));
    expect(wartungErledigt).toHaveBeenCalledWith('w1', expect.objectContaining({ erledigtAm: HEUTE }));
  });

  it('zeigt der Verwaltung keine Aktionsspalte', async () => {
    schreibtisch();
    rolle = 'Verwaltung';
    zeichne();
    const an = await anstehendeZeilen();
    const t = an.getByRole('row', { name: /Bäckerei Stein/ }).closest('table') as HTMLElement;
    expect(within(t).queryByRole('columnheader', { name: 'Aktionen' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Weitere Aktionen/ })).toBeNull();
  });
});
