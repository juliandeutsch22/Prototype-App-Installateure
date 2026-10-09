import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Assignment, Project, Termin, Vacation } from '@/types';

/**
 * Die Einsatzplanung (Woche und Monat) — die Frage VOR der Tagesplanung:
 * wer ist frei. Seit der Linie „Lot“ wird hier im Seitenfenster eingeteilt,
 * mit DEMSELBEN Formular wie „Tag planen“; seit Runde 4 (Auftrag
 * Abschnitt 4) mit Tageskopf, Seitenfenster „Tag“, Terminen in der Zelle
 * und „Noch einzuplanen“ als Hinweiszeile.
 *
 * ANGEPASST IN RUNDE 4: Tests, die nur das alte Aussehen festhielten (Kasten
 * „frei“, Zeile „Termine“, Tagesliste mit Baustellenkarten, Kopf → „Tag
 * planen“, Ablage rechts), prüfen jetzt dasselbe Verhalten am neuen Ort —
 * was sie schützten (Tag und Person bzw. Baustelle werden übergeben, „frei“
 * wird richtig gezählt, Abwesende mit Grund nach Recht, nichts wird geraten),
 * bleibt geschützt. Die Team-Woche prüft `TeamWoche.test.tsx` gegen ihr DOM
 * von vorher.
 */

const MITTWOCH = '2026-09-02';

const BAUSTELLEN: Project[] = [
  { id: 'p1', companyId: 'perl', projectNumber: '2026-042', customerName: 'Familie Huber', status: 'Aktiv' } as Project,
];

const mk = (uid: string, name: string) =>
  ({
    id: uid, companyId: 'perl', uid, name, email: `${uid}@perl.at`,
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5],
  }) as AppUser;

let einsaetze: (Assignment & { id: string })[] = [];
let urlaube: (Vacation & { id: string })[] = [];

let termineDerWoche: Termin[] = [];
const termineGeladen = vi.fn();
const terminGeloescht = vi.fn();
vi.mock('@/lib/db/termine', () => ({
  listTermineImZeitraum: vi.fn(async (...a: unknown[]) => {
    termineGeladen(...a);
    return termineDerWoche;
  }),
  listTermineDerBaustelle: vi.fn(async () => []),
  listTermineDesKunden: vi.fn(async () => []),
  terminAnlegen: vi.fn(async () => 'neu'),
  terminAendern: vi.fn(async () => undefined),
  terminLoeschen: vi.fn(async (id: string) => {
    terminGeloescht(id);
  }),
}));
vi.mock('@/lib/db/customers', () => ({ listCustomers: vi.fn(async () => []) }));
let leute: AppUser[] = [];
vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => leute),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => BAUSTELLEN),
  // Für die Baustellenauswahl im Seitenfenster.
  listRecentProjects: vi.fn(async () => BAUSTELLEN),
  listProjectsByNumbers: vi.fn(async () => BAUSTELLEN),
}));
/*
  DAS SEITENFENSTER (Linie „Lot“, E2) benutzt dasselbe Formular wie „Tag
  planen“ — mit Materialstamm, Rüstliste und Anforderung. Hier ohne Material.
*/
vi.mock('@/lib/db/materials', () => ({
  lagerFrei: async () => new Map(),
  subscribeMaterials: (_c: string, cb: (r: unknown[]) => void) => {
    cb([]);
    return () => undefined;
  },
  LOW_STOCK_THRESHOLD: 3,
}));
vi.mock('@/lib/db/materialOrders', () => ({ createMaterialOrder: vi.fn(async () => undefined) }));
vi.mock('@/lib/db/einsatzMaterial', () => ({
  subscribeEinsatzMaterialForDate: (_c: string, _d: string, cb: (r: unknown[]) => void) => {
    cb([]);
    return () => undefined;
  },
  saveEinsatzMaterial: vi.fn(async () => undefined),
}));
const speichere = vi.fn();
const loesche = vi.fn();
/** Welche Zeiträume geladen wurden — Woche oder Monat. */
const geladen: [string, string][] = [];
/**
 * Was der Wochenplan über Abwesenheiten erfährt. Den Grund liefert die
 * Datenbank nur dem, der ihn sehen darf — der Monteur bekommt `null`.
 */
let abwesend: { userId: string; von: string; bis: string; grund?: string | null; zeiten?: string | null }[] = [];
let betriebsurlaube: { id: string; von: string; bis: string; bezeichnung: string; ausgenommen?: string[] }[] = [];
vi.mock('@/lib/db/abwesenheiten', () => ({
  listBetriebsurlaubeImZeitraum: vi.fn(async () => betriebsurlaube),
}));
const vollerUrlaubGeholt = vi.fn();
vi.mock('@/lib/db/vacations', () => ({
  listApprovedVacationsInRange: vi.fn(async () => {
    vollerUrlaubGeholt();
    return urlaube;
  }),
  listAbwesendInRange: vi.fn(async () => abwesend),
}));
const kalenderAboStand = vi.fn<(...a: unknown[]) => Promise<null>>(async () => null);
vi.mock('@/lib/db/assignments', () => ({
  kalenderAboStand: (...a: unknown[]) => kalenderAboStand(...a),
  kalenderAboAnlegen: vi.fn(async () => 'x'),
  kalenderAboBeenden: vi.fn(async () => undefined),
  subscribeAssignmentsInRange: (
    _c: string,
    v: string,
    b: string,
    cb: (r: (Assignment & { id: string })[]) => void,
  ) => {
    geladen.push([v, b]);
    cb(einsaetze.filter((a) => a.date >= v && a.date <= b));
    return () => undefined;
  },
  saveAssignments: (...a: unknown[]) => {
    speichere(...a);
    return Promise.resolve();
  },
  deleteAssignment: (id: string) => {
    loesche(id);
    return Promise.resolve();
  },
}));

const authWert: {
  user: { uid: string; companyId: string; name: string; role: string; email: string; docId: string };
  company: { id: string; name: string; kalenderAboErlaubt?: boolean };
  [k: string]: unknown;
} = {
  user: { uid: 'pl', companyId: 'perl', name: 'Planer', role: 'Projektleiter', email: 'pl@perl.at', docId: 'pl' },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false, error: null,
  signIn: vi.fn(), signOut: vi.fn(), resetPassword: vi.fn(), reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

/** Wohin die Ansicht navigiert — das ist ihre einzige Wirkung nach außen. */
const gefahren: { zu: string | null; zustand: unknown } = { zu: null, zustand: null };
vi.mock('react-router-dom', async () => {
  const echt = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...echt,
    useNavigate: () => (zu: string, opt?: { state?: unknown }) => {
      gefahren.zu = zu;
      gefahren.zustand = opt?.state ?? null;
    },
  };
});

const { default: WochenplanView } = await import('@/features/assignments/WochenplanView');
const echt = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

/** Zeigt die Adresse an und kann „Zurück“ — mit dem echten Router, nicht dem abgefangenen. */
function Adresse() {
  const ort = useLocation();
  const zurueck = echt.useNavigate();
  return (
    <>
      <output aria-label="Adresse">{ort.search}</output>
      <button type="button" onClick={() => zurueck(-1)}>
        Browser zurück
      </button>
    </>
  );
}

