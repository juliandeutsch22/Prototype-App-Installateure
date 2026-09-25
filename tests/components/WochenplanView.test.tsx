import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AppUser, Assignment, Project, Vacation } from '@/types';

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

vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => [mk('u1', 'Max Mustermann'), mk('u2', 'Erna Beispiel')]),
}));
vi.mock('@/lib/db/projects', () => ({ listActiveProjects: vi.fn(async () => BAUSTELLEN) }));
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
vi.mock('@/lib/db/assignments', () => ({
  subscribeAssignmentsInRange: (
    _c: string,
    _v: string,
    _b: string,
    cb: (r: (Assignment & { id: string })[]) => void,
  ) => {
    cb(einsaetze);
    return () => undefined;
  },
}));

const authWert = {
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
  return render(
    <MemoryRouter>
      <WochenplanView />
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
  einsaetze = [];
  urlaube = [];
  abwesend = [];
  betriebsurlaube = [];
  gefahren.zu = null;
  gefahren.zustand = null;
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

describe('Wochenplan — der Weg in die Tagesplanung', () => {
  it('gibt Tag UND Baustelle mit, wenn eine dort steht', async () => {
    einsaetze = [
      {
        id: 'a1', companyId: 'perl', date: MITTWOCH, projectNumber: '2026-042',
        userId: 'u1', userName: 'Max Mustermann',
      } as Assignment & { id: string },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(tabelle().getByRole('button', { name: /Familie Huber am 02\.09/ }));
    expect(gefahren.zu).toBe('/assignments/tag');
    expect(gefahren.zustand).toEqual({ datum: MITTWOCH, projectNumber: '2026-042' });
  });

  it('gibt bei einer freien Zelle nur den Tag mit', async () => {
    // Welche Baustelle gemeint ist, kann das Brett nicht wissen — eine
    // geratene Vorauswahl fuehrte zum Speichern auf der falschen.
    zeige();
    const zeile = await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(within(zeile).getByRole('button', { name: /am 02\.09\. einteilen/ }));
    expect(gefahren.zu).toBe('/assignments/tag');
    expect(gefahren.zustand).toEqual({ datum: MITTWOCH, projectNumber: undefined });
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
    const karten = within(zeile).getAllByRole('button', { name: /Familie Huber am 02\.09/ });
    expect(karten).toHaveLength(2);
    expect(karten.map((k) => k.textContent)).toEqual(
      expect.arrayContaining(['Familie Huber2026-042', 'Familie HuberPR-187']),
    );
  });

  it('nennt in der Tagesliste an jeder Karte Kunde UND Nummer', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    const karten = liste().getAllByRole('button', { name: /Familie Huber am 02\.09/ });
    expect(karten).toHaveLength(2);
    expect(karten.some((k) => k.textContent?.includes('Familie Huber · 2026-042'))).toBe(true);
    expect(karten.some((k) => k.textContent?.includes('Familie Huber · PR-187'))).toBe(true);
  });
});

describe('Wochenplan — Woche wechseln', () => {
  it('hat Blätterpfeile mit vollem Ziel, auch am Schreibtisch gut sichtbar', async () => {
    /**
     * 48 × 48 px wie die Monatspfeile im Kalender, das Zeichen auf JEDER
     * Breite 22 px. Seit dem 25.09.2026 steht beides in einer Klasse
     * (`.symbolknopf-gross`, index.css) statt als Tailwind-Klassen am Knopf —
     * jsdom misst nicht, also wird geprüft, dass die Pfeile genau diese Klasse
     * tragen und dass die Regel die Maße hat und keine Media-Abfrage sie
     * überschreibt.
     */
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    for (const name of ['Woche zurück', 'Woche vor']) {
      expect(screen.getByRole('button', { name }).className).toBe('symbolknopf-gross');
    }
    const css = readFileSync(resolve(__dirname, '../../src/index.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const regeln = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => m[1].split(',').map((x) => x.trim()).includes('.symbolknopf-gross'))
      .map((m) => m[2])
      .join(';');
    expect(regeln).toMatch(/min-height:\s*48px/);
    expect(regeln).toMatch(/min-width:\s*48px/);
    expect(regeln).toMatch(/font-size:\s*1\.375rem/);
    expect(css).not.toMatch(/@media[^{]*\{[^@]*\.symbolknopf-gross[^{]*\{[^}]*font-size/);
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

    const knopf = liste().getByRole('button', { name: /Familie Huber am 02\.09/ });
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

  it('fuehrt von einem Tag ohne Einteilung in die Tagesplanung', async () => {
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    await userEvent.click(liste().getByRole('button', { name: 'Am 02.09. einteilen' }));
    expect(gefahren.zu).toBe('/assignments/tag');
    expect(gefahren.zustand).toEqual({ datum: MITTWOCH, projectNumber: undefined });
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

  it('sagt „abwesend" statt „Urlaub" — und holt die Urlaube nicht selbst', async () => {
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

  it('zählt nicht „frei" — das ist eine Frage der Planung, nicht des Teams', async () => {
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

  it('ganztägig abwesend ohne Grund heisst „abwesend" — und zählt nicht als frei', async () => {
    // So sieht die Projektleitung einen Krankenstand.
    abwesend = [{ userId: 'u2', von: MITTWOCH, bis: MITTWOCH, grund: null, zeiten: null }];
    zeige();
    const zeile = await screen.findByRole('row', { name: /Erna Beispiel/ });
    expect(within(zeile).getByText('abwesend')).toBeInTheDocument();
    expect(tabelle().getByRole('button', { name: /Mi.*02\.09.*Tagesplanung/ })).toHaveTextContent('1 frei');
  });

  it('Betriebsurlaub: grauer Block für alle, niemand frei — ausser wer eingeteilt ist', async () => {
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
