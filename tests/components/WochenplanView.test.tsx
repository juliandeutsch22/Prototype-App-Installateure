import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Assignment, Project, Termin, Vacation } from '@/types';

/**
 * Das Wochenbrett — die Frage VOR der Tagesplanung: wer ist frei.
 *
 * Es schreibt nichts, und das ist eine Entscheidung. Das Speichern der
 * Einteilung ist ein „alles weg, dann alles neu" fuer das Paar aus Tag und
 * Baustelle; ein zweiter Schreibweg daneben hiesse, denselben gefaehrlichen
 * Vorgang zweimal richtig hinzubekommen und zweimal richtig zu halten.
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
vi.mock('@/lib/db/termine', () => ({
  listTermineImZeitraum: vi.fn(async () => termineDerWoche),
  listTermineDerBaustelle: vi.fn(async () => []),
  listTermineDesKunden: vi.fn(async () => []),
  terminAnlegen: vi.fn(async () => 'neu'),
  terminAendern: vi.fn(async () => undefined),
  terminLoeschen: vi.fn(async () => undefined),
}));
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
    cb(einsaetze);
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
  user: { uid: string; companyId: string; name: string; role: 'Projektleiter'; email: string; docId: string };
  company: { id: string; name: string; kalenderAboErlaubt?: boolean };
  [k: string]: unknown;
} = {
  user: { uid: 'pl', companyId: 'perl', name: 'Planer', role: 'Projektleiter' as const, email: 'pl@perl.at', docId: 'pl' },
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

function zeige() {
  // Mit Toast-Rahmen wie in `main.tsx`: die Karte des Kalender-Abos meldet darüber.
  return render(
    <MemoryRouter>
      <ToastProvider>
        <WochenplanView />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/**
 * Es gibt ZWEI Darstellungen derselben Woche: die Tabelle am Schreibtisch
 * und die Tagesliste auf dem Telefon. Im Browser blendet CSS eine davon aus,
 * in jsdom stehen beide im Baum — deshalb wird hier immer die gemeinte
 * eingegrenzt, statt blind im ganzen Bild zu suchen.
 */
