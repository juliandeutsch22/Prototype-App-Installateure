import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Assignment, MaterialOrder, Project, Termin, TimeEntry } from '@/types';

/**
 * Die Startseite hatte bis hierher KEINEN Test.
 *
 * Das ist genau die Sorte Lücke, die man erst bemerkt, wenn sie zuschlägt:
 * die Testzahl war grün, während die Ansicht komplett umgebaut wurde. Zwei
 * der Fehler, die dieser Test festhält, waren im Browser tatsächlich zu
 * sehen.
 *
 * 1. Nur der ERSTE Einsatz des Tages wurde gezeigt (`assignments.find(...)`).
 *    Wer vormittags auf der einen und nachmittags auf der anderen Baustelle
 *    ist, sah nur eine — und fuhr im Zweifel die falsche an.
 * 2. Der Team-Block zeigte einen Saldo, der am Monatsersten „-176 h" lautete,
 *    weil er das Soll des ganzen Monats ansetzte.
 */

const HEUTE = '2026-09-15'; // ein Dienstag

const baustellen: Project[] = [
  {
    id: 'p1',
    companyId: 'perl',
    projectNumber: 'B-001',
    customerName: 'Familie Huber',
    address: 'Hauptstraße 12, 2700 Wiener Neustadt',
    contactName: 'Herr Huber',
    contactPhone: '0664 1234567',
    status: 'Aktiv',
  },
  {
    id: 'p2',
    companyId: 'perl',
    projectNumber: 'B-002',
    customerName: 'Gemeinde Neudorf',
    address: 'Rathausplatz 1, 2620 Neunkirchen',
    contactPhone: '+43 2635 12345',
    status: 'Aktiv',
  },
  {
    id: 'p3',
    companyId: 'perl',
    projectNumber: 'B-000',
    customerName: 'Altbau Meier',
    address: 'Ringstraße 3',
    status: 'Abgeschlossen',
  },
];

/** Zwei Einsätze am selben Tag — der Kern von Fehler 1. */
const einsaetze: Assignment[] = [
  {
    id: 'a1',
    companyId: 'perl',
    date: HEUTE,
    projectNumber: 'B-001',
    userId: 'm1',
    userName: 'Anton Berger',
    comment: 'Bad, Vormittag',
  },
  {
    id: 'a2',
    companyId: 'perl',
    date: HEUTE,
    projectNumber: 'B-002',
    userId: 'm1',
    userName: 'Anton Berger',
    asHelper: true,
    comment: 'Heizung, Nachmittag',
  },
];

const monteur = {
  id: 'm1',
  companyId: 'perl',
  uid: 'm1',
  name: 'Anton Berger',
  email: 'm1@perl.at',
  role: 'Mitarbeiter' as const,
  active: true,
  weeklyTargetHours: 40,
  yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5],
  appStartDate: '2026-09-01',
};

/** Gebucht wurde nur der 1. September — der Rest des Monats fehlt. */
const buchungen: (TimeEntry & { id: string })[] = [
  {
    id: 'e1',
    companyId: 'perl',
    userId: 'm1',
    userName: 'Anton Berger',
    date: '2026-09-01',
    status: 'Anwesend',
    startTime: '07:00',
    endTime: '16:00',
    breakDuration: 30,
  } as TimeEntry & { id: string },
];

const rolle = { wert: 'Mitarbeiter' as string };

/** Stunden je Baustelle — nur der Budget-Radar liest sie. */
let zeitenJeBaustelle: (TimeEntry & { id: string })[] = [];

/** Die Termine von heute, wie die Datenbank sie herausgibt (Plan 10.4). */
const termine: { wert: Termin[] } = { wert: [] };
vi.mock('@/lib/db/termine', () => ({
  listTermineImZeitraum: vi.fn(async () => termine.wert),
  listTermineDerBaustelle: vi.fn(async () => []),
  listTermineDesKunden: vi.fn(async () => []),
  terminAnlegen: vi.fn(async () => 'neu'),
  terminAendern: vi.fn(async () => undefined),
  terminLoeschen: vi.fn(async () => undefined),
}));
vi.mock('@/lib/db/users', () => ({
  // Die eigene Zeile trägt die Rolle der Anmeldung — die Startseite fragt sie
  // nach dem Zeitkonto.
  getUserByUid: vi.fn(async () => ({ ...monteur, role: rolle.wert })),
  listUsers: vi.fn(async () => [monteur]),
}));
/*
  Ein Bestand, den ein einzelner Test vorgeben kann. `null` heisst: der
  gewoehnliche Bestand oben. Der Zugriff steht IM Rueckruf, nicht in der
  Fabrik: die laeuft vor dem Modulrumpf.
*/
let baustellenUeberschreibung: Project[] | null = null;

vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () =>
    baustellenUeberschreibung ??
    // Wie die echte Abfrage: abgeschlossene Baustellen kommen gar nicht erst zurück.
    baustellen.filter((p) => p.status === 'Aktiv' || p.status === 'Pausiert'),
  ),
  listProjectsByNumbers: vi.fn(async (_c: string, nummern: string[]) =>
    baustellen.filter((p) => nummern.includes(p.projectNumber)),
  ),
}));
/** Wer heute ganztags weg ist (M33). */
const abwesend: { wert: { userId: string; von: string; bis: string; grund: string | null; zeiten: string | null }[] } = { wert: [] };
vi.mock('@/lib/db/urlaubsanspruch', () => ({ listAnpassungen: vi.fn(async () => []) }));
vi.mock('@/lib/db/freistellungen', () => ({ listOffeneFreistellungen: vi.fn(async () => []) }));
vi.mock('@/lib/db/vacations', () => ({
  listAbwesendInRange: vi.fn(async () => abwesend.wert),
  listOpenVacations: vi.fn(async () => []),
  listOwnVacations: vi.fn(async () => []),
}));
vi.mock('@/lib/db/assignments', () => ({
  listUpcomingAssignments: vi.fn(async () => einsaetze),
  listAssignmentsForDate: vi.fn(async () => einsaetze),
  listAssignmentsForUserInRange: vi.fn(async () => []),
  listAssignmentsInRange: vi.fn(async () => einsaetze),
}));
/*
  Welche Abfrage scheitern soll. Die Startseite lädt in Blöcken; jeder muss
  für sich stolpern können, ohne die anderen mitzureissen.
*/
const scheitert = { persoenlich: false, betrieblich: false };

vi.mock('@/lib/db/timeEntries', () => ({
  listOwnEntriesSince: vi.fn(async () => {
    if (scheitert.persoenlich) throw new Error('kein Netz');
    return buchungen;
  }),
  listOwnEntriesInRange: vi.fn(async () => buchungen),
  listEntriesInRange: vi.fn(async () => buchungen),
  listEntriesForProjects: vi.fn(async () => zeitenJeBaustelle),
}));
/** Offene Anforderungen, wie `listOpenOrders` sie liefert. */
const anforderungen: { wert: MaterialOrder[] } = { wert: [] };
vi.mock('@/lib/db/materialOrders', () => ({
  listOpenOrders: vi.fn(async () => {
    if (scheitert.betrieblich) throw new Error('kein Netz');
    return anforderungen.wert;
  }),
  listOwnOpenOrders: vi.fn(async () => anforderungen.wert.filter((o) => o.userId === 'm1')),
}));
vi.mock('@/lib/db/einkauf', () => ({ listLagerPosten: vi.fn(async () => []) }));
vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  listMaterials: vi.fn(async () => []),
  lagerFrei: vi.fn(async () => new Map()),
}));
/** Die offenen Forderungen, wie `listUnpaidInvoices` sie liefert. */
const offeneRechnungen: { wert: unknown[] } = { wert: [] };
vi.mock('@/lib/db/invoices', () => ({
  listUnpaidInvoices: vi.fn(async () => offeneRechnungen.wert),
  listInvoicesByIds: vi.fn(async () => []),
  scheineAufRechnung: vi.fn(async () => []),
}));
vi.mock('@/lib/db/zahlungen', () => ({ listZahlungenImZeitraum: vi.fn(async () => []) }));
vi.mock('@/lib/db/workSheets', () => ({
  listRecentWorkSheets: vi.fn(async () => []),
  listOwnWorkSheetsSince: vi.fn(async () => []),
}));
vi.mock('@/lib/db/wartungen', () => ({ listFaelligeWartungen: vi.fn(async () => []) }));
vi.mock('@/lib/db/konten', () => ({ buchungskonten: vi.fn(async () => [{ zweck: 'erloes', konto: '4000' }]) }));
vi.mock('@/lib/db/monatsbilanzen', () => ({
  bilanzMarker: vi.fn(async () => null),
  listBilanzen: vi.fn(async () => []),
  monatVon: (d: string) => d.slice(0, 7),
}));

/** Die Rüstliste zur ersten Baustelle — Material, das mitkommen soll. */
const ruestlisten: { wert: unknown[] } = { wert: [] };
const umschalten = vi.fn();
vi.mock('@/lib/db/einsatzMaterial', () => ({
  listEinsatzMaterialForDate: vi.fn(async () => ruestlisten.wert),
  ladenUmschalten: (...a: unknown[]) => {
    umschalten(...a);
    return Promise.resolve();
  },
}));

