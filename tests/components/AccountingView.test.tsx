import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ToastProvider } from '@/components/Toast';
import userEvent from '@testing-library/user-event';
import type { AppUser, TimeEntry } from '@/types';
import AccountingView from '@/features/accounting/AccountingView';

/**
 * Der Fehler, den dieser Test verhindert, ist wirklich passiert: die
 * Mitarbeiteruebersicht wies einem Mitarbeiter mit Eintritt zur Monatsmitte
 * Sollstunden fuer die Tage davor zu — und fuer alle Vormonate gleich mit. Ein
 * frisch eingestellter Monteur stand damit vom ersten Tag an mit Hunderten
 * Minusstunden da.
 *
 * Die Rechenformel war nie falsch. Falsch war die VERDRAHTUNG: das
 * Eintrittsdatum stand nicht einmal in der Signatur der Funktion, die die
 * Ansicht aufruft. Genau diese Luecke faengt kein Rechen-Test, sondern nur
 * einer, der die Ansicht tatsaechlich rendert.
 */

const monteur: AppUser = {
  id: 'u1',
  companyId: 'perl',
  uid: 'u1',
  name: 'Neu Eingestellt',
  email: 'neu@perl.at',
  role: 'Mitarbeiter',
  active: true,
  weeklyTargetHours: 40,
  yearlyVacationDays: 25,
  workDays: [1, 2, 3, 4, 5],
  // Eintritt zur Monatsmitte: der 17. August 2026 ist ein Montag.
  appStartDate: '2026-08-17',
};

const eintrag = (date: string): TimeEntry & { id: string } => ({
  id: `e-${date}`,
  companyId: 'perl',
  date,
  status: 'Anwesend',
  startTime: '07:00',
  endTime: '15:00',
  breakDuration: 0,
  userId: 'u1',
  userName: monteur.name,
});

// Ab Eintritt sauber gebucht: Mo-Fr je 8 Stunden, 17.-21. und 24.-28.
// Der 31. ist "heute" im Test und bleibt offen.
const eintraege = [
  '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
  '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28',
].map(eintrag);

/** Wen die Ansicht als Belegschaft vorfindet — je Test setzbar. */
let benutzer: AppUser[] = [monteur];

vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => benutzer),
}));
vi.mock('@/lib/db/projects', () => ({
  // Die Ansicht laedt nur noch die Baustellen, die in den geladenen
  // Buchungen VORKOMMEN — nicht mehr den gesamten Bestand.
  listProjectsByNumbers: vi.fn(async () => []),
}));
/** Was die Ansicht als Buchungen vorfindet — je Test setzbar. */
let buchungen: (TimeEntry & { id: string })[] = eintraege;

vi.mock('@/lib/db/timeEntries', () => ({
  subscribeEntriesInRange: vi.fn(
    (
      _company: string,
      _from: string,
      _to: string,
      cb: (rows: (TimeEntry & { id: string })[]) => void,
    ) => {
      cb(buchungen);
      return () => undefined;
    },
  ),
  listEntriesInRange: vi.fn(async () => buchungen),
  deleteTimeEntry: vi.fn(),
}));
/**
 * EIN Objekt, nicht bei jedem Aufruf ein neues.
 *
 * Die Ansicht haengt ihr Abonnement an die Identitaet von `user`. Im echten
 * Context ist das ein State-Wert und damit stabil; ein Mock, der jedes Mal
 * ein frisches Objekt liefert, loest dagegen eine Endlosschleife aus —
 * Effekt laeuft, setzt Zustand, rendert neu, neues user-Objekt, Effekt laeuft.
 */
const authWert = {
  user: {
    uid: 'chefin',
    email: 'chefin@perl.at',
    name: 'Petra Perl',
    role: 'Geschäftsführung' as const,
    companyId: 'perl',
    docId: 'chefin',
  },
  company: { id: 'perl', name: 'Perl Installationen GmbH' },
  loading: false,
  error: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));