function zeige(start = '/assignments/woche') {
  // Mit Toast-Rahmen wie in `main.tsx`: die Karte des Kalender-Abos meldet darüber.
  return render(
    <MemoryRouter initialEntries={[start]}>
      <ToastProvider>
        <WochenplanView />
        <Adresse />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/**
 * Es gibt ZWEI Darstellungen derselben Woche: das Raster am Tablet und
 * Schreibtisch und die Tagesliste am Handy. Im Browser blendet CSS eine
 * davon aus, in jsdom stehen beide im Baum — deshalb wird hier immer die
 * gemeinte eingegrenzt, statt blind im ganzen Bild zu suchen.
 */
const tabelle = () => within(screen.getByRole('table', { name: 'Wochenplan als Tabelle' }));
const liste = () => within(screen.getByRole('region', { name: 'Wochenplan als Liste' }));
const fenster = () => within(screen.getByRole('dialog'));
/** Der Kopf eines Tages — er öffnet das Seitenfenster „Tag“. */
const kopf = (tag: RegExp) => tabelle().getByRole('button', { name: new RegExp(`${tag.source}.*ganzen Tag ansehen`) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Mi, 02.09.2026 — die Woche beginnt also am Mo, 31.08.
  vi.setSystemTime(new Date(2026, 8, 2, 9, 0, 0));
  leute = [mk('u1', 'Max Mustermann'), mk('u2', 'Erna Beispiel')];
  einsaetze = [];
  urlaube = [];
  termineDerWoche = [];
  authWert.company = { id: 'perl', name: 'Perl Installationen' };
  authWert.user.role = 'Projektleiter';
  abwesend = [];
  betriebsurlaube = [];
  gefahren.zu = null;
  gefahren.zustand = null;
  speichere.mockClear();
  loesche.mockClear();
  termineGeladen.mockClear();
  terminGeloescht.mockClear();
  geladen.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

const EINSATZ_MAX = { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' } as Assignment & { id: string };

describe('Einsatzplanung — Seite (Runde 4, Auftrag 4.1)', () => {
  it('heißt „Einsatzplanung“, mit Umschalter „Woche | Monat | Tag“ statt der Reiter', async () => {
    zeige();
    expect(await screen.findByRole('heading', { level: 1, name: 'Einsatzplanung' })).toBeInTheDocument();
    expect(screen.getByText('Wer ist wann wo – und wer ist noch frei')).toBeInTheDocument();
    // Gegenprobe: der alte Titel steht nicht mehr da.
    expect(screen.queryByRole('heading', { name: 'Wochenplan' })).toBeNull();
    const wahl = within(screen.getByRole('group', { name: 'Zeitraum' }));
    expect(wahl.getByRole('button', { name: 'Woche' })).toHaveAttribute('aria-pressed', 'true');
    // „Tag“ führt an die bisherige Adresse von „Tag planen“.
    await userEvent.click(wahl.getByRole('button', { name: 'Tag' }));
    expect(gefahren.zu).toBe('/assignments/tag');
  });

  it('nutzt die volle Inhaltsbreite — nur die Einsatzplanung, nicht die Team-Woche', async () => {
    const { container } = zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(container.querySelector('.einsatzplanung')).not.toBeNull();
  });

  it('sagt in der Hilfe, dass der Tageskopf das Seitenfenster „Tag“ öffnet', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Hilfe zu dieser Seite' }));
    expect(await screen.findByText(/Kopf eines Tages öffnet das Seitenfenster\s+„Tag“/)).toBeInTheDocument();
    expect(screen.getByText(/zeigt Einsätze, nicht gebuchte Zeiten/)).toBeInTheDocument();
  });
});

describe('Wochenplan — wer ist wo', () => {
  it('zeigt eine Zeile je Mitarbeiter und sieben Tage', async () => {
    zeige();
    expect(await screen.findByRole('row', { name: /Max Mustermann/ })).toBeInTheDocument();
    expect(tabelle().getByRole('row', { name: /Erna Beispiel/ })).toBeInTheDocument();
    // Kopfzeile plus zwei Mitarbeiter.
    expect(tabelle().getAllByRole('row')).toHaveLength(3);
  });

  it('teilt die Breite fest auf: Namensspalte fest, Werktage gleich, Sa/So schmal, solange dort nichts steht', async () => {
    /**
     * Prüflauf 25.09.2026, P4-01: im automatischen Tabellenlayout nahm ein
     * Tag mit langem Kundennamen die ganze Breite. jsdom rechnet kein Layout
     * — geprüft wird, was das Layout festlegt: die Spalten aus `<colgroup>`
     * und die Mindestbreite nach der Zahl der breiten Tage (Auftrag 4.2).
     */
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    const tab = screen.getByRole('table', { name: 'Wochenplan als Tabelle' });
    expect(tab.className).toBe('wp-raster-5');
    const spalten = Array.from(tab.querySelectorAll('col')).map((c) => c.className);
    expect(spalten).toEqual([
      'wp-spalte-name',
      ...Array(5).fill('wp-spalte-tag'),
      'wp-spalte-schmal',
      'wp-spalte-schmal',
    ]);
  });

  it('… ein Notdienst am Samstag und ein Termin am Sonntag machen die Spalte breit (Abnahme 4.9)', async () => {
    einsaetze = [{ ...EINSATZ_MAX, id: 'not', date: '2026-09-05' }];
    termineDerWoche = [
      { id: 't-so', companyId: 'perl', art: 'Besichtigung', datum: '2026-09-06', projectNumber: null, customerId: 'k', teilnehmer: [], ortName: 'Familie Huber' },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    const tab = screen.getByRole('table', { name: 'Wochenplan als Tabelle' });
    await waitFor(() => expect(tab.className).toBe('wp-raster-7'));
    expect(Array.from(tab.querySelectorAll('col')).every((c, i) => i === 0 || c.className === 'wp-spalte-tag')).toBe(true);
    expect(within(tabelle().getByRole('row', { name: /Max Mustermann/ })).getByText('Familie Huber')).toBeInTheDocument();
  });

  it('setzt die Baustelle in die Zelle des eingeteilten Tages — eine leere Zelle ist leer', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(within(zeile).getByText('Familie Huber')).toBeInTheDocument();
    // Und die Nummer: ein Kunde kann zwei Baustellen haben (Launch-Check 25.09.2026).
    expect(within(zeile).getByText('2026-042')).toBeInTheDocument();
    // Erna ist an dem Tag frei — kein Kasten „frei“ mehr, aber ein Knopf, der es sagt.
    const andere = tabelle().getByRole('row', { name: /Erna Beispiel/ });
    expect(within(andere).queryByText('frei')).toBeNull();
    expect(within(andere).getByRole('button', { name: 'Erna Beispiel, Mittwoch 02.09.: frei – Einsatz planen' })).toBeInTheDocument();
  });

  it('zaehlt, wie viele an einem Tag frei sind', async () => {
    /**
     * DIE ZAHL, WEGEN DER ES DIESES BRETT GIBT. „Wer ist Donnerstag frei"
     * war bisher nur zu beantworten, indem man sich durch sieben Tage
     * klickte und sich die Namen merkte.
     */
    einsaetze = [EINSATZ_MAX];
    zeige();
    // Am Mittwoch ist einer von zweien eingeteilt, am Montag keiner.
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('1 frei');
    expect(kopf(/Montag 31\.08\./)).toHaveTextContent('2 frei');
  });

  it('zaehlt am Wochenende niemanden als frei (Prüflauf 24.09.2026, D15)', async () => {
    // Samstag „2 frei" las sich, als stünden zwei Leute zur Verfügung — es
    // ist aber schlicht niemand im Dienst.
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(kopf(/Samstag 05\.09\./)).not.toHaveTextContent('frei');
  });

  it('zeigt genehmigten Urlaub und zaehlt ihn NICHT als frei', async () => {
    // Wer frei hat, ist nicht verfuegbar, sondern abwesend. Ihn als frei zu
    // zaehlen hiesse, die Planung auf eine Zahl zu stuetzen, die luegt.
    abwesend = [{ userId: 'u2', von: '2026-08-31', bis: '2026-09-04', grund: 'Urlaub', zeiten: null }];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(zeile).getAllByText('Urlaub').length).toBeGreaterThan(0);
    // Der graue Block: Wort, Silbentrennung, kein Knopf (die Zelle plant trotzdem).
    expect(within(zeile).getAllByText('Urlaub')[0].className).toBe('eintrag-weg');
    expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('1 frei');
  });
});

/*
  PLANEN IM SEITENFENSTER (Linie „Lot“, E2). Ein Tipp öffnet das Fenster mit
  demselben Formular wie „Tag planen“ — Tag und Baustelle bzw. Person schon
  gewählt. Geschützt bleibt, was die alten Tests schützten: die Übergabe von
  Tag und Baustelle, und dass eine freie Zelle KEINE Baustelle rät.
*/
describe('Wochenplan — planen im Seitenfenster', () => {
  it('ein Einsatz öffnet sich mit Tag UND Baustelle — zum Bearbeiten', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(tabelle().getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09/ }));
    expect(screen.getByRole('dialog', { name: 'Einsatz bearbeiten' })).toBeInTheDocument();
    expect(fenster().getByRole('combobox', { name: 'Tag' })).toHaveValue(MITTWOCH);
    await waitFor(() => expect(fenster().getByRole('combobox', { name: /Baustelle/ })).toHaveValue('2026-042'));
    await waitFor(() => expect(fenster().getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked());
    // Im Fenster, nicht mehr woanders hin.
    expect(gefahren.zu).toBeNull();
  });

  it('eine leere Zelle öffnet sich mit Tag und Person — ohne eine Baustelle zu raten', async () => {
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(within(zeile).getByRole('button', { name: /Mittwoch 02\.09\.: frei – Einsatz planen/ }));
    expect(screen.getByRole('dialog', { name: 'Einsatz planen' })).toBeInTheDocument();
    expect(fenster().getByRole('combobox', { name: 'Tag' })).toHaveValue(MITTWOCH);
    expect(fenster().getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked();
    expect(fenster().getByRole('checkbox', { name: /^Erna Beispiel/ })).not.toBeChecked();
    expect(await fenster().findByRole('combobox', { name: /Baustelle/ })).toHaveValue('');
  });

  it('auch eine Zelle mit grauem Block plant — das Fenster warnt wie bisher', async () => {
    abwesend = [{ userId: 'u2', von: MITTWOCH, bis: MITTWOCH, grund: 'Urlaub', zeiten: null }];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Erna Beispiel/ });
    await userEvent.click(within(zeile).getByRole('button', { name: 'Erna Beispiel, Mittwoch 02.09.: Urlaub – Einsatz planen' }));
    expect(fenster().getByRole('checkbox', { name: /^Erna Beispiel/ })).toBeChecked();
    expect(fenster().getByText(/an diesem Tag abwesend/)).toBeInTheDocument();
  });

  it('speichert über dieselbe Funktion wie „Tag planen“ — mit der vorgewählten Person', async () => {
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(within(zeile).getByRole('button', { name: /Mittwoch 02\.09\.: frei – Einsatz planen/ }));
    await userEvent.selectOptions(await fenster().findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    await userEvent.click(fenster().getByRole('button', { name: 'Einsatz und Rüstliste speichern' }));
    await waitFor(() => expect(speichere).toHaveBeenCalled());
    const [, datum, baustelle, zeilen] = speichere.mock.calls[0];
    expect(datum).toBe(MITTWOCH);
    expect(baustelle).toBe('2026-042');
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ userId: 'u1', projectNumber: '2026-042' });
    // Gespeichert — das Fenster geht zu, der Plan steht dahinter.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('übernimmt eine vorhandene Planung, bevor gespeichert werden kann (kein stilles Überschreiben)', async () => {
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u2', userName: 'Erna Beispiel', comment: 'Bad' },
    ] as (Assignment & { id: string })[];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(within(zeile).getByRole('button', { name: /Mittwoch 02\.09\.: frei – Einsatz planen/ }));
    await userEvent.selectOptions(await fenster().findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    // Erna stand schon dort — sie bleibt, Max kommt dazu.
    await waitFor(() => expect(fenster().getByRole('checkbox', { name: /^Erna Beispiel/ })).toBeChecked());
    expect(fenster().getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked();
    expect(fenster().getByLabelText('Kommentar / Aufgabe')).toHaveValue('Bad');
  });

  it('löscht einen Einsatz im Fenster erst nach der Rückfrage', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(tabelle().getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09/ }));
    await userEvent.click(fenster().getByRole('button', { name: 'Einsatz von Max Mustermann löschen' }));
    // Gegenprobe: Abbrechen löscht nichts.
    const frage = fenster().getByRole('alertdialog', { name: 'Einsatz löschen?' });
    expect(frage).toHaveTextContent('Der Einsatz von Max Mustermann am Mi., 02.09.2026 wird entfernt.');
    await userEvent.click(within(frage).getByRole('button', { name: 'Abbrechen' }));
    expect(loesche).not.toHaveBeenCalled();
    await userEvent.click(fenster().getByRole('button', { name: 'Einsatz von Max Mustermann löschen' }));
    await userEvent.click(within(fenster().getByRole('alertdialog')).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(loesche).toHaveBeenCalledWith('a1'));
  });

  it('der Termin-Hinweis steht im Fenster direkt unter der Baustelle (Auftrag 4.6)', async () => {
    // Samstag: Hinweis „Wochenende“ und eine Lieferung auf derselben Baustelle.
    einsaetze = [{ ...EINSATZ_MAX, date: '2026-09-05' }];
    termineDerWoche = [{ id: 't1', companyId: 'perl', art: 'Lieferung', datum: '2026-09-05', zeitVon: '08:00', zeitBis: '10:00', projectNumber: '2026-042', teilnehmer: [], ortName: 'Familie Huber' }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(await tabelle().findByRole('button', { name: /Familie Huber \(2026-042\) am 05\.09/ }));
    const termin = await fenster().findByText(/Am selben Tag auf dieser Baustelle:/);
    const wochenende = fenster().getByText(/Wochenende\. Einsatz ist/);
    // Vor dem Hinweis „Wochenende“ — in „Tag planen“ bleibt die Reihenfolge (AssignmentsView.test).
    expect(termin.compareDocumentPosition(wochenende) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('„Einsatz planen“ im Kopf öffnet das Fenster für heute', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(screen.getAllByRole('button', { name: 'Einsatz planen' })[0]);
    expect(fenster().getByRole('combobox', { name: 'Tag' })).toHaveValue(MITTWOCH);
  });

  it('die Team-Woche hat kein „Einsatz planen“', async () => {
    render(<MemoryRouter><WochenplanView nurLesen /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Team-Woche' });
    expect(screen.queryByRole('button', { name: 'Einsatz planen' })).toBeNull();
  });
});

/*
  DER TAGESKOPF UND DAS SEITENFENSTER „TAG“ (Runde 4, Auftrag 4.3;
  Entscheidung R4-0, Frage 1): der Kopf öffnet den ganzen Tag im Fenster,
  „Tag planen“ ist von dort einen Tipp entfernt — mit Tag und, aus einem
  Einsatz heraus, Baustelle, wie vorher.
*/
describe('Einsatzplanung — Seitenfenster „Tag“', () => {
  it('der Kopf öffnet das Seitenfenster „Tag“; „In ‚Tag‘ öffnen“ führt nach „Tag planen“ mit dem Tag', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(kopf(/Mittwoch 02\.09\./));
    expect(gefahren.zu).toBeNull();
    const tag = within(screen.getByRole('dialog', { name: 'Mittwoch, 02.09.' }));
    expect(tag.getByText('KW 36')).toBeInTheDocument();
    await userEvent.click(tag.getByRole('button', { name: 'In „Tag“ öffnen' }));
    expect(gefahren.zu).toBe('/assignments/tag');
    expect(gefahren.zustand).toEqual({ datum: MITTWOCH, projectNumber: undefined });
  });

  it('… und aus dem Einsatz heraus über „Ganzen Tag ansehen“, mit Tag und Baustelle', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(tabelle().getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09/ }));
    await userEvent.click(fenster().getByRole('button', { name: 'Ganzen Tag ansehen' }));
    const tag = within(screen.getByRole('dialog', { name: 'Mittwoch, 02.09.' }));
    await userEvent.click(tag.getByRole('button', { name: 'In „Tag“ öffnen' }));
    expect(gefahren.zu).toBe('/assignments/tag');
    expect(gefahren.zustand).toEqual({ datum: MITTWOCH, projectNumber: '2026-042' });
  });

  it('zeigt Termine, Einsätze je Baustelle, wer frei ist und wer fehlt — und plant von dort', async () => {
    leute = [mk('u1', 'Max Mustermann'), mk('u2', 'Erna Beispiel'), mk('u3', 'Otto Beispiel')];
    einsaetze = [EINSATZ_MAX];
    abwesend = [{ userId: 'u3', von: MITTWOCH, bis: MITTWOCH, grund: 'Urlaub', zeiten: null }];
    termineDerWoche = [
      { id: 't1', companyId: 'perl', art: 'Lieferung', datum: MITTWOCH, zeitVon: '08:00', zeitBis: '10:00', projectNumber: '2026-042', teilnehmer: [], ortName: 'Familie Huber' },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(kopf(/Mittwoch 02\.09\./));
    const tag = within(screen.getByRole('dialog', { name: 'Mittwoch, 02.09.' }));
    const termine = within(tag.getByRole('region', { name: 'Termine am Mi 02.09.' }));
    expect(termine.getByRole('button', { name: 'Lieferung (Aviso) · 08:00–10:00' })).toBeInTheDocument();
    // Die Lieferung hat jemanden auf der Baustelle — kein „niemand dort“.
    expect(termine.queryByText('niemand dort')).toBeNull();
    const einsaetzeAmTag = within(tag.getByRole('region', { name: 'Einsätze' }));
    expect(einsaetzeAmTag.getByText(/2026-042 · ganztags · Max Mustermann/)).toBeInTheDocument();
    expect(einsaetzeAmTag.getByText('Am selben Tag: Lieferung (Aviso) · 08:00–10:00')).toBeInTheDocument();
    const frei = within(tag.getByRole('region', { name: 'Frei' }));
    expect(frei.getByText('Erna Beispiel')).toBeInTheDocument();
    expect(frei.getByText('abwesend: Urlaub')).toBeInTheDocument();
    // „Einsatz planen“ an der freien Person: Fenster mit Tag und Person.
    await userEvent.click(frei.getByRole('button', { name: 'Erna Beispiel am Mi 02.09. einteilen' }));
    expect(screen.getByRole('dialog', { name: 'Einsatz planen' })).toBeInTheDocument();
    expect(fenster().getByRole('checkbox', { name: /^Erna Beispiel/ })).toBeChecked();
  });

  it('„Bearbeiten“ an der Baustelle öffnet dasselbe Fenster wie der Block im Raster', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(kopf(/Mittwoch 02\.09\./));
    await userEvent.click(fenster().getByRole('button', { name: 'Familie Huber (2026-042) bearbeiten' }));
    expect(screen.getByRole('dialog', { name: 'Einsatz bearbeiten' })).toBeInTheDocument();
    await waitFor(() => expect(fenster().getByRole('combobox', { name: /Baustelle/ })).toHaveValue('2026-042'));
  });

  it('am Wochenende heißt es „Ohne Einsatz“, nicht „Frei“', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(kopf(/Samstag 05\.09\./));
    expect(fenster().getByRole('heading', { name: 'Ohne Einsatz' })).toBeInTheDocument();
    expect(fenster().getByText('Keine Termine an diesem Tag.')).toBeInTheDocument();
    expect(fenster().getByText('Noch kein Einsatz an diesem Tag.')).toBeInTheDocument();
  });
});