// EIN Objekt, nicht bei jedem Aufruf ein neues: die Ansicht hängt ihre
// Effekte an die Identität von `user`, ein frisches Objekt je Aufruf löst
// eine Endlosschleife aus.
const authWert = {
  user: {
    uid: 'm1',
    email: 'm1@perl.at',
    name: 'Anton Berger',
    get role() {
      return rolle.wert as 'Mitarbeiter';
    },
    companyId: 'perl',
    docId: 'm1',
  },
  company: { id: 'perl', name: 'Perl Installationen' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: DashboardView } = await import('@/features/dashboard/DashboardView');

function zeichne() {
  return render(
    <MemoryRouter>
      <DashboardView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  scheitert.persoenlich = false;
  scheitert.betrieblich = false;
  baustellenUeberschreibung = null;
  // Feste Uhr: sonst verschiebt sich „heute" und der Test wird mit der Zeit
  // falsch statt rot.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 15, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  abwesend.wert = [];
  offeneRechnungen.wert = [];
  anforderungen.wert = [];
  termine.wert = [];
  rolle.wert = 'Mitarbeiter';
});

/** Die Karte, in der ein Text steht — Handlungsbedarf, Heute, … */
const karteMit = async (text: RegExp | string) => (await screen.findByText(text)).closest('section.karte') as HTMLElement;

/** Eine Anforderung für die Lager- und Leitungssicht. */
const anforderung = (teil: Partial<MaterialOrder> & { id: string }): MaterialOrder => ({
  companyId: 'perl',
  materialId: null,
  materialName: 'Kupferrohr 15',
  quantity: 4,
  status: 'Offen',
  transactionType: 'order',
  userId: 'm2',
  userName: 'Max Muster',
  projectNumber: 'B-001',
  createdAt: Date.parse('2026-09-10T08:00:00Z'),
  ...teil,
});

describe('Startseite — Monteur', () => {
  it('wer heute krank ist, hat heute keinen Einsatz auf der Startseite (M33)', async () => {
    abwesend.wert = [{ userId: 'm1', von: HEUTE, bis: HEUTE, grund: 'Krank', zeiten: null }];
    zeichne();
    // Dieselbe Ladung bringt die fehlenden Tage — sind sie da, ist auch „Heute“ entschieden.
    await screen.findByText('Tage ohne Buchung');
    expect(screen.queryByText('2 Einsätze')).toBeNull();
    expect(screen.queryByText('Bad, Vormittag')).toBeNull();
  });

  it('Gegenprobe: stundenweise weg — die Einsätze bleiben', async () => {
    abwesend.wert = [{ userId: 'm1', von: HEUTE, bis: HEUTE, grund: 'ZA', zeiten: '13:00–17:00' }];
    zeichne();
    expect(await screen.findByText(/2 Einsätze/)).toBeInTheDocument();
  });

  it('zeigt ALLE Einsätze von heute: den ersten ausführlich, den zweiten unter „Danach“', async () => {
    zeichne();
    const karte = await karteMit(/2 Einsätze/);
    expect(within(karte).getByText('Familie Huber')).toBeInTheDocument();
    expect(within(karte).getByText('Gemeinde Neudorf')).toBeInTheDocument();
    // Die Aufgaben unterscheiden die beiden Einsätze.
    expect(within(karte).getByText('Bad, Vormittag')).toBeInTheDocument();
    expect(within(karte).getByText('Heizung, Nachmittag')).toBeInTheDocument();
    expect(within(karte).getByRole('heading', { name: /Danach/ })).toBeInTheDocument();
  });

  it('macht Adresse und Telefonnummer zu Handgriffen', async () => {
    zeichne();
    await screen.findByText(/2 Einsätze/);
    const route = screen.getByRole('link', { name: /Hauptstraße 12/ });
    expect(route).toHaveAttribute('href', expect.stringContaining('google.com/maps/search/?api=1&query='));
    expect(route).toHaveAttribute('target', '_blank');
    // Leerzeichen müssen aus der Nummer heraus — `tel:` verträgt sie nicht.
    expect(screen.getByRole('link', { name: /0664 1234567/ })).toHaveAttribute('href', 'tel:+436641234567');
    // Ein FÜHRENDES Plus bleibt erhalten.
    expect(screen.getByRole('link', { name: /02635 12345/ })).toHaveAttribute('href', 'tel:+43263512345');
  });

  it('„Wie zuletzt buchen“ trägt die Zeiten der letzten Buchung — gebucht wird erst in der Zeiterfassung', async () => {
    zeichne();
    const knopf = await screen.findByRole('link', { name: /Wie zuletzt buchen/ });
    expect(knopf).toHaveAttribute('href', '/time');
    expect(knopf).toHaveTextContent('07:00–16:00 · 30 min Pause · 08:30 Std');
  });

  it('nennt die fehlenden Tage einzeln, höchstens drei, mit dem Weg zum Nachtragen', async () => {
    zeichne();
    // Gebucht ist nur der 1.9. — vom 2.9. bis gestern (14.9.) fehlen neun Werktage.
    const karte = await karteMit('Tage ohne Buchung');
    const abschnitt = within(karte).getByRole('region', { name: 'Tage ohne Buchung' });
    expect(within(abschnitt).getAllByRole('listitem')).toHaveLength(3);
    // Das Älteste zuerst, mit Wochentag und Datum.
    expect(within(abschnitt).getByText('Mittwoch, 02.09.2026')).toBeInTheDocument();
    expect(within(abschnitt).getByRole('link', { name: /Mittwoch, 02\.09\.2026/ })).toHaveAttribute('href', '/time?datum=2026-09-02');
    expect(within(abschnitt).getByRole('link', { name: 'und 6 weitere →' })).toHaveAttribute('href', '/time?filter=fehlend');
  });

  it('zeigt abholbereites Material mit dem Weg zu „Meine Anforderungen“', async () => {
    anforderungen.wert = [anforderung({ id: 'o1', userId: 'm1', status: 'Abholbereit', abholbereitSeit: Date.parse('2026-09-12T08:00:00Z') })];
    zeichne();
    const abschnitt = await screen.findByRole('region', { name: 'Material abholbereit' });
    expect(within(abschnitt).getByText('4 × Kupferrohr 15')).toBeInTheDocument();
    expect(within(abschnitt).getAllByText('seit 12.09.').length).toBeGreaterThan(0);
    expect(within(abschnitt).getByRole('link', { name: /Kupferrohr/ })).toHaveAttribute('href', '/material?reiter=meine&status=Abholbereit');
  });
});

/**
 * Wer wegen fehlender Tage gemahnt wird (Prüflauf F17): nur, wer ein
 * Zeitkonto führt.
 */
describe('Startseite — fehlende Tage nur mit Zeitkonto', () => {
  it('der Administrator sieht seine Einsätze, aber keine fehlenden Tage', async () => {
    rolle.wert = 'Administrator';
    zeichne();
    await screen.findByText('Dein Einsatz heute');
    expect(screen.queryByText(/Tage ohne Buchung/)).not.toBeInTheDocument();
  });

  it('der Projektleiter führt ein Zeitkonto und wird gemahnt', async () => {
    rolle.wert = 'Projektleiter';
    zeichne();
    expect(await screen.findByText('Deine Tage ohne Buchung')).toBeInTheDocument();
  });
});

describe('Startseite — Geschäftsführung', () => {
  beforeEach(() => {
    rolle.wert = 'Geschäftsführung';
  });

  it('zählt die aktiven Baustellen, ohne die abgeschlossene, und führt in die gefilterte Liste', async () => {
    zeichne();
    const zahl = await screen.findByRole('link', { name: /Aktive Baustellen/ });
    expect(zahl).toHaveTextContent(/Aktive Baustellen.*2/);
    expect(zahl).toHaveAttribute('href', '/admin-projects?filter=aktiv');
  });

  it('zeigt unter „Heute“, wer wo ist, mit dem Weg in die Tagesplanung', async () => {
    zeichne();
    const karte = await karteMit(/im Einsatz/);
    const da = within(karte).getByRole('region', { name: 'Im Einsatz' });
    expect(within(da).getByText(/Familie Huber/)).toBeInTheDocument();
    expect(within(da).getByText(/Gemeinde Neudorf/)).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Einsatzplanung' })).toHaveAttribute('href', `/assignments/tag?datum=${HEUTE}`);
  });

  it('schreibt die Baustellenstunden mit KOMMA — und nennt die Baustelle erst ab 90 %', async () => {
    // 8,5 von 9 h = 94 %.
    baustellen[0].estimatedHours = 9;
    zeitenJeBaustelle = [
      {
        id: 'b1', companyId: 'perl', date: '2026-06-01', status: 'Anwesend', userId: 'm1', userName: 'Anton Berger',
        projectNumber: 'B-001', startTime: '07:00', endTime: '16:00', breakDuration: 30,
      } as TimeEntry & { id: string },
    ];
    rolle.wert = 'Projektleiter';
    try {
      zeichne();
      const abschnitt = await screen.findByRole('region', { name: 'Baustellen über oder nahe Budget' });
      expect(within(abschnitt).getByText(/8,5 von 9 Std/)).toBeInTheDocument();
      // Einmal vorn (schmal), einmal rechts (breit) — die Breite entscheidet per CSS.
      expect(within(abschnitt).getAllByText('94 %').length).toBeGreaterThan(0);
    } finally {
      delete baustellen[0].estimatedHours;
      zeitenJeBaustelle = [];
    }
  });

  /*
    TESTBERICHT 30.09.2026, M33 — eine Krankmeldung verdrängt den Einsatz
    nicht mehr still: „unbesetzt“ steht unter Handlungsbedarf, wer fehlt
    unter Heute.
  */
  it('meldet unbesetzte Einsätze, wenn der Eingeteilte krank ist (M33)', async () => {
    abwesend.wert = [{ userId: 'm1', von: HEUTE, bis: HEUTE, grund: 'Krank', zeiten: null }];
    zeichne();
    const thema = await screen.findByRole('link', { name: /2 Einsätze unbesetzt/ });
    expect(thema).toHaveAttribute('href', `/assignments/tag?datum=${HEUTE}&filter=unbesetzt`);
    expect(thema).toHaveTextContent(/Anton Berger krank/);
    const weg = await screen.findByRole('region', { name: 'Abwesend' });
    expect(within(weg).getByText('Anton Berger')).toBeInTheDocument();
  });

  /*
    02.10.2026 — die Konten der Belegschaft: eine Lehrzeit, die endet, und
    ein Betrieb, der nur eine Leitung ohne E-Mail hat.
  */
  it('erinnert an das Ende der Lehrzeit und an die einzige Leitung ohne E-Mail', async () => {
    const { listUsers } = await import('@/lib/db/users');
    vi.mocked(listUsers).mockImplementation(async () => [
      monteur,
      { ...monteur, uid: 'l1', id: 'l1', name: 'Lena Lehrling', einstufung: 'lehrling', lehrbeginn: '2023-10-01', lehrzeitMonate: 36 },
      { ...monteur, uid: 'gf', id: 'gf', name: 'Gerda Chefin', role: 'Geschäftsführung', email: 'gerda@benutzer.senklot.invalid' },
    ]);
    try {
      zeichne();
      const lehrzeit = await screen.findByRole('link', { name: /Lehrzeit von Lena Lehrling endet am 30\.09\./ });
      expect(lehrzeit).toHaveAttribute('href', '/user-mgmt/l1');
      // Diese Woche hat hier mehr als drei Themen — die übrigen klappen an Ort und Stelle auf.
      const woche = screen.getByRole('region', { name: 'Diese Woche' });
      const mehr = within(woche).queryByRole('button', { name: /weitere/ });
      if (mehr) await userEvent.click(mehr);
      expect(within(woche).getByRole('link', { name: /Nur ein Leitungskonto, ohne E-Mail/ })).toHaveAttribute('href', '/user-mgmt');
    } finally {
      vi.mocked(listUsers).mockImplementation(async () => [monteur]);
    }
  });

  it('Gegenprobe: ohne Lehrling und mit Leitung mit E-Mail — keine solche Zeile', async () => {
    const { listUsers } = await import('@/lib/db/users');
    vi.mocked(listUsers).mockImplementation(async () => [
      monteur,
      { ...monteur, uid: 'gf', id: 'gf', name: 'Gerda Chefin', role: 'Geschäftsführung', email: 'gerda@perl.at' },
    ]);
    try {
      zeichne();
      await screen.findByRole('link', { name: /Aktive Baustellen/ });
      await waitFor(() => expect(document.querySelector('[data-geladen="ja"]')).not.toBeNull());
      expect(screen.queryByText(/Lehrzeit/)).toBeNull();
      expect(screen.queryByText(/Leitungskonto/)).toBeNull();
    } finally {
      vi.mocked(listUsers).mockImplementation(async () => [monteur]);
    }
  });

  it('fasst nach Themen zusammen und klappt „und N weitere“ an Ort und Stelle auf', async () => {
    rolle.wert = 'Geschäftsführung';
    anforderungen.wert = [
      anforderung({ id: 'e1', isUrgent: true }),
    ];
    baustellenUeberschreibung = Array.from({ length: 3 }, (_, i) => ({
      id: `x${i}`, companyId: 'perl', projectNumber: `X-${i}`, customerName: `Kunde ${i}`, status: 'Aktiv',
      endDate: '2026-09-01',
    })) as Project[];
    zeichne();
    /*
      Erst wenn alle Blöcke da sind: die Karte steht schon vorher und wechselt
      mit den Kennzahlen von einer Spalte in zwei — eine früh gegriffene Karte
      ist dann nicht mehr im Dokument.
    */
    await waitFor(() => expect(document.querySelector('[data-geladen="ja"]')).not.toBeNull());
    const karte = await karteMit(/Handlungsbedarf/);
    expect(within(karte).getByText(/Themen/)).toBeInTheDocument();
    expect(within(karte).getByRole('region', { name: 'Überfällig' })).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: /1 Eilanforderung offen/ })).toHaveAttribute('href', '/anforderungen?filter=eil');
  });
});

