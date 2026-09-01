import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Assignment, MaterialOrder, Project, TimeEntry } from '@/types';

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

vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => monteur),
  listUsers: vi.fn(async () => [monteur]),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () =>
    // Wie die echte Abfrage: abgeschlossene Baustellen kommen gar nicht erst
    // zurück. Ein Mock, der ALLE liefert, würde den Filter der Ansicht
    // prüfen statt den der Datenschicht — und damit am Fehler vorbei.
    baustellen.filter((p) => p.status === 'Aktiv' || p.status === 'Pausiert'),
  ),
  listProjectsByNumbers: vi.fn(async (_c: string, nummern: string[]) =>
    baustellen.filter((p) => nummern.includes(p.projectNumber)),
  ),
}));
vi.mock('@/lib/db/assignments', () => ({
  listUpcomingAssignments: vi.fn(async () => einsaetze),
  listAssignmentsForDate: vi.fn(async () => einsaetze),
}));
vi.mock('@/lib/db/timeEntries', () => ({
  listOwnEntriesSince: vi.fn(async () => buchungen),
  listEntriesInRange: vi.fn(async () => buchungen),
  listEntriesForProjects: vi.fn(async () => [] as TimeEntry[]),
}));
vi.mock('@/lib/db/materialOrders', () => ({
  listOpenOrders: vi.fn(async () => [] as MaterialOrder[]),
  listOwnOpenOrders: vi.fn(async () => [] as MaterialOrder[]),
}));
vi.mock('@/lib/db/invoices', () => ({
  listUnpaidInvoices: vi.fn(async () => []),
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
  // Feste Uhr: sonst verschiebt sich „heute" und der Test wird mit der Zeit
  // falsch statt rot.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 15, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  rolle.wert = 'Mitarbeiter';
});

describe('Startseite — Monteur', () => {
  it('zeigt ALLE Einsätze von heute, nicht nur den ersten', async () => {
    zeichne();
    const karte = (await screen.findByText(/Heute — 2 Baustellen/i)).closest('section')!;
    expect(within(karte).getByText('Familie Huber')).toBeInTheDocument();
    expect(within(karte).getByText('Gemeinde Neudorf')).toBeInTheDocument();
    // Die Kommentare unterscheiden die beiden Einsätze — ohne sie weiß der
    // Monteur nicht, welche Baustelle wann dran ist.
    expect(within(karte).getByText('Bad, Vormittag')).toBeInTheDocument();
    expect(within(karte).getByText('Heizung, Nachmittag')).toBeInTheDocument();
  });

  it('macht Adresse und Telefonnummer zu Handgriffen', async () => {
    zeichne();
    await screen.findByText(/Heute — 2 Baustellen/i);

    const route = screen.getByRole('link', { name: /Hauptstraße 12/ });
    expect(route).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/search/?api=1&query='),
    );
    expect(route).toHaveAttribute('target', '_blank');

    // Leerzeichen müssen aus der Nummer heraus — `tel:` verträgt sie nicht.
    expect(screen.getByRole('link', { name: /0664 1234567/ })).toHaveAttribute(
      'href',
      'tel:06641234567',
    );
    // Ein FÜHRENDES Plus bleibt erhalten — ohne Landesvorwahl scheitert der
    // Anruf ins Ausland; Leerzeichen dazwischen fallen weg.
    expect(screen.getByRole('link', { name: /\+43 2635 12345/ })).toHaveAttribute(
      'href',
      'tel:+43263512345',
    );
  });

  it('nennt die fehlenden Tage statt eines Saldos', async () => {
    zeichne();
    // Gebucht ist nur der 1.9. — vom 2.9. bis gestern (14.9.) fehlt alles.
    const hinweis = await screen.findByRole('alert');
    expect(hinweis).toHaveTextContent(/Tage ohne Buchung/);
    // Konkrete Daten, nicht nur eine Zahl: „3 Tage fehlen" zwingt zum Suchen.
    expect(hinweis).toHaveTextContent(/\d{2}\.\d{2}\./);
    // Und ausdrücklich KEIN Saldo mehr.
    expect(screen.queryByText(/Saldo/i)).not.toBeInTheDocument();
  });
});

describe('Startseite — Geschäftsführung', () => {
  beforeEach(() => {
    rolle.wert = 'Geschäftsführung';
  });

  it('listet alle aktiven Baustellen, aber keine abgeschlossene', async () => {
    zeichne();
    const karte = (await screen.findByText(/Aktive Baustellen \(2\)/i)).closest('section')!;
    expect(within(karte).getByText(/Familie Huber/)).toBeInTheDocument();
    expect(within(karte).getByText(/Gemeinde Neudorf/)).toBeInTheDocument();
    // Die abgeschlossene Baustelle gehört hier nicht hin — sie macht mit den
    // Jahren den Großteil des Bestands aus.
    expect(within(karte).queryByText(/Altbau Meier/)).not.toBeInTheDocument();
  });

  it('führt in den Baustellen-Tab und in die Einsatzplanung', async () => {
    zeichne();
    await screen.findByText(/Aktive Baustellen/i);
    expect(screen.getByRole('link', { name: /Baustellen verwalten/i })).toHaveAttribute(
      'href',
      '/admin-projects',
    );
    expect(screen.getByRole('link', { name: /Zur Einsatzplanung/i })).toHaveAttribute(
      'href',
      '/assignments',
    );
  });

  it('zeigt die heutige Einteilung nach Baustelle', async () => {
    zeichne();
    const karte = (await screen.findByText(/Heute im Einsatz/i)).closest('section')!;
    // Beide Baustellen, jeweils mit der Person darauf.
    expect(within(karte).getByText(/Familie Huber/)).toBeInTheDocument();
    expect(within(karte).getByText(/Gemeinde Neudorf/)).toBeInTheDocument();
    expect(within(karte).getAllByText('Anton Berger')).toHaveLength(2);
  });
});