describe('Wochenplan — zwei Baustellen desselben Kunden (Design-Überarbeitung, Punkt 7)', () => {
  /**
   * Ein Kunde kann mehrere Baustellen haben. Stünde auf der Karte nur der
   * Name, sähen zwei Einsätze bei „Familie Huber" gleich aus — welcher ins
   * Haus und welcher in die Wohnung geht, wüsste niemand.
   */
  beforeEach(() => {
    BAUSTELLEN.push({
      id: 'p2', companyId: 'perl', projectNumber: 'PR-187', customerName: 'Familie Huber', status: 'Aktiv',
    } as Project);
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' },
      { id: 'a2', companyId: 'perl', date: MITTWOCH, projectNumber: 'PR-187', userId: 'u1', userName: 'Max Mustermann' },
    ] as (Assignment & { id: string })[];
  });
  afterEach(() => {
    BAUSTELLEN.splice(1);
  });

  it('nennt im Raster an jedem Block Kunde UND Nummer', async () => {
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    const karten = within(zeile).getAllByRole('button', { name: /Familie Huber .* am 02\.09/ });
    expect(karten).toHaveLength(2);
    expect(karten.map((k) => k.textContent)).toEqual(
      expect.arrayContaining(['Familie Huber2026-042', 'Familie HuberPR-187']),
    );
  });

  /*
    AUCH FÜR DIE VORLESEHILFE ZWEI VERSCHIEDENE BLÖCKE — mit Nummer, seit
    Runde 4 auch mit der Person (Auftrag Abschnitt 8: Person, Tag, Zustand).
  */
  it('gibt beiden Blöcken verschiedene zugängliche Namen — mit der Nummer und der Person', async () => {
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(
      within(zeile).getByRole('button', { name: /^Familie Huber \(2026-042\) am 02\.09\.? bearbeiten – Max Mustermann$/ }),
    ).toBeInTheDocument();
    expect(
      within(zeile).getByRole('button', { name: /^Familie Huber \(PR-187\) am 02\.09\.? bearbeiten – Max Mustermann$/ }),
    ).toBeInTheDocument();
    expect(liste().getByRole('button', { name: /^Familie Huber \(2026-042\) am/ })).toBeInTheDocument();
    expect(liste().getByRole('button', { name: /^Familie Huber \(PR-187\) am/ })).toBeInTheDocument();
  });

  it('nennt in der Tagesliste am Handy an jedem Block Kunde UND Nummer', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    const karten = liste().getAllByRole('button', { name: /Familie Huber .* am 02\.09/ });
    expect(karten).toHaveLength(2);
    expect(karten.some((k) => k.textContent?.includes('2026-042'))).toBe(true);
    expect(karten.some((k) => k.textContent?.includes('PR-187'))).toBe(true);
  });
});