const tabelle = () => within(screen.getByRole('table', { name: 'Wochenplan als Tabelle' }));
const liste = () => within(screen.getByRole('region', { name: 'Wochenplan als Liste' }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Mi, 02.09.2026 — die Woche beginnt also am Mo, 31.08.
  vi.setSystemTime(new Date(2026, 8, 2, 9, 0, 0));
  leute = [mk('u1', 'Max Mustermann'), mk('u2', 'Erna Beispiel')];
  einsaetze = [];
  urlaube = [];
  termineDerWoche = [];
  authWert.company = { id: 'perl', name: 'Perl Installationen' };
  abwesend = [];
  betriebsurlaube = [];
  gefahren.zu = null;
  gefahren.zustand = null;
  speichere.mockClear();
  loesche.mockClear();
  geladen.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Wochenplan — wer ist wo', () => {
  it('zeigt eine Zeile je Mitarbeiter und sieben Tage', async () => {
    zeige();
    expect(await screen.findByRole('row', { name: /Max Mustermann/ })).toBeInTheDocument();
    expect(tabelle().getByRole('row', { name: /Erna Beispiel/ })).toBeInTheDocument();
    // Kopfzeile plus zwei Mitarbeiter.
    expect(tabelle().getAllByRole('row')).toHaveLength(3);
  });

  it('teilt die Breite fest auf: Namensspalte fest, fünf gleich breite Werktage', async () => {
    /**
     * Prüflauf 25.09.2026, P4-01: im automatischen Tabellenlayout nahm ein
     * Tag mit langem Kundennamen bei 834 px die ganze Breite, Mo–Do
     * schrumpften auf 17–29 px und brachen je Buchstabe um. jsdom rechnet
     * kein Layout — geprüft wird deshalb, was das Layout festlegt: festes
     * Tabellenlayout und eine feste Breite der ersten Spalte (den Rest
     * teilen die Werktage gleich). Samstag und Sonntag sind bis 1280 px
     * schmäler (meist leer), damit die Werktage bei 834 px lesbar bleiben.
     * Gemessen im Browser bei 834 px: 112 px + 2 × 48 px + 5 × rund 64 px.
     */
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    const tab = screen.getByRole('table', { name: 'Wochenplan als Tabelle' });
    expect(tab.className).toMatch(/\btable-fixed\b/);
    const kopf = tab.querySelectorAll('thead th');
    expect(kopf).toHaveLength(8);
    expect(kopf[0].className).toMatch(/\bw-28\b/);
    // Die Werktage tragen KEINE eigene Breite — sonst wären sie nicht gleich.
    for (const th of Array.from(kopf).slice(1, 6)) expect(th.className).not.toMatch(/\bw-/);
    // Das Wochenende schmal, ab xl wieder gleich breit wie die Werktage.
    for (const th of Array.from(kopf).slice(6)) {
      expect(th.className).toMatch(/(^|\s)w-12(\s|$)/);
      expect(th.className).toMatch(/(^|\s)xl:w-auto(\s|$)/);
    }
  });

  it('setzt die Baustelle in die Zelle des eingeteilten Tages', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(within(zeile).getByText('Familie Huber')).toBeInTheDocument();
    // Und die Nummer: ein Kunde kann zwei Baustellen haben (Launch-Check 25.09.2026).
    expect(within(zeile).getByText('2026-042')).toBeInTheDocument();
    // Erna ist an dem Tag frei — ihre Zelle sagt das.
    const andere = tabelle().getByRole('row', { name: /Erna Beispiel/ });
    expect(within(andere).getAllByText('frei').length).toBeGreaterThan(0);
  });

  it('zaehlt, wie viele an einem Tag frei sind', async () => {
    /**
     * DIE ZAHL, WEGEN DER ES DIESES BRETT GIBT. „Wer ist Donnerstag frei"
     * war bisher nur zu beantworten, indem man sich durch sieben Tage
     * klickte und sich die Namen merkte.
     */
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    // Am Mittwoch ist einer von zweien eingeteilt, am Montag keiner.
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(tabelle().getByRole('button', { name: /Mi.*02\.09.*Tagesplanung/ })).toHaveTextContent(
      '1 frei',
    );
    expect(tabelle().getByRole('button', { name: /Mo.*31\.08.*Tagesplanung/ })).toHaveTextContent(
      '2 frei',
    );
  });

  it('zaehlt am Wochenende niemanden als frei (Prüflauf 24.09.2026, D15)', async () => {
    // Samstag „2 frei" las sich, als stünden zwei Leute zur Verfügung — es
    // ist aber schlicht niemand im Dienst.
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(tabelle().getByRole('button', { name: /Sa.*05\.09.*Tagesplanung/ })).not.toHaveTextContent(
      'frei',
    );
  });

  it('zeigt genehmigten Urlaub und zaehlt ihn NICHT als frei', async () => {
    // Wer frei hat, ist nicht verfuegbar, sondern abwesend. Ihn als frei zu
    // zaehlen hiesse, die Planung auf eine Zahl zu stuetzen, die luegt.
    abwesend = [{ userId: 'u2', von: '2026-08-31', bis: '2026-09-04', grund: 'Urlaub', zeiten: null }];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(zeile).getAllByText('Urlaub').length).toBeGreaterThan(0);
    expect(tabelle().getByRole('button', { name: /Mi.*02\.09.*Tagesplanung/ })).toHaveTextContent(
      '1 frei',
    );
  });
});

