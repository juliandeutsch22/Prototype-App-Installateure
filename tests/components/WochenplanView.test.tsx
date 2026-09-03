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
vi.mock('@/lib/db/vacations', () => ({
  listApprovedVacationsInRange: vi.fn(async () => urlaube),
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

  it('zeigt genehmigten Urlaub und zaehlt ihn NICHT als frei', async () => {
    // Wer frei hat, ist nicht verfuegbar, sondern abwesend. Ihn als frei zu
    // zaehlen hiesse, die Planung auf eine Zahl zu stuetzen, die luegt.
    urlaube = [
      {
        id: 'v1', companyId: 'perl', userId: 'u2', userName: 'Erna Beispiel',
        von: '2026-08-31', bis: '2026-09-04', status: 'Genehmigt', tage: 5,
      } as Vacation & { id: string },
    ];
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

describe('Wochenplan — Woche wechseln', () => {
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
    urlaube = [
      {
        id: 'v1', companyId: 'perl', userId: 'u2', userName: 'Erna Beispiel',
        von: '2026-08-31', bis: '2026-09-04', status: 'Genehmigt', tage: 5,
      } as Vacation & { id: string },
    ];
    zeige();
    await screen.findByRole('row', { name: /Max Mustermann/ });
    expect(liste().getAllByText(/Urlaub:/).length).toBeGreaterThan(0);
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