describe('Wochenplan — Woche wechseln', () => {
  it('hat Blätterpfeile mit vollem Ziel, auch am Schreibtisch gut sichtbar', async () => {
    /**
     * 48 × 48 px wie die Monatspfeile im Kalender — `min-h-touch` bringt
     * `Button` mit. jsdom misst nicht; geprüft wird, dass die Klassen da sind.
     */
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    for (const name of ['Woche zurück', 'Woche vor']) {
      const pfeil = screen.getByRole('button', { name });
      expect(pfeil.className).toMatch(/(^|\s)min-h-touch(\s|$)/);
      expect(pfeil.className).toMatch(/(^|\s)min-w-touch(\s|$)/);
      expect(pfeil.className).toMatch(/(^|\s)sm:text-xl(\s|$)/);
    }
  });

  it('geht eine Woche vor und wieder zurueck', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });

    await userEvent.click(screen.getByRole('button', { name: 'Woche vor' }));
    await waitFor(() => expect(kopf(/Montag 07\.09\./)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Diese Woche' }));
    await waitFor(() => expect(kopf(/Montag 31\.08\./)).toBeInTheDocument());
  });
});

/*
  DIE ADRESSE (Runde 4): `?woche=2026-W38&tag=2026-09-16` zeigt diese Woche
  mit markiertem Tag; ohne die Angaben ist alles wie vorher.
*/
describe('Einsatzplanung — Woche und Tag aus der Adresse', () => {
  it('öffnet die Woche aus `?woche=` und markiert den Tag aus `?tag=`', async () => {
    zeige('/assignments/woche?woche=2026-W38&tag=2026-09-16');
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(screen.getByText(/^KW 38/)).toBeInTheDocument();
    expect(kopf(/Mittwoch 16\.09\./).closest('th')!.className).toBe('wp-kopf-markiert');
    // Gegenprobe: die übrigen Tage sind nicht markiert.
    expect(kopf(/Dienstag 15\.09\./).closest('th')!.className).toBe('wp-kopf');
  });

  it('blättern nimmt Woche und Markierung aus der Adresse', async () => {
    zeige('/assignments/woche?woche=2026-W38&tag=2026-09-16');
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(screen.getByRole('button', { name: 'Woche vor' }));
    await waitFor(() => expect(screen.getByLabelText('Adresse')).toHaveTextContent(/^$/));
    expect(screen.getByText(/^KW 39/)).toBeInTheDocument();
  });

  it('eine kaputte Woche in der Adresse zeigt die laufende', async () => {
    zeige('/assignments/woche?woche=2026-W99');
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(screen.getByText(/^KW 36/)).toBeInTheDocument();
  });
});