/*
  PLANEN IM SEITENFENSTER (Linie „Lot“, E2). Bis dahin führte jeder Tipp
  in die Tagesplanung; jetzt öffnet er das Fenster mit demselben Formular
  wie „Tag planen“ — Tag und Baustelle bzw. Person schon gewählt. Geschützt
  bleibt, was die alten Tests schützten: die Übergabe von Tag und Baustelle
  (jetzt ins Fenster), und dass eine freie Zelle KEINE Baustelle rät.
*/
describe('Wochenplan — planen im Seitenfenster', () => {
  const fenster = () => within(screen.getByRole('dialog'));

  it('ein Einsatz öffnet sich mit Tag UND Baustelle — zum Bearbeiten', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
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

  it('eine freie Zelle öffnet sich mit Tag und Person — ohne eine Baustelle zu raten', async () => {
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(within(zeile).getByRole('button', { name: /am 02\.09\. einteilen/ }));
    expect(screen.getByRole('dialog', { name: 'Einsatz planen' })).toBeInTheDocument();
    expect(fenster().getByRole('combobox', { name: 'Tag' })).toHaveValue(MITTWOCH);
    expect(fenster().getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked();
    expect(fenster().getByRole('checkbox', { name: /^Erna Beispiel/ })).not.toBeChecked();
    expect(await fenster().findByRole('combobox', { name: /Baustelle/ })).toHaveValue('');
  });

  it('speichert über dieselbe Funktion wie „Tag planen“ — mit der vorgewählten Person', async () => {
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(within(zeile).getByRole('button', { name: /am 02\.09\. einteilen/ }));
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
    await userEvent.click(within(zeile).getByRole('button', { name: /am 02\.09\. einteilen/ }));
    await userEvent.selectOptions(await fenster().findByRole('combobox', { name: /Baustelle/ }), '2026-042');
    // Erna stand schon dort — sie bleibt, Max kommt dazu.
    await waitFor(() => expect(fenster().getByRole('checkbox', { name: /^Erna Beispiel/ })).toBeChecked());
    expect(fenster().getByRole('checkbox', { name: /^Max Mustermann/ })).toBeChecked();
    expect(fenster().getByLabelText('Kommentar / Aufgabe')).toHaveValue('Bad');
  });

  it('löscht einen Einsatz im Fenster erst nach der Rückfrage', async () => {
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' } as Assignment & { id: string },
    ];
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

  it('der Tag bleibt einen Tipp entfernt: der Kopf führt in „Tag planen“ — mit dem Tag', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(tabelle().getByRole('button', { name: /Mi.*02\.09.*Tagesplanung/ }));
    expect(gefahren.zu).toBe('/assignments/tag');
    expect(gefahren.zustand).toEqual({ datum: MITTWOCH, projectNumber: undefined });
  });

  it('… und aus dem Fenster heraus, mit Tag und Baustelle', async () => {
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' } as Assignment & { id: string },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(tabelle().getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09/ }));
    await userEvent.click(fenster().getByRole('button', { name: /Ganzen Tag in „Tag planen“ öffnen/ }));
    expect(gefahren.zu).toBe('/assignments/tag');
    expect(gefahren.zustand).toEqual({ datum: MITTWOCH, projectNumber: '2026-042' });
  });

  it('„Einsatz planen“ im Kopf öffnet das Fenster für heute', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(screen.getByRole('button', { name: 'Einsatz planen' }));
    expect(fenster().getByRole('combobox', { name: 'Tag' })).toHaveValue(MITTWOCH);
  });

  it('die Team-Woche hat kein „Einsatz planen“', async () => {
    render(<MemoryRouter><WochenplanView nurLesen /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Team-Woche' });
    expect(screen.queryByRole('button', { name: 'Einsatz planen' })).toBeNull();
  });
});

describe('Wochenplan — zwei Baustellen desselben Kunden (Design-Überarbeitung, Punkt 7)', () => {
  /**
   * Ein Kunde kann mehrere Baustellen haben. Stünde auf der Karte nur der
   * Name, sähen zwei Einsätze bei „Familie Huber" gleich aus — welcher ins
   * Haus und welcher in die Wohnung geht, wüsste niemand. Die Nummer steht
   * so da wie überall sonst: wie sie an der Baustelle gespeichert ist, mit
   * Vorsatz.
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

  it('nennt in der Tabelle an jeder Karte Kunde UND Nummer', async () => {
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    const karten = within(zeile).getAllByRole('button', { name: /Familie Huber .* am 02\.09/ });
    expect(karten).toHaveLength(2);
    expect(karten.map((k) => k.textContent)).toEqual(
      expect.arrayContaining(['Familie Huber2026-042', 'Familie HuberPR-187']),
    );
  });

  /*
    AUCH FÜR DIE VORLESEHILFE ZWEI VERSCHIEDENE KARTEN. Der zugängliche Name
    nannte nur Kunde und Tag — zweimal „Familie Huber am 02.09. bearbeiten“,
    und wer nicht sieht, wusste nicht, welche Baustelle er öffnet. Jetzt
    steht die Nummer mit im Namen, in der Tabelle wie in der Tagesliste.
  */
  it('gibt beiden Karten verschiedene zugängliche Namen — mit der Nummer', async () => {
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(
      within(zeile).getByRole('button', { name: /^Familie Huber \(2026-042\) am 02\.09\.? bearbeiten$/ }),
    ).toBeInTheDocument();
    expect(
      within(zeile).getByRole('button', { name: /^Familie Huber \(PR-187\) am 02\.09\.? bearbeiten$/ }),
    ).toBeInTheDocument();
    expect(liste().getByRole('button', { name: /^Familie Huber \(2026-042\) am/ })).toBeInTheDocument();
    expect(liste().getByRole('button', { name: /^Familie Huber \(PR-187\) am/ })).toBeInTheDocument();
  });

  it('nennt in der Tagesliste an jeder Karte Kunde UND Nummer', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    const karten = liste().getAllByRole('button', { name: /Familie Huber .* am 02\.09/ });
    expect(karten).toHaveLength(2);
    expect(karten.some((k) => k.textContent?.includes('Familie Huber · 2026-042'))).toBe(true);
    expect(karten.some((k) => k.textContent?.includes('Familie Huber · PR-187'))).toBe(true);
  });
});

describe('Wochenplan — Woche wechseln', () => {
  it('hat Blätterpfeile mit vollem Ziel, auch am Schreibtisch gut sichtbar', async () => {
    /**
     * 48 × 48 px wie die Monatspfeile im Kalender — `min-h-touch` bringt
     * `Button` mit. jsdom misst nicht; geprüft wird, dass die Klassen da sind.
     * `sm:text-xl`, weil sonst das `sm:text-base` aus `Button` das Zeichen ab
     * 640 px auf Fliesstextgrösse zurücksetzt.
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
    await waitFor(() =>
      expect(tabelle().getByRole('button', { name: /Mo.*07\.09/ })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Diese Woche' }));
    await waitFor(() =>
      expect(tabelle().getByRole('button', { name: /Mo.*31\.08/ })).toBeInTheDocument(),
    );
  });
});

describe('Wochenplan — die Tagesliste auf dem Telefon', () => {
  /**
   * SIEBEN SPALTEN AUF 390 px SIND KEINE TABELLE, sondern ein Guckloch: zwei
   * Tage sichtbar, der Rest hinter einem waagrechten Bildlauf — und die
   * stehende Namensspalte schob sich in die Polsterung. Aus dem Betrieb
   * gemeldet: „der Wochenplan sieht mobil leider noch gar nicht gut aus."
   *
   * Die Liste beantwortet dieselbe Frage in der Reihenfolge, in der man sie
   * auf dem Telefon stellt: erst der Tag, dann wer dort ist, dann wer noch
   * frei waere.
   */
  it('nennt je Tag die Baustelle MIT den Namen', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });

    const knopf = liste().getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09/ });
    expect(knopf).toHaveTextContent('Familie Huber');
    expect(knopf).toHaveTextContent('Max Mustermann');
  });

  it('schreibt die freien Namen AUS, nicht nur ihre Zahl', async () => {
    /**
     * Am Schreibtisch liest man sie aus der Spalte ab; hier gaebe es dafuer
     * keine Spalte. „2 frei" ohne Namen zwaenge zurueck in die Tagesplanung,
     * nur um nachzusehen — genau der Umweg, den dieses Brett abschaffen soll.
     */
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });

    // Am Mittwoch ist Max eingeteilt, Erna frei.
    const mittwoch = liste().getByText('Mi, 02.09.').closest('div')!.parentElement!;
    expect(mittwoch).toHaveTextContent('Frei: Erna Beispiel');
  });

  it('nennt den Urlaub beim Namen', async () => {
    abwesend = [{ userId: 'u2', von: '2026-08-31', bis: '2026-09-04', grund: 'Urlaub', zeiten: null }];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(liste().getAllByText(/Abwesend:/).length).toBeGreaterThan(0);
    expect(liste().getAllByText(/Erna Beispiel \(Urlaub\)/).length).toBeGreaterThan(0);
  });

  it('sagt es, wenn an einem Tag nichts geplant ist', async () => {
    // „Nichts geplant" und „nichts anzuzeigen" sind zwei verschiedene
    // Aussagen — eine leere Karte liesse offen, welche gemeint ist.
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(liste().getAllByText('Nichts geplant.')).toHaveLength(7);
  });

  it('teilt von einem Tag aus ein — im Blatt von unten, mit dem Tag gewählt', async () => {
    // Bis zur Linie „Lot“ führte das in die Tagesplanung; geschützt bleibt der Tag.
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(liste().getByRole('button', { name: 'Am 02.09. einteilen' }));
    expect(within(screen.getByRole('dialog', { name: 'Einsatz planen' })).getByRole('combobox', { name: 'Tag' })).toHaveValue(MITTWOCH);
    expect(gefahren.zu).toBeNull();
  });
});

