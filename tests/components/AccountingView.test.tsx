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

vi.mock('@/lib/db/users', () => ({
  listUsers: vi.fn(async () => [monteur]),
}));
vi.mock('@/lib/db/projects', () => ({
  // Die Ansicht laedt nur noch die Baustellen, die in den geladenen
  // Buchungen VORKOMMEN — nicht mehr den gesamten Bestand.
  listProjectsByNumbers: vi.fn(async () => []),
}));
vi.mock('@/lib/db/timeEntries', () => ({
  subscribeEntriesInRange: vi.fn(
    (
      _company: string,
      _from: string,
      _to: string,
      cb: (rows: (TimeEntry & { id: string })[]) => void,
    ) => {
      cb(eintraege);
      return () => undefined;
    },
  ),
  listEntriesInRange: vi.fn(async () => eintraege),
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

    // Vom 17. bis 31. August liegen 11 Werktage (der 31. eingeschlossen),
    // also 88 Stunden Soll — nicht die 168 des ganzen Monats.
    const soll = screen.getByText('Soll').previousElementSibling;
    expect(soll).toHaveTextContent('88:00');
  });

  it('zeigt keinen Minus-Saldo, wenn ab Eintritt vollstaendig gebucht wurde', async () => {
    await oeffneMitarbeiter();

    // 10 gebuchte Tage a 8 Stunden = 80 Stunden Ist. Offen ist allein der
    // heutige 31., also -8:00 — und eben nicht -168:00.
    const saldo = screen.getByText('Saldo').previousElementSibling;
    expect(saldo).toHaveTextContent('-08:00');
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