describe('Wochenplan — die Tagesliste am Handy (Auftrag 4.7)', () => {
  /**
   * SIEBEN SPALTEN AUF 390 px SIND KEINE TABELLE, sondern ein Guckloch. Am
   * Handy stehen die Tage als Leiste, darunter der gewählte Tag: Termine,
   * dann je Einstufung die Personen mit ihren Blöcken.
   */
  it('zeigt den heutigen Tag mit den Personen und ihren Einsätzen', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(liste().getByRole('button', { name: /^Mittwoch 02\.09\./ })).toHaveAttribute('aria-pressed', 'true');
    expect(liste().getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09\. bearbeiten – Max Mustermann/ })).toBeInTheDocument();
  });

  it('wer frei ist, trägt „frei – Einsatz planen“ — mit dem Tag gewählt', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    // Max ist eingeteilt, Erna frei.
    expect(liste().queryByRole('button', { name: 'Max Mustermann am 02.09. einteilen' })).toBeNull();
    await userEvent.click(liste().getByRole('button', { name: 'Erna Beispiel am 02.09. einteilen' }));
    expect(within(screen.getByRole('dialog', { name: 'Einsatz planen' })).getByRole('combobox', { name: 'Tag' })).toHaveValue(MITTWOCH);
    expect(fenster().getByRole('checkbox', { name: /^Erna Beispiel/ })).toBeChecked();
    expect(gefahren.zu).toBeNull();
  });

  it('nennt die Abwesenheit beim Namen', async () => {
    abwesend = [{ userId: 'u2', von: '2026-08-31', bis: '2026-09-04', grund: 'Urlaub', zeiten: null }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(liste().getByText('Urlaub')).toBeInTheDocument();
    expect(liste().queryByRole('button', { name: 'Erna Beispiel am 02.09. einteilen' })).toBeNull();
  });

  it('wechselt den Tag über die Leiste; die Punkte sagen Termine und Lieferung ohne Annahme', async () => {
    termineDerWoche = [
      { id: 't1', companyId: 'perl', art: 'Lieferung', datum: '2026-09-03', zeitVon: '08:00', zeitBis: '10:00', projectNumber: '2026-042', teilnehmer: [], ortName: 'Familie Huber' },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    const donnerstag = await liste().findByRole('button', { name: 'Donnerstag 03.09., 1 Termin, Lieferung ohne Annahme' });
    await userEvent.click(donnerstag);
    expect(donnerstag).toHaveAttribute('aria-pressed', 'true');
    expect(liste().getByText('niemand dort')).toBeInTheDocument();
    await userEvent.click(liste().getByRole('button', { name: /08:00–10:00 Lieferung/ }));
    expect(screen.getByRole('dialog', { name: 'Termin ändern' })).toBeInTheDocument();
  });

  it('„Ganzen Tag ansehen“ öffnet das Seitenfenster „Tag“ — dort die Baustellen mit ihren Leuten', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(liste().getByRole('button', { name: 'Ganzen Tag ansehen' }));
    expect(within(screen.getByRole('dialog', { name: 'Mittwoch, 02.09.' })).getByText(/Max Mustermann/)).toBeInTheDocument();
  });
});

/**
 * ZEITAUSGLEICH, KRANKENSTAND, BETRIEBSURLAUB im Wochenplan.
 *
 * Gewünscht: der Betriebsurlaub sperrt den Plan für alle als grauer Block;
 * die Planung sieht den Grund („ZA – 4 Std.", „Urlaub"), Kollegen nur
 * „abwesend". Wer den Grund bekommt, entscheidet die Datenbank — hier wird
 * geprüft, dass die Ansicht zeigt, was sie bekommt, und richtig zählt.
 */
describe('Wochenplan — Abwesenheiten mit Grund', () => {
  it('stundenweiser ZA: steht in der Zelle, der Mitarbeiter bleibt einplanbar', async () => {
    abwesend = [{ userId: 'u2', von: MITTWOCH, bis: MITTWOCH, grund: 'ZA', zeiten: '13:00–17:00' }];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(zeile).getByText('ZA 13:00–17:00')).toBeInTheDocument();
    // Beide frei: vormittags ist Erna da.
    expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('2 frei');
  });

  it('ganztägig abwesend ohne Grund heißt „abwesend“ — und zählt nicht als frei', async () => {
    // So sieht die Projektleitung einen Krankenstand.
    abwesend = [{ userId: 'u2', von: MITTWOCH, bis: MITTWOCH, grund: null, zeiten: null }];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(zeile).getByText('abwesend')).toBeInTheDocument();
    expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('1 frei');
  });

  it('Betriebsurlaub: grauer Block für alle, niemand frei — außer wer eingeteilt ist', async () => {
    betriebsurlaube = [{ id: 'b1', von: MITTWOCH, bis: MITTWOCH, bezeichnung: 'Betriebsurlaub' }];
    einsaetze = [EINSATZ_MAX];
    zeige();
    const erna = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(erna).getByText('Betriebsurlaub')).toBeInTheDocument();
    const max = screen.getByRole('row', { name: /Max Mustermann/ });
    expect(within(max).getAllByText('Familie Huber').length).toBeGreaterThan(0);
    expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('Betriebsurlaub');
    expect(kopf(/Mittwoch 02\.09\./)).not.toHaveTextContent('frei');
    expect(liste().queryByRole('button', { name: 'Erna Beispiel am 02.09. einteilen' })).toBeNull();
  });

  /*
    AUSGENOMMEN (gewünscht am 24.09.2026): wer beim Betriebsurlaub
    ausgenommen ist, arbeitet — er ist frei und einteilbar, die anderen
    haben weiter den grauen Block.
  */
  it('Betriebsurlaub mit Ausnahme: der Ausgenommene ist frei und einteilbar', async () => {
    betriebsurlaube = [{ id: 'b1', von: MITTWOCH, bis: MITTWOCH, bezeichnung: 'Betriebsurlaub', ausgenommen: ['u2'] }];
    zeige();
    const erna = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(erna).queryByText('Betriebsurlaub')).not.toBeInTheDocument();
    const max = screen.getByRole('row', { name: /Max Mustermann/ });
    expect(within(max).getByText('Betriebsurlaub')).toBeInTheDocument();
    expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('Betriebsurlaub · 1 frei');
    expect(liste().getByRole('button', { name: 'Erna Beispiel am 02.09. einteilen' })).toBeInTheDocument();
    expect(liste().queryByRole('button', { name: 'Max Mustermann am 02.09. einteilen' })).toBeNull();
  });
});