describe('Startseite — Verwaltung', () => {
  beforeEach(() => {
    rolle.wert = 'Verwaltung';
  });

  it('Eil zuerst, dann die älteste — höchstens drei, der Rest auf der gefilterten Liste', async () => {
    anforderungen.wert = [
      anforderung({ id: 'a', materialName: 'Alt', createdAt: Date.parse('2026-09-01T08:00:00Z') }),
      anforderung({ id: 'b', materialName: 'Neu', createdAt: Date.parse('2026-09-14T08:00:00Z') }),
      anforderung({ id: 'c', materialName: 'Eilig', isUrgent: true, createdAt: Date.parse('2026-09-14T09:00:00Z') }),
      anforderung({ id: 'd', materialName: 'Mittel', createdAt: Date.parse('2026-09-05T08:00:00Z') }),
    ];
    zeichne();
    const abschnitt = await screen.findByRole('region', { name: 'Offene Anforderungen' });
    const titel = within(abschnitt).getAllByRole('listitem').map((li) => li.textContent);
    expect(titel[0]).toMatch(/Eilig/);
    expect(titel[1]).toMatch(/Alt/);
    expect(titel[2]).toMatch(/Mittel/);
    expect(within(abschnitt).getByRole('link', { name: 'und 1 weitere →' })).toHaveAttribute('href', '/anforderungen?filter=offen');
  });

  it('bestellt und überfällig: nach dem Liefertermin, rot', async () => {
    anforderungen.wert = [
      anforderung({ id: 'l', status: 'In Bearbeitung', beschaffung: 'einkauf', bestelltAm: Date.parse('2026-09-08T08:00:00Z'), liefertermin: '2026-09-11' }),
    ];
    zeichne();
    const abschnitt = await screen.findByRole('region', { name: 'Bestellt und überfällig' });
    expect(within(abschnitt).getAllByText('4 Tage')[0]).toHaveClass('stand-fehl');
    expect(within(abschnitt).getByText(/Liefertermin 11\.09\./)).toBeInTheDocument();
  });

  it('seit über drei Tagen abholbereit — nach dem Zeitstempel der Datenbank', async () => {
    anforderungen.wert = [
      anforderung({ id: 'x', status: 'Abholbereit', abholbereitSeit: Date.parse('2026-09-10T08:00:00Z') }),
      anforderung({ id: 'y', status: 'Abholbereit', materialName: 'Frisch', abholbereitSeit: Date.parse('2026-09-14T08:00:00Z') }),
    ];
    zeichne();
    const abschnitt = await screen.findByRole('region', { name: 'Seit über 3 Tagen abholbereit' });
    expect(within(abschnitt).getAllByRole('listitem')).toHaveLength(1);
    expect(within(abschnitt).queryByText(/Frisch/)).not.toBeInTheDocument();
  });

  it('nichts zu tun: „Heute liegt nichts an“ und die Kennzahlen, eine Spalte', async () => {
    // Ohne Eintritt keine fehlenden Tage — sonst stünde „Deine Tage ohne Buchung“ da.
    const eintritt = monteur.appStartDate;
    (monteur as { appStartDate?: string }).appStartDate = undefined;
    try {
      zeichne();
      expect(await screen.findByText('Heute liegt nichts an')).toBeInTheDocument();
      expect(await screen.findByRole('link', { name: /^Anforderungen/ })).toHaveTextContent(/0/);
      expect(document.querySelector('.zwei-spalten')).toBeNull();
    } finally {
      (monteur as { appStartDate?: string }).appStartDate = eintritt;
    }
  });
});