beforeEach(() => {
  benutzer = [monteur];
  buchungen = eintraege;
  // Fest auf den 31.08.2026, damit "heute" den Test nicht mit der Zeit
  // verschiebt. shouldAdvanceTime, weil userEvent intern Zeitgeber braucht.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 31, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

async function oeffneMitarbeiter() {
  // userEvent wartet intern ueber Zeitgeber. Ohne advanceTimers dreht es sich
  // gegen die eingefrorene Uhr fest und der Test laeuft nie zu Ende.
  const nutzer = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  // Der ToastProvider gehoert dazu: die Ansicht meldet Erfolge darueber.
  render(
    <ToastProvider>
      <AccountingView />
    </ToastProvider>,
  );
  const kopf = await screen.findByRole('button', { name: /Neu Eingestellt/ });
  await nutzer.click(kopf);
  return kopf;
}

describe('Mitarbeiteruebersicht — Eintritt zur Monatsmitte', () => {
  it('rechnet die Tage VOR dem Eintritt nicht ins Soll', async () => {
    await oeffneMitarbeiter();

    /**
     * Vom 17. bis GESTERN (30.8., ein Sonntag) liegen 10 Werktage, also 80
     * Stunden Soll — nicht die 168 des ganzen Monats, und auch nicht die 88
     * inklusive des heutigen 31.
     *
     * Der heutige Tag zaehlt nicht mit: er ist noch nicht vorbei. Diese
     * Erwartung stand hier vorher auf 88:00 und hielt damit denselben Fehler
     * im Kleinen fest, der im Betrieb als „00:00 von 176:00 · −176:00" am
     * Monatsanfang auffiel.
     */
    const soll = screen.getByText('Soll').previousElementSibling;
    expect(soll).toHaveTextContent('80:00');
  });

  it('zeigt keinen Minus-Saldo, wenn ab Eintritt vollstaendig gebucht wurde', async () => {
    await oeffneMitarbeiter();

    // 10 gebuchte Tage a 8 Stunden = 80 Stunden Ist, und genau 80 Stunden
    // Soll bis gestern. Der Saldo ist damit ausgeglichen — und eben nicht
    // -168:00 und auch nicht -08:00 fuer den laufenden Tag.
    const saldo = screen.getByText('Saldo').previousElementSibling;
    expect(saldo).toHaveTextContent('00:00');
  });

  it('fuehrt keinen Tag vor dem Eintritt als fehlende Buchung', async () => {
    await oeffneMitarbeiter();

    // Der 3. bis 14. August liegen vor dem Eintritt und duerfen nirgends als
    // Versaeumnis auftauchen.
    const luecken = screen.queryByText(/Arbeitstage ohne Buchung/);
    expect(luecken?.textContent ?? '').not.toMatch(/1[0-9] Arbeitstage/);
    expect(screen.queryByText(/03\.08\./)).not.toBeInTheDocument();
  });

  it('listet im Tagesnachweis nur Tage ab dem Eintritt', async () => {
    await oeffneMitarbeiter();

    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getByText('Mo 17.08.')).toBeInTheDocument();
    expect(within(tabelle).queryByText('Mo 03.08.')).not.toBeInTheDocument();
  });
});

/**
 * Was dasteht, wenn die Liste leer ist.
 *
 * AUS DEM BETRIEB GEMELDET: die Geschäftsführung bucht eine Zeit und liest
 * danach, es gebe keine Mitarbeiter. Die Aussage war richtig — ein
 * Geschäftsführungskonto führt kein Zeitkonto und erscheint hier nie —, aber
 * sie klang nach einem Fehler, wo eine Erklärung hingehört.
 */
/**
 * MEHRERE BUCHUNGEN AN EINEM TAG — und was die Übersicht davon zeigt.
 *
 * AUS DEM BETRIEB GEMELDET: „die zweite Zeitbuchung an einem Tag erscheint
 * zwar in der Projektauswertung, aber wird in der Mitarbeiterübersicht nicht
 * angezeigt."
 *
 * Der Tagesnachweis nahm mit `find` die ERSTE Buchung des Tages. Das war
 * richtig, solange je Tag nur eine möglich war; seit ein Monteur mehrere
 * Baustellen an einem Tag buchen kann, ist es falsch — und besonders
 * unangenehm, weil der Fuß trotzdem ALLE zählte: „4 Einträge · 31:00" über
 * drei sichtbaren Zeilen. Die vierte Buchung war weder zu sehen noch zu
 * bearbeiten oder zu löschen.
 */
describe('Mitarbeiteruebersicht — mehrere Buchungen an einem Tag', () => {
  const zweiterEinsatz: TimeEntry & { id: string } = {
    id: 'e-zweiter',
    companyId: 'perl',
    date: '2026-08-17',
    status: 'Anwesend',
    startTime: '16:00',
    endTime: '19:00',
    breakDuration: 0,
    userId: 'u1',
    userName: monteur.name,
    projectNumber: 'B-2026-0002',
    customerName: 'Zweite Baustelle',
    isEmergency: true,
  };

  beforeEach(() => {
    buchungen = [...eintraege, zweiterEinsatz];
  });

  it('zeigt BEIDE Buchungen des Tages, nicht nur die erste', async () => {
    await oeffneMitarbeiter();

    const tabelle = screen.getByRole('table');
    // Zweimal derselbe Tag — einmal je Buchung.
    expect(within(tabelle).getAllByText('Mo 17.08.')).toHaveLength(2);
    expect(within(tabelle).getByText('Zweite Baustelle')).toBeInTheDocument();
  });

  it('zählt im Fuß nicht mehr, als es zeigt', async () => {
    /*
      DER WIDERSPRUCH, DER GEMELDET WURDE. Der Fuß zählte alle Einträge, die
      Liste zeigte weniger. Eine Ansicht, die sich selbst widerspricht,
      kostet mehr Vertrauen als eine, die etwas gar nicht kann.
    */
    await oeffneMitarbeiter();

    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getByText('11 Einträge')).toBeInTheDocument();
    // 10 Tage à 08:00 plus der zweite Einsatz mit 03:00.
    /*
      Gezählt werden die Zeilen mit „Bearbeiten" — das sind genau die
      Buchungen. Eine feste Zeilenzahl wäre brittle: der Nachweis führt auch
      Feiertage ohne Buchung (im August 2026 der 15.).
    */
    expect(within(tabelle).getAllByRole('button', { name: 'Bearbeiten' })).toHaveLength(11);
  });

  it('zeigt den Notdienst-Haken — er hängt an einem Zuschlag', async () => {
    /*
      GEMELDET: „Notdienst wurde angehakt, aber das scheint nicht auf."
      Gespeichert war er; gezeigt wurde er nur in der eigenen Zeitübersicht.
      Wer ihn hier nicht sieht, schreibt die Stunde ohne den Zuschlag von
      +100 % in die Rechnung — und das fällt niemandem auf, weil die Zahl
      plausibel aussieht.
    */
    await oeffneMitarbeiter();

    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getByText('Notdienst')).toBeInTheDocument();
  });
});

describe('Mitarbeiteruebersicht — die leere Liste erklaert sich', () => {
  const gf: AppUser = {
    ...monteur,
    id: 'gf', uid: 'gf', name: 'Julian Deutsch', role: 'Geschäftsführung',
  } as AppUser;

  it('sagt, WARUM niemand dasteht, wenn es nur Leitung gibt', async () => {
    benutzer = [gf];
    render(
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
    );

    expect(await screen.findByText(/Kein Konto führt ein Zeitkonto/)).toBeInTheDocument();
    expect(screen.getByText(/Geschäftsführung, Projektleitung und Administration/)).toBeInTheDocument();
  });

  it('sagt etwas anderes, wenn wirklich niemand angelegt ist', async () => {
    // „Noch keine Benutzer" und „keiner davon führt ein Zeitkonto" sind zwei
    // verschiedene Lagen mit zwei verschiedenen naechsten Schritten.
    benutzer = [];
    render(
      <ToastProvider>
        <AccountingView />
      </ToastProvider>,
    );

    expect(await screen.findByText('Noch keine Benutzer angelegt.')).toBeInTheDocument();
  });
});