/*
  TESTBERICHT 30.09.2026, M33 — eine Krankmeldung verdrängt den Einsatz
  nicht mehr: er steht mit „fehlt“ da, und ist niemand mehr dort,
  „Unbesetzt“.
*/
describe('Wochenplan — eingeteilt und krank (M33)', () => {
  const MI = '2026-09-02';

  it('der Einsatz bleibt sichtbar: im Raster „fehlt: Krank“, im Fenster „Unbesetzt — fehlt: Erna (Krank)“', async () => {
    einsaetze = [{ id: 'e1', companyId: 'perl', date: MI, projectNumber: BAUSTELLEN[0].projectNumber, userId: 'u2', userName: 'Erna Beispiel' }];
    abwesend = [{ userId: 'u2', von: MI, bis: MI, grund: 'Krank', zeiten: null }];
    zeige();
    const erna = await screen.findByRole('row', { name: /Erna Beispiel/ });
    const block = within(erna).getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09\. bearbeiten – Erna Beispiel, eingeteilt, fehlt: Krank/ });
    expect(block).toHaveTextContent('Familie Huberfehlt: Krank');
    await userEvent.click(kopf(/Mittwoch 02\.09\./));
    expect(fenster().getByText(/Unbesetzt — fehlt: Erna Beispiel \(Krank\)/)).toBeInTheDocument();
  });

  it('mit einem Zweiten vor Ort ist sie besetzt — es fehlt nur einer', async () => {
    einsaetze = [
      { id: 'e1', companyId: 'perl', date: MI, projectNumber: BAUSTELLEN[0].projectNumber, userId: 'u2', userName: 'Erna Beispiel' },
      { id: 'e2', companyId: 'perl', date: MI, projectNumber: BAUSTELLEN[0].projectNumber, userId: 'u1', userName: 'Max Mustermann' },
    ];
    abwesend = [{ userId: 'u2', von: MI, bis: MI, grund: 'Krank', zeiten: null }];
    zeige();
    await screen.findByRole('row', { name: /Erna Beispiel/ });
    await userEvent.click(kopf(/Mittwoch 02\.09\./));
    expect(fenster().getByText(/^fehlt: Erna Beispiel \(Krank\)/)).toBeInTheDocument();
    expect(fenster().queryByText(/Unbesetzt/)).toBeNull();
  });
});