/*
  DIE TEAM-WOCHE — der Wochenplan für alle Mitarbeiter, nur zum Lesen. Der
  Betrieb schaltet sie ein; der Monteur sieht, wer wo ist, und wer abwesend
  ist — ohne Grund.
*/
describe('Team-Woche (nur lesen)', () => {
  function zeigeLesend() {
    return render(
      <MemoryRouter>
        <WochenplanView nurLesen />
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    abwesend = [];
    vollerUrlaubGeholt.mockClear();
  });

  it('zeigt, wer wo ist — und bietet nichts zum Antippen an', async () => {
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' } as Assignment & { id: string },
    ];
    zeigeLesend();
    expect(await screen.findByRole('heading', { name: 'Team-Woche' })).toBeInTheDocument();
    expect((await tabelle().findAllByText('Familie Huber')).length).toBeGreaterThan(0);
    expect(within(screen.getByRole('table', { name: 'Wochenplan als Tabelle' })).queryAllByRole('button')).toEqual([]);
    expect(within(screen.getByRole('region', { name: 'Wochenplan als Liste' })).queryAllByRole('button')).toEqual([]);
  });

  it('sagt „abwesend“ statt „Urlaub“ — und holt die Urlaube nicht selbst', async () => {
    einsaetze = [];
    abwesend = [{ userId: 'u2', von: MITTWOCH, bis: MITTWOCH }];
    zeigeLesend();
    await screen.findByRole('table', { name: 'Wochenplan als Tabelle' });
    expect((await tabelle().findAllByText('abwesend')).length).toBe(1);
    expect(tabelle().queryByText('Urlaub')).toBeNull();
    expect(liste().getByText(/Abwesend:/)).toBeInTheDocument();
    // Die volle Urlaubsabfrage wäre für den Monteur ohnehin leer — und
    // brächte, wo sie es nicht wäre, mehr heraus als Wer/Von/Bis.
    expect(vollerUrlaubGeholt).not.toHaveBeenCalled();
  });

  it('zählt nicht „frei“ — das ist eine Frage der Planung, nicht des Teams', async () => {
    einsaetze = [];
    zeigeLesend();
    await screen.findByRole('heading', { name: 'Team-Woche' });
    expect(screen.queryByText(/\d+ frei/)).toBeNull();
    expect(screen.queryByText('Frei:')).toBeNull();
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
    expect(tabelle().getByRole('button', { name: /Mi.*02\.09.*Tagesplanung/ })).toHaveTextContent('2 frei');
  });

  it('ganztägig abwesend ohne Grund heißt „abwesend“ — und zählt nicht als frei', async () => {
    // So sieht die Projektleitung einen Krankenstand.
    abwesend = [{ userId: 'u2', von: MITTWOCH, bis: MITTWOCH, grund: null, zeiten: null }];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(zeile).getByText('abwesend')).toBeInTheDocument();
    expect(tabelle().getByRole('button', { name: /Mi.*02\.09.*Tagesplanung/ })).toHaveTextContent('1 frei');
  });

  it('Betriebsurlaub: grauer Block für alle, niemand frei — außer wer eingeteilt ist', async () => {
    betriebsurlaube = [{ id: 'b1', von: MITTWOCH, bis: MITTWOCH, bezeichnung: 'Betriebsurlaub' }];
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' } as Assignment & { id: string },
    ];
    zeige();
    const erna = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(erna).getByText('Betriebsurlaub')).toBeInTheDocument();
    const max = screen.getByRole('row', { name: /Max Mustermann/ });
    expect(within(max).getAllByText('Familie Huber').length).toBeGreaterThan(0);
    const kopf = tabelle().getByRole('button', { name: /Mi.*02\.09.*Tagesplanung/ });
    expect(kopf).toHaveTextContent('Betriebsurlaub');
    expect(kopf).not.toHaveTextContent('frei');
    const mittwoch = liste().getByText('Mi, 02.09.').closest('div')!.parentElement!;
    expect(mittwoch).not.toHaveTextContent('Frei:');
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
    const kopf = tabelle().getByRole('button', { name: /Mi.*02\.09.*Tagesplanung/ });
    expect(kopf).toHaveTextContent('Betriebsurlaub · 1 frei');
    const mittwoch = liste().getByText('Mi, 02.09.').closest('div')!.parentElement!;
    expect(mittwoch).toHaveTextContent('Frei: Erna Beispiel');
  });
});