describe('Startseite — was der Monteur heute mitnehmen soll', () => {
  /**
   * Die Rüstliste am Einsatztag. DER HAKEN GILT FÜR DIE MANNSCHAFT, nicht
   * für die Person — deshalb steht der Name dabei.
   */
  beforeEach(() => {
    rolle.wert = 'Mitarbeiter';
    umschalten.mockClear();
    ruestlisten.wert = [
      {
        id: 'perl_2026-09-15_B-001',
        companyId: 'perl',
        date: HEUTE,
        projectNumber: 'B-001',
        uids: ['m1'],
        positionen: [
          { id: 'p1', name: 'Eckventil 1/2', menge: 3, einheit: 'Stk' },
          { id: 'p2', name: 'Mischbatterie', menge: 1 },
        ],
        geladen: { p2: { von: 'Erna Beispiel', am: 1750000000000 } },
      },
    ];
  });

  afterEach(() => {
    ruestlisten.wert = [];
  });

  it('zeigt die Liste am Einsatz, mit Menge und Einheit', async () => {
    zeichne();
    const material = (await screen.findByText('Material')).closest('div')!;
    expect(within(material).getByText(/Eckventil 1\/2/)).toBeInTheDocument();
    expect(within(material).getByText(/3/)).toBeInTheDocument();
    expect(within(material).getByText(/noch 1 von 2/)).toBeInTheDocument();
  });

  it('nennt, WER etwas schon eingeladen hat', async () => {
    zeichne();
    expect(await screen.findByText(/eingeladen von Erna Beispiel/)).toBeInTheDocument();
  });

  it('hakt ab und schreibt genau diese eine Position', async () => {
    zeichne();
    const kaestchen = await screen.findByRole('checkbox', { name: /Eckventil/ });
    expect(kaestchen).not.toBeChecked();
    await userEvent.click(kaestchen);
    expect(kaestchen).toBeChecked();
    await waitFor(() => expect(umschalten).toHaveBeenCalled());
    const [, datum, baustelle, positionId, an] = umschalten.mock.calls[0];
    expect(datum).toBe(HEUTE);
    expect(baustelle).toBe('B-001');
    expect(positionId).toBe('p1');
    expect(an).toBe(true);
  });

  it('zeigt höchstens drei Zeilen, der Rest klappt auf', async () => {
    (ruestlisten.wert[0] as { positionen: unknown[] }).positionen = Array.from({ length: 5 }, (_, i) => ({
      id: `q${i}`, name: `Teil ${i}`, menge: 1,
    }));
    zeichne();
    await screen.findByText('Teil 0');
    expect(screen.queryByText('Teil 3')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'und 2 weitere →' }));
    expect(screen.getByText('Teil 3')).toBeInTheDocument();
  });

  it('zeigt an der Baustelle OHNE Liste auch keine', async () => {
    zeichne();
    await screen.findByText('Material');
    expect(screen.getAllByText('Material')).toHaveLength(1);
  });
});