/*
  TERMINE (Runde 4, Auftrag 4.4): keine eigene Zeile mehr. Ein Termin steht
  in der Zelle jedes Teilnehmers im Raster, als Zusatzzeile am Einsatz seiner
  Baustelle (nicht bei dem, der selbst teilnimmt), „N Termine“ im Kopf zählt
  alle; jeder ist anklickbar und öffnet „Termin ändern“.
*/
describe('Termine in der Einsatzplanung (Runde 4)', () => {
  const LIEFERUNG: Termin = {
    id: 't1', companyId: 'perl', art: 'Lieferung', datum: MITTWOCH, zeitVon: '08:00', zeitBis: '10:00',
    projectNumber: '2026-042', customerId: null, teilnehmer: ['u2'], ortName: 'Familie Huber',
  };

  it('stehen nicht mehr als eigene Zeile — sondern in der Zelle des Teilnehmers und am Einsatz der Baustelle', async () => {
    einsaetze = [EINSATZ_MAX, { ...EINSATZ_MAX, id: 'a2', userId: 'u2', userName: 'Erna Beispiel' }];
    termineDerWoche = [LIEFERUNG];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(tabelle().queryByRole('rowheader', { name: 'Termine' })).toBeNull();
    // Erna nimmt teil: der Termin-Eintrag in ihrer Zelle, keine Zusatzzeile in ihrem Block.
    const erna = tabelle().getByRole('row', { name: /Erna Beispiel/ });
    expect(await within(erna).findByRole('button', { name: /^Lieferung \(Aviso\) am 02\.09\., 08:00–10:00, Familie Huber – Erna Beispiel – Termin ändern$/ })).toBeInTheDocument();
    expect(within(erna).getByRole('button', { name: /bearbeiten – Erna Beispiel/ })).not.toHaveTextContent('Lieferung');
    // Max nimmt nicht teil, steht aber auf der Baustelle: die Zusatzzeile.
    const max = tabelle().getByRole('row', { name: /Max Mustermann/ });
    expect(within(max).getByRole('button', { name: /bearbeiten – Max Mustermann/ })).toHaveTextContent('Lieferung 08:00–10:00');
    expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('1 Termin');
  });

  it('ein Klick öffnet „Termin ändern“ mit demselben Formular — Löschen erst nach der Rückfrage', async () => {
    termineDerWoche = [LIEFERUNG];
    zeige();
    const erna = await screen.findByRole('row', { name: /Erna Beispiel/ });
    await userEvent.click(await within(erna).findByRole('button', { name: /Termin ändern$/ }));
    const dialog = within(screen.getByRole('dialog', { name: 'Termin ändern' }));
    expect(dialog.getByRole('combobox', { name: 'Art' })).toHaveValue('Lieferung');
    expect(dialog.getByLabelText('Zeitfenster von')).toHaveValue('08:00');
    await userEvent.click(dialog.getByRole('button', { name: /Lieferung \(Aviso\) · 08:00–10:00 am .* löschen/ }));
    const frage = screen.getByRole('dialog', { name: 'Termin löschen?' });
    // Gegenprobe: Abbrechen löscht nichts.
    await userEvent.click(within(frage).getByRole('button', { name: 'Abbrechen' }));
    expect(terminGeloescht).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole('button', { name: /löschen/ }));
    termineGeladen.mockClear();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Termin löschen?' })).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(terminGeloescht).toHaveBeenCalledWith('t1'));
    // Danach lädt die Seite die Termine mit derselben Abfrage neu.
    await waitFor(() => expect(termineGeladen).toHaveBeenCalled());
  });

  it('„Lieferung ohne Annahme“ im Kopf, wenn auf der Baustelle niemand eingeteilt ist — Gegenprobe mit Einsatz', async () => {
    termineDerWoche = [{ ...LIEFERUNG, teilnehmer: [] }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await waitFor(() => expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('Lieferung ohne Annahme'));
    expect(kopf(/Mittwoch 02\.09\./).querySelector('.kopf-warnung')).not.toBeNull();
  });

  it('Gegenprobe: mit einem Einsatz auf der Baustelle kein Hinweis', async () => {
    einsaetze = [EINSATZ_MAX];
    termineDerWoche = [{ ...LIEFERUNG, teilnehmer: [] }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await waitFor(() => expect(kopf(/Mittwoch 02\.09\./)).toHaveTextContent('1 Termin'));
    expect(kopf(/Mittwoch 02\.09\./)).not.toHaveTextContent('ohne Annahme');
  });

  it('JEDER TERMIN DER WOCHE IST ERREICHBAR (Abnahme 4.9) — auch ohne Baustelle und mit Teilnehmern außerhalb des Rasters', async () => {
    einsaetze = [EINSATZ_MAX];
    termineDerWoche = [
      { ...LIEFERUNG, id: 'mit-teilnehmer', teilnehmer: ['u2'] },
      { ...LIEFERUNG, id: 'nur-baustelle', datum: '2026-09-01', teilnehmer: [], art: 'Abnahme', zeitVon: null, zeitBis: null },
      { id: 'ohne-baustelle', companyId: 'perl', art: 'Besichtigung', datum: '2026-09-03', zeitVon: '14:00', zeitBis: '15:00', customerId: 'k1', projectNumber: null, teilnehmer: [], ortName: 'Familie Ortner' },
      { id: 'buero', companyId: 'perl', art: 'Behörde', datum: '2026-09-04', projectNumber: null, customerId: 'k2', teilnehmer: ['buero-uid'], ortName: 'Magistrat' },
    ] as Termin[];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await waitFor(() => expect(kopf(/Freitag 04\.09\./)).toHaveTextContent('1 Termin'));
    for (const t of termineDerWoche) {
      const tag = new Date(`${t.datum}T00:00:00`);
      const wochentag = tag.toLocaleDateString('de-AT', { weekday: 'long' });
      const datum = tag.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
      // Über den Kopf: „N Termine“ zählt ihn, das Seitenfenster „Tag“ führt ihn auf.
      expect(kopf(new RegExp(`${wochentag} ${datum.replace(/\./g, '\\.')}`)), t.id).toHaveTextContent(/\d Termine?/);
      await userEvent.click(kopf(new RegExp(`${wochentag} ${datum.replace(/\./g, '\\.')}`)));
      const zeile = within(screen.getByRole('region', { name: /^Termine am / }))
        .getAllByRole('button')
        .find((b) => b.textContent !== 'Termin anlegen')!;
      await userEvent.click(zeile);
      expect(within(screen.getByRole('dialog', { name: 'Termin ändern' })).getByRole('combobox', { name: 'Art' }), t.id).toHaveValue(t.art);
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Termin ändern' })).getByRole('button', { name: 'Abbrechen' }));
    }
  });

  it('in der Sicht nach Baustellen stehen die Termine der Baustelle am Tag', async () => {
    einsaetze = [EINSATZ_MAX];
    termineDerWoche = [{ ...LIEFERUNG, teilnehmer: [] }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(screen.getByRole('button', { name: 'Baustellen' }));
    const raster = within(screen.getByRole('table', { name: 'Wochenplan nach Baustellen' }));
    expect(await raster.findByRole('button', { name: /^Lieferung \(Aviso\) am 02\.09\..*Familie Huber – Termin ändern$/ })).toBeInTheDocument();
  });
});

describe('Der ganze Plan im eigenen Kalender (Plan 10.4, PR B)', () => {
  it('steht unter dem Wochenplan, wenn der Betrieb das Abo erlaubt — mit der Art „gesamt"', async () => {
    authWert.company = { id: 'perl', name: 'Perl Installationen', kalenderAboErlaubt: true };
    zeige();
    expect(await screen.findByRole('heading', { name: /Im eigenen Kalender/ })).toBeInTheDocument();
    await waitFor(() => expect(kalenderAboStand).toHaveBeenCalledWith('pl', 'gesamt'));
  });

  it('nicht ohne Erlaubnis des Betriebs', async () => {
    zeige();
    await screen.findByRole('table', { name: 'Wochenplan als Tabelle' });
    expect(screen.queryByRole('heading', { name: /Im eigenen Kalender/ })).not.toBeInTheDocument();
  });

  it('nicht in der Team-Woche der Monteure', async () => {
    authWert.company = { id: 'perl', name: 'Perl Installationen', kalenderAboErlaubt: true };
    render(<MemoryRouter><ToastProvider><WochenplanView nurLesen /></ToastProvider></MemoryRouter>);
    await screen.findByRole('table', { name: 'Wochenplan als Tabelle' });
    expect(screen.queryByRole('heading', { name: /Im eigenen Kalender/ })).not.toBeInTheDocument();
  });
});

/*
  DER KOPF DER PLANUNG (Linie „Lot“, E2): groß „Diese Woche“, klein die KW.
*/
describe('Planung — Kopf', () => {
  it('nennt die Woche beim Namen und die Kalenderwoche darunter', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(screen.getByRole('heading', { name: 'Diese Woche' })).toBeInTheDocument();
    expect(screen.getByText('KW 36 · 31.08. – 06.09.')).toBeInTheDocument();
    // Auf der laufenden Woche gibt es nichts zurückzuspringen.
    expect(screen.queryByRole('button', { name: 'Diese Woche' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Woche vor' }));
    expect(screen.getByRole('heading', { name: 'Nächste Woche' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diese Woche' })).toBeInTheDocument();
  });
});

/*
  KONFLIKTE IN BERNSTEIN (Linie „Lot“, E2): eingeteilt und abwesend ist
  kein Fehler, sondern ein Konflikt — Bernstein, nicht Rot.
*/
describe('Planung — Konflikte', () => {
  it('ein eingeteilter Abwesender steht als Konflikt da, ein normaler Einsatz nicht (Gegenprobe)', async () => {
    einsaetze = [
      { id: 'e1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u2', userName: 'Erna Beispiel' },
      { id: 'e2', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' },
    ] as (Assignment & { id: string })[];
    abwesend = [{ userId: 'u2', von: MITTWOCH, bis: MITTWOCH, grund: 'Krank', zeiten: null }];
    zeige();
    const erna = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(erna).getByRole('button', { name: /bearbeiten – Erna Beispiel, eingeteilt, fehlt: Krank/ }).className).toBe('eintrag-konflikt');
    const max = tabelle().getByRole('row', { name: /Max Mustermann/ });
    expect(within(max).getByRole('button', { name: /Familie Huber \(2026-042\)/ }).className).toBe('eintrag');
  });

  it('„als Helfer“ steht im Block, wo es von der Einstufung abweicht — beim Helfer nicht (Gegenprobe)', async () => {
    leute = [mk('u1', 'Max Mustermann'), { ...mk('u2', 'Erna Beispiel'), einstufung: 'helfer' } as AppUser];
    einsaetze = [
      { ...EINSATZ_MAX, asHelper: true },
      { ...EINSATZ_MAX, id: 'a2', userId: 'u2', userName: 'Erna Beispiel', asHelper: true },
    ];
    zeige();
    const max = await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(within(max).getByRole('button', { name: /Familie Huber/ })).toHaveTextContent('als Helfer');
    const erna = tabelle().getByRole('row', { name: /Erna Beispiel/ });
    expect(within(erna).getByRole('button', { name: /Familie Huber/ })).not.toHaveTextContent('als Helfer');
    // Der volle Text — mit den Helfern — steht im `title`.
    expect(within(erna).getByRole('button', { name: /Familie Huber/ }).title).toMatch(/Erna Beispiel \(Helfer\)/);
  });
});

/*
  VIELE DATEN (Linie „Lot“, E2): Personen nach Einstufung gruppiert und
  einklappbar. Bei einer einzigen Gruppe kein Kopf — das wäre Zierrat.
*/
describe('Planung — Personen nach Einstufung', () => {
  it('gruppiert nach Einstufung — eine Gruppe lässt sich einklappen', async () => {
    leute = [mk('u1', 'Max Mustermann'), { ...mk('u2', 'Erna Beispiel'), einstufung: 'helfer' } as AppUser];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    const helfer = tabelle().getByRole('button', { name: 'Helfer · 1' });
    expect(tabelle().getByRole('button', { name: 'Facharbeiter · 1' })).toHaveAttribute('aria-expanded', 'true');
    expect(tabelle().getByRole('row', { name: /Erna Beispiel/ })).toBeInTheDocument();
    await userEvent.click(helfer);
    expect(helfer).toHaveAttribute('aria-expanded', 'false');
    expect(tabelle().queryByRole('row', { name: /Erna Beispiel/ })).toBeNull();
    expect(tabelle().getByRole('row', { name: /Max Mustermann/ })).toBeInTheDocument();
  });

  it('ohne verschiedene Einstufungen keine Gruppenköpfe', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(tabelle().queryByRole('button', { name: /Facharbeiter · / })).toBeNull();
  });
});

/*
  DIE SICHT NACH BAUSTELLEN (Auftrag 4.5): Baustellen mit Einsatz oder Termin
  in der Woche; die Eingeteilten in Kurzform, die vollen Namen im `title`;
  ein leerer Tag plant genau diese Baustelle ein.
*/
describe('Planung — Sicht nach Baustellen', () => {
  it('zeigt die eingeplanten Baustellen mit ihren Leuten und plant von dort ein', async () => {
    einsaetze = [{ ...EINSATZ_MAX, asHelper: true }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(screen.getByRole('button', { name: 'Baustellen' }));
    const raster = within(screen.getByRole('table', { name: 'Wochenplan nach Baustellen' }));
    const block = raster.getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09\. bearbeiten/ });
    expect(block).toHaveTextContent('Max M.');
    expect(block.title).toBe('Max Mustermann (Helfer)');
    await userEvent.click(raster.getByRole('button', { name: /Familie Huber \(2026-042\) am 03\.09\. einplanen/ }));
    const dialog = within(screen.getByRole('dialog', { name: 'Einsatz planen' }));
    expect(dialog.getByRole('combobox', { name: 'Tag' })).toHaveValue('2026-09-03');
    await waitFor(() => expect(dialog.getByRole('combobox', { name: /Baustelle/ })).toHaveValue('2026-042'));
  });

  it('wer fehlt, steht in Bernstein mit „… fehlt“', async () => {
    einsaetze = [{ ...EINSATZ_MAX, userId: 'u2', userName: 'Erna Beispiel' }];
    abwesend = [{ userId: 'u2', von: MITTWOCH, bis: MITTWOCH, grund: 'Krank', zeiten: null }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(screen.getByRole('button', { name: 'Baustellen' }));
    const raster = within(screen.getByRole('table', { name: 'Wochenplan nach Baustellen' }));
    const block = raster.getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09\. bearbeiten/ });
    expect(block.className).toBe('eintrag-konflikt');
    expect(block).toHaveTextContent('Erna B. fehlt');
  });
});

/*
  NOCH EINZUPLANEN (Auftrag 4.1): laufende Baustellen ohne Einsatz in der
  Woche — dieselbe Menge wie vorher, jetzt als Hinweiszeile über dem Raster
  und die Liste im Seitenfenster.
*/
describe('Planung — Noch einzuplanen', () => {
  afterEach(() => {
    BAUSTELLEN.splice(1);
  });

  it('nennt eine laufende Baustelle ohne Einsatz und plant sie auf Tipp ein — am nächsten Arbeitstag ab heute', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(screen.getByText(/1 laufende Baustelle ohne Einsatz in dieser Woche: Familie Huber/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Noch einzuplanen …' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Noch einzuplanen' })).getByRole('button', { name: 'Familie Huber' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Einsatz planen' }));
    await waitFor(() => expect(dialog.getByRole('combobox', { name: /Baustelle/ })).toHaveValue('2026-042'));
    expect(dialog.getByRole('combobox', { name: 'Tag' })).toHaveValue(MITTWOCH);
  });

  it('Gegenprobe: mit einem Einsatz in der Woche steht sie nicht dort — und die Zeile entfällt', async () => {
    einsaetze = [EINSATZ_MAX];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(screen.queryByText(/laufende Baustelle/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Noch einzuplanen …' })).toBeNull();
  });

  it('dieselbe Menge wie vorher: alle laufenden Baustellen ohne Einsatz in dieser Woche, 20 und „und N weitere“', async () => {
    for (let i = 1; i <= 23; i++) {
      BAUSTELLEN.push({ id: `x${i}`, companyId: 'perl', projectNumber: `X-${String(i).padStart(2, '0')}`, customerName: `Kunde ${String(i).padStart(2, '0')}`, status: 'Aktiv' } as Project);
    }
    // Eine mit Einsatz in der Woche, eine mit Einsatz nur in der Woche davor.
    einsaetze = [
      { ...EINSATZ_MAX, projectNumber: 'X-01' },
      { ...EINSATZ_MAX, id: 'alt', date: '2026-08-28', projectNumber: 'X-02' },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(screen.getByText(/23 laufende Baustellen ohne Einsatz in dieser Woche: Familie Huber, Kunde 02, Kunde 03 und 20 weitere/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Noch einzuplanen …' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Noch einzuplanen' }));
    expect(dialog.queryByRole('button', { name: 'Kunde 01' })).toBeNull();
    expect(dialog.getAllByRole('listitem')).toHaveLength(20);
    await userEvent.click(dialog.getByRole('button', { name: 'und 3 weitere anzeigen' }));
    const alle = dialog.getAllByRole('listitem').map((li) => li.textContent);
    expect(alle).toHaveLength(23);
    expect(alle[0]).toContain('Familie Huber');
    expect(alle).toEqual(expect.arrayContaining([expect.stringContaining('Kunde 02'), expect.stringContaining('Kunde 23')]));
  });
});

/*
  DER MONAT (Linie „Lot“, E2): dieselben Abfragen über den Monat, je Person
  und Tag eingeplant, abwesend, frei; ein Tag springt in die Woche — seit
  Runde 4 als neuer Eintrag im Verlauf mit `?woche=&tag=`, der Tag markiert.
*/
describe('Planung — Monat', () => {
  it('lädt den Monat, zeigt je Person und Tag den Stand und springt von einem Tag in die Woche', async () => {
    einsaetze = [EINSATZ_MAX];
    abwesend = [{ userId: 'u2', von: '2026-09-14', bis: '2026-09-18', grund: 'Urlaub', zeiten: null }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(screen.getByRole('button', { name: 'Monat' }));
    const monat = within(await screen.findByRole('table', { name: 'Monatsplan als Tabelle' }));
    expect(screen.getByRole('heading', { name: 'September' })).toBeInTheDocument();
    expect(geladen).toContainEqual(['2026-09-01', '2026-09-30']);
    const max = monat.getByRole('row', { name: /Max Mustermann/ });
    expect(within(max).getByText('eingeplant: Familie Huber (2026-042)')).toBeInTheDocument();
    const erna = monat.getByRole('row', { name: /Erna Beispiel/ });
    expect(within(erna).getAllByText('Urlaub')).toHaveLength(5);
    // Ein Tag springt in die Woche — markiert, mit der Woche in der Adresse.
    await userEvent.click(monat.getByRole('button', { name: /^Mo\.? 14\.09\. — Woche zeigen/ }));
    expect(await screen.findByRole('table', { name: 'Wochenplan als Tabelle' })).toBeInTheDocument();
    expect(screen.getByText(/^KW 38/)).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse')).toHaveTextContent('?woche=2026-W38&tag=2026-09-14');
    expect(kopf(/Montag 14\.09\./).closest('th')!.className).toBe('wp-kopf-markiert');
    // „Zurück“ führt in den Monat: der Sprung war ein neuer Eintrag im Verlauf.
    await userEvent.click(screen.getByRole('button', { name: 'Browser zurück' }));
    expect(await screen.findByRole('table', { name: 'Monatsplan als Tabelle' })).toBeInTheDocument();
  });

  it('Gegenprobe: die Team-Woche der Monteure hat keinen Monat', async () => {
    render(<MemoryRouter><WochenplanView nurLesen /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Team-Woche' });
    expect(screen.queryByRole('group', { name: 'Zeitraum' })).toBeNull();
  });
});