/*
  TESTBERICHT 30.09.2026, M33 — eine Krankmeldung verdrängt den Einsatz
  nicht mehr: er steht mit „fehlt“ da, und ist niemand mehr dort,
  „Unbesetzt“.
*/
describe('Wochenplan — eingeteilt und krank (M33)', () => {
  const MI = '2026-09-02';

  it('der Einsatz bleibt sichtbar: „Unbesetzt — fehlt: Erna (Krank)“', async () => {
    einsaetze = [{ id: 'e1', companyId: 'perl', date: MI, projectNumber: BAUSTELLEN[0].projectNumber, userId: 'u2', userName: 'Erna Beispiel' }];
    abwesend = [{ userId: 'u2', von: MI, bis: MI, grund: 'Krank', zeiten: null }];
    zeige();
    await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(liste().getByText(/Unbesetzt — fehlt: Erna Beispiel \(Krank\)/)).toBeInTheDocument();
    expect(tabelle().getByText(`fehlt: ${BAUSTELLEN[0].projectNumber}`)).toBeInTheDocument();
  });

  it('mit einem Zweiten vor Ort ist sie besetzt — es fehlt nur einer', async () => {
    einsaetze = [
      { id: 'e1', companyId: 'perl', date: MI, projectNumber: BAUSTELLEN[0].projectNumber, userId: 'u2', userName: 'Erna Beispiel' },
      { id: 'e2', companyId: 'perl', date: MI, projectNumber: BAUSTELLEN[0].projectNumber, userId: 'u1', userName: 'Max Mustermann' },
    ];
    abwesend = [{ userId: 'u2', von: MI, bis: MI, grund: 'Krank', zeiten: null }];
    zeige();
    await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(liste().getByText(/^fehlt: Erna Beispiel \(Krank\)/)).toBeInTheDocument();
    expect(liste().queryByText(/Unbesetzt/)).toBeNull();
  });

  it('sagt im Hinweis, dass er Einsätze zeigt, nicht gebuchte Zeiten (G23)', async () => {
    zeige();
    // Seit der Linie „Lot“ unter „Hilfe zu dieser Seite“ (Regel 11).
    await userEvent.click(await screen.findByRole('button', { name: 'Hilfe zu dieser Seite' }));
    expect(await screen.findByText(/zeigt Einsätze, nicht gebuchte Zeiten/)).toBeInTheDocument();
  });
});