/**
 * Wenn ein Teil der Startseite nicht kommt: kein ewiger Kreisel, und die
 * Seite sagt, welcher Teil fehlt — eine Startseite, die weniger zeigt, sähe
 * sonst aus wie ein ruhiger Tag.
 */
describe('Wenn ein Teil der Startseite nicht kommt', () => {
  it('hört auf zu laden, statt ewig zu kreiseln', async () => {
    scheitert.persoenlich = true;
    zeichne();
    await waitFor(() => expect(screen.queryByText(/Wird geladen/)).not.toBeInTheDocument());
  });

  it('sagt, welcher Teil fehlt', async () => {
    scheitert.persoenlich = true;
    zeichne();
    expect(await screen.findByText(/Nicht geladen: Deine Tage und Einsätze/)).toBeInTheDocument();
  });

  it('lässt nicht den Schluss zu, es stünde nichts an', async () => {
    scheitert.persoenlich = true;
    zeichne();
    await screen.findByText(/Nicht geladen/);
    expect(screen.getByText(/heißt nicht, dass nichts ansteht/)).toBeInTheDocument();
  });

  it('reisst die anderen Blöcke nicht mit', async () => {
    rolle.wert = 'Geschäftsführung';
    scheitert.betrieblich = true;
    zeichne();
    await screen.findByText(/Nicht geladen: Anforderungen und Lager/);
    expect(screen.queryByText(/Baustellen und Einsätze/)).not.toBeInTheDocument();
    // Die Leitungssicht ist trotzdem da.
    expect(await screen.findByRole('link', { name: /Aktive Baustellen/ })).toBeInTheDocument();
  });

  it('räumt die Meldung weg, sobald neu geladen wird', async () => {
    scheitert.persoenlich = true;
    const { rerender } = zeichne();
    await screen.findByText(/Nicht geladen/);
    scheitert.persoenlich = false;
    rolle.wert = 'Geschäftsführung';
    rerender(
      <MemoryRouter>
        <DashboardView />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.queryByText(/Nicht geladen/)).not.toBeInTheDocument());
  });

  it('behauptet beim ersten Zeichnen nicht, es läge nichts an', () => {
    // Bis die Ladeblöcke gezählt sind, lädt die Seite — vorher stand dort kurz „Heute liegt nichts an“.
    zeichne();
    expect(screen.queryByText('Heute liegt nichts an')).not.toBeInTheDocument();
    expect(document.querySelector('[data-geladen="nein"]')).not.toBeNull();
  });

  it('schweigt, solange alles durchkommt', async () => {
    zeichne();
    await waitFor(() => expect(screen.queryByText(/Wird geladen/)).not.toBeInTheDocument());
    expect(screen.queryByText(/Nicht geladen/)).not.toBeInTheDocument();
  });
});

/*
  GEMELDET: „im Dashboard steht nur der Betrag der offenen Rechnungen ohne
  irgendwelche Quick Links". Jede Summe führt in die passend gefilterte Liste.
*/
describe('Startseite — offene Rechnungen', () => {
  beforeEach(() => {
    rolle.wert = 'Geschäftsführung';
    offeneRechnungen.wert = [
      // Angezahlt und seit Juli fällig: der Rest ist ÜBERFÄLLIG, obwohl der
      // Stand „Teilbezahlt" heisst.
      { id: 'r1', invoiceNumber: 'RE-1', customerName: 'Huber', paymentStatus: 'Teilbezahlt', dueDate: '2026-07-15', totalBrutto: 1200, bezahltBetrag: 400 },
      // Ziel läuft noch.
      { id: 'r2', invoiceNumber: 'RE-2', customerName: 'Meier', paymentStatus: 'Offen', dueDate: '2026-10-01', totalBrutto: 300 },
    ];
  });

  it('zählt den Rest einer angezahlten, fälligen Rechnung als überfällig', async () => {
    zeichne();
    expect(await screen.findByRole('link', { name: /^Überfällig/ })).toHaveTextContent(/€\s800,00/);
    expect(screen.getByRole('link', { name: /^Offen/ })).toHaveTextContent(/€\s300,00/);
  });

  it('führt von jeder Summe in die passend gefilterte Rechnungsliste', async () => {
    zeichne();
    expect(await screen.findByRole('link', { name: /^Überfällig/ })).toHaveAttribute('href', '/invoices?status=%C3%9Cberf%C3%A4llig');
    expect(screen.getByRole('link', { name: /^Offen/ })).toHaveAttribute('href', '/invoices');
  });

  it('nennt die überfälligen Rechnungen als Thema unter „Überfällig“', async () => {
    zeichne();
    const thema = await screen.findByRole('link', { name: /1 Rechnung überfällig/ });
    expect(thema).toHaveTextContent(/62 Tage/);
  });
});