describe('Termine im Wochenplan (Plan 10.4)', () => {
  const LIEFERUNG: Termin = {
    id: 't1', companyId: 'perl', art: 'Lieferung', datum: '2026-09-01', zeitVon: '08:00', zeitBis: '10:00',
    projectNumber: '2026-042', customerId: null, teilnehmer: [], ortName: 'Familie Huber',
  };

  it('stehen als eigene Zeile über den Mitarbeitern — und in der Tagesliste beim Tag', async () => {
    termineDerWoche = [LIEFERUNG];
    zeige();
    await screen.findByRole('table', { name: 'Wochenplan als Tabelle' });
    expect(await tabelle().findByRole('rowheader', { name: 'Termine' })).toBeInTheDocument();
    expect(tabelle().getByText('Lieferung (Aviso) · 08:00–10:00')).toBeInTheDocument();
    expect(tabelle().getByText('Familie Huber · 2026-042')).toBeInTheDocument();
    const amDienstag = liste().getByRole('list', { name: 'Termine am 01.09.' });
    expect(within(amDienstag).getByText('Lieferung (Aviso) · 08:00–10:00')).toBeInTheDocument();
    // Unter einem Termin steht nicht „Nichts geplant" — nur, dass kein Einsatz da ist.
    expect(liste().getByText('Kein Einsatz geplant.')).toBeInTheDocument();
  });

  it('ohne Termine bleibt das Brett, wie es war — keine leere Zeile', async () => {
    zeige();
    await screen.findByRole('table', { name: 'Wochenplan als Tabelle' });
    expect(await tabelle().findByRole('rowheader', { name: 'Max Mustermann' })).toBeInTheDocument();
    expect(tabelle().queryByRole('rowheader', { name: 'Termine' })).not.toBeInTheDocument();
    expect(liste().queryByRole('list', { name: /^Termine am/ })).not.toBeInTheDocument();
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
    await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(tabelle().getByText('fehlt: 2026-042').closest('button')!.className).toBe('plan-konflikt');
    const max = tabelle().getByRole('row', { name: /Max Mustermann/ });
    expect(within(max).getByRole('button', { name: /Familie Huber \(2026-042\)/ }).className).toBe('plan-block');
    expect(liste().getByText(/^fehlt: Erna Beispiel/).className).toMatch(/text-warning/);
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
  DIE SICHT NACH BAUSTELLEN (Linie „Lot“, E2): nur die Baustellen mit einem
  Einsatz in der Woche; ein leerer Tag plant genau diese Baustelle ein.
*/
describe('Planung — Sicht nach Baustellen', () => {
  it('zeigt die eingeplanten Baustellen mit ihren Leuten und plant von dort ein', async () => {
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann', asHelper: true } as Assignment & { id: string },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(screen.getByRole('button', { name: 'Baustellen' }));
    const raster = within(screen.getByRole('table', { name: 'Wochenplan nach Baustellen' }));
    expect(raster.getByRole('button', { name: /Familie Huber \(2026-042\) am 02\.09\. bearbeiten/ })).toHaveTextContent('Max Mustermann (Helfer)');
    await userEvent.click(raster.getByRole('button', { name: /Familie Huber \(2026-042\) am 03\.09\. einplanen/ }));
    const fenster = within(screen.getByRole('dialog', { name: 'Einsatz planen' }));
    expect(fenster.getByRole('combobox', { name: 'Tag' })).toHaveValue('2026-09-03');
    await waitFor(() => expect(fenster.getByRole('combobox', { name: /Baustelle/ })).toHaveValue('2026-042'));
  });
});

/*
  NOCH EINZUPLANEN (Linie „Lot“, E2): laufende Baustellen ohne Einsatz in
  der Woche — aus den Daten, die die Seite ohnehin lädt.
*/
describe('Planung — Noch einzuplanen', () => {
  const ablage = () => screen.getByRole('heading', { name: 'Noch einzuplanen' }).closest('section')!;

  it('nennt eine laufende Baustelle ohne Einsatz und plant sie auf Tipp ein', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(within(ablage()).getByRole('button', { name: 'Familie Huber' }));
    const fenster = within(screen.getByRole('dialog', { name: 'Einsatz planen' }));
    await waitFor(() => expect(fenster.getByRole('combobox', { name: /Baustelle/ })).toHaveValue('2026-042'));
  });

  it('Gegenprobe: mit einem Einsatz in der Woche steht sie nicht dort', async () => {
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' } as Assignment & { id: string },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(within(ablage()).queryByRole('button', { name: 'Familie Huber' })).toBeNull();
    expect(within(ablage()).getByText('Jede laufende Baustelle hat diese Woche einen Einsatz.')).toBeInTheDocument();
  });
});

/*
  DER MONAT (Linie „Lot“, E2): dieselben Abfragen über den Monat, je Person
  und Tag eingeplant, abwesend, frei; ein Tag springt in die Woche.
*/
describe('Planung — Monat', () => {
  it('lädt den Monat, zeigt je Person und Tag den Stand und springt von einem Tag in die Woche', async () => {
    einsaetze = [
      { id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042', userId: 'u1', userName: 'Max Mustermann' } as Assignment & { id: string },
    ];
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
    // Baustellen des Monats als Zeile mit Zeitraum.
    expect(screen.getByText('2026-042 · 02.09. · 1 Einsatztag')).toBeInTheDocument();
    // Ein Tag springt in die Woche.
    await userEvent.click(monat.getByRole('button', { name: /^Mo\.? 14\.09\. — Woche zeigen/ }));
    expect(await screen.findByRole('table', { name: 'Wochenplan als Tabelle' })).toBeInTheDocument();
    expect(screen.getByText(/^KW 38/)).toBeInTheDocument();
  });

  it('Gegenprobe: die Team-Woche der Monteure hat keinen Monat', async () => {
    render(<MemoryRouter><WochenplanView nurLesen /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Team-Woche' });
    expect(screen.queryByRole('group', { name: 'Zeitraum' })).toBeNull();
  });
});