/*
  Prüflauf 25.09.2026, P4-15: eingeteilt werden nicht nur Monteure. „Mein
  Einsatzplan" (/my-schedule, nur Monteure) und „Schein schreiben" (nur wer
  Scheine schreibt) stehen nur da, wo sie hinführen dürfen.
*/
describe('Startseite — Verweise nur, wohin man darf (P4-15)', () => {
  it('zeigt dem Monteur Einsatzplan und Schein', async () => {
    zeichne();
    const karte = await karteMit(/2 Einsätze/);
    expect(within(karte).getByRole('link', { name: 'Mein Einsatzplan' })).toHaveAttribute('href', '/my-schedule');
    expect(within(karte).getAllByRole('link', { name: 'Schein schreiben' })).toHaveLength(2);
  });

  it.each(['Verwaltung', 'Buchhaltung'])('zeigt %s beides nicht', async (r) => {
    rolle.wert = r;
    zeichne();
    const karte = await karteMit('Dein Einsatz heute');
    expect(within(karte).queryByRole('link', { name: 'Mein Einsatzplan' })).not.toBeInTheDocument();
    expect(within(karte).queryByRole('link', { name: 'Schein schreiben' })).not.toBeInTheDocument();
    // Zeit buchen darf jede Rolle.
    expect(within(karte).getByRole('link', { name: /Wie zuletzt buchen/ })).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: 'Zeit erfassen' })).toBeInTheDocument();
  });

  it('zeigt dem Projektleiter den Schein, aber nicht den Einsatzplan der Monteure', async () => {
    rolle.wert = 'Projektleiter';
    zeichne();
    const karte = await karteMit('Dein Einsatz heute');
    expect(within(karte).queryByRole('link', { name: 'Mein Einsatzplan' })).not.toBeInTheDocument();
    expect(within(karte).getAllByRole('link', { name: 'Schein schreiben' })).toHaveLength(2);
  });
});

describe('Startseite — Termine heute (Plan 10.4)', () => {
  const termin = (id: string, teilnehmer: string[]): Termin => ({
    id, companyId: 'perl', art: 'Besichtigung', datum: HEUTE, zeitVon: '14:00', zeitBis: '15:00',
    projectNumber: 'B-001', customerId: null, teilnehmer, notiz: 'Schlüssel beim Nachbarn',
    ortName: 'Familie Huber', ortAdresse: 'Hauptstraße 12, 2700 Wiener Neustadt',
  });

  it('wer teilnimmt, sieht seinen Termin unter Heute', async () => {
    termine.wert = [termin('t1', ['m1'])];
    zeichne();
    // Erst wenn alles geladen ist: davor ordnet die Seite ihre Spalten noch um.
    await waitFor(() => expect(document.querySelector('[data-geladen="ja"]')).not.toBeNull());
    const karte = await karteMit('Deine Termine heute');
    expect(within(karte).getByText('Besichtigung · 14:00–15:00')).toBeInTheDocument();
    expect(within(karte).getByText('Familie Huber · B-001')).toBeInTheDocument();
    expect(within(karte).getByRole('link', { name: /Hauptstraße 12/ })).toBeInTheDocument();
    expect(within(karte).getByText('Schlüssel beim Nachbarn')).toBeInTheDocument();
  });

  it('Gegenprobe: ein Termin ohne mich steht nicht da — auch wenn die Datenbank ihn der Leitung gibt', async () => {
    rolle.wert = 'Projektleiter';
    termine.wert = [termin('t2', ['m2'])];
    zeichne();
    await waitFor(() => expect(document.querySelector('[data-geladen="ja"]')).not.toBeNull());
    expect(screen.queryByText('Deine Termine heute')).toBeNull();
  });
});
