import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import type { AppUser, Assignment, Project, Termin } from '@/types';

/**
 * DIE TEAM-WOCHE BLEIBT, WIE SIE IST (Runde 4, Auftrag 4.8).
 *
 * Die Einsatzplanung bekommt ein neues Raster, neue Zellen und ein
 * Seitenfenster „Tag“. Die Team-Woche der Monteure (`WochenplanView
 * nurLesen`) rechnet mit denselben Daten — sie darf sich dabei nicht ändern:
 * keine Knöpfe, kein „frei“, kein Monat, „abwesend“ ohne Grund, dieselbe
 * Termine-Zeile, dasselbe Aussehen.
 *
 * Geprüft wird deshalb das GANZE gezeichnete DOM mit festen Daten gegen eine
 * eingecheckte Datei. Sie entstand VOR dem Umbau der Einsatzplanung; jede
 * Abweichung danach ist eine Änderung an der Team-Woche und fällt hier auf.
 * Die Daten decken ab, was die Team-Woche zeigt: Gruppen nach Einstufung,
 * Helfer, Uhrzeit, zwei Einsätze an einem Tag, eingeteilt und krank,
 * stundenweise weg, Betriebsurlaub mit Ausnahme, Feiertage, Termine.
 */

const BAUSTELLEN: Project[] = [
  { id: 'p1', companyId: 'perl', projectNumber: 'B-2026-0147', customerName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118', status: 'Aktiv' } as Project,
  { id: 'p2', companyId: 'perl', projectNumber: 'B-2026-0148', customerName: 'Gemeinde Neudorf', status: 'Aktiv' } as Project,
];

const mk = (uid: string, name: string, x: Partial<AppUser> = {}) =>
  ({
    id: uid, companyId: 'perl', uid, name, email: `${uid}@perl.at`,
    role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, workDays: [1, 2, 3, 4, 5], ...x,
  }) as AppUser;

const LEUTE: AppUser[] = [
  mk('u1', 'Max Mustermann'),
  mk('u2', 'Erna Beispiel'),
  mk('u3', 'Stefan Gruber', { einstufung: 'obermonteur' } as Partial<AppUser>),
  mk('u4', 'Jürgen Fasching', { einstufung: 'helfer' } as Partial<AppUser>),
  mk('u5', 'Lena Pichler', { einstufung: 'lehrling' } as Partial<AppUser>),
];

// Die Woche mit dem Nationalfeiertag (Mo 26.10.) und Allerheiligen (So 01.11.).
const E = (id: string, date: string, pn: string, uid: string, x: Partial<Assignment> = {}) =>
  ({ id, companyId: 'perl', date, projectNumber: pn, userId: uid, userName: LEUTE.find((u) => u.uid === uid)!.name, ...x }) as Assignment & { id: string };
const EINSAETZE = [
  E('a1', '2026-10-27', 'B-2026-0147', 'u1', { zeitVon: '07:00', zeitBis: '15:30' }),
  E('a2', '2026-10-27', 'B-2026-0147', 'u4', { asHelper: true }),
  E('a3', '2026-10-28', 'B-2026-0147', 'u3'),
  E('a4', '2026-10-28', 'B-2026-0148', 'u3', { zeitVon: '16:00' }),
  E('a5', '2026-10-29', 'B-2026-0148', 'u2'),
  E('a6', '2026-10-29', 'B-2026-0148', 'u5', { asHelper: true }),
  E('a7', '2026-10-31', 'B-2026-0148', 'u1', { zeitVon: '08:00', zeitBis: '12:00' }),
];
/** So sieht der Monteur Abwesenheiten: ohne Grund. */
const ABWESEND = [
  { userId: 'u2', von: '2026-10-29', bis: '2026-10-29', grund: null, zeiten: null },
  { userId: 'u4', von: '2026-10-28', bis: '2026-10-28', grund: null, zeiten: '13:00–17:00' },
];
const BETRIEBSURLAUB = [{ id: 'b1', von: '2026-10-30', bis: '2026-10-30', bezeichnung: 'Fenstertag', ausgenommen: ['u3'] }];
const TERMINE: Termin[] = [
  { id: 't1', companyId: 'perl', art: 'Lieferung', datum: '2026-10-27', zeitVon: '08:00', zeitBis: '10:00', projectNumber: 'B-2026-0147', teilnehmer: ['u1'], ortName: 'Wohnungseigentümergemeinschaft Hauptstraße 112–118' },
  { id: 't2', companyId: 'perl', art: 'Abnahme', datum: '2026-10-29', projectNumber: 'B-2026-0148', teilnehmer: [], ortName: 'Gemeinde Neudorf' },
];

vi.mock('@/lib/db/termine', () => ({
  listTermineImZeitraum: vi.fn(async () => TERMINE),
  listTermineDerBaustelle: vi.fn(async () => []),
  listTermineDesKunden: vi.fn(async () => []),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => LEUTE) }));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => BAUSTELLEN),
  listRecentProjects: vi.fn(async () => BAUSTELLEN),
  listProjectsByNumbers: vi.fn(async () => BAUSTELLEN),
}));
vi.mock('@/lib/db/abwesenheiten', () => ({ listBetriebsurlaubeImZeitraum: vi.fn(async () => BETRIEBSURLAUB) }));
vi.mock('@/lib/db/vacations', () => ({
  listApprovedVacationsInRange: vi.fn(async () => []),
  listAbwesendInRange: vi.fn(async () => ABWESEND),
}));
vi.mock('@/lib/db/assignments', () => ({
  kalenderAboStand: vi.fn(async () => null),
  subscribeAssignmentsInRange: (_c: string, _v: string, _b: string, cb: (r: unknown[]) => void) => {
    cb(EINSAETZE);
    return () => undefined;
  },
}));

const authWert = {
  user: { uid: 'u1', companyId: 'perl', name: 'Max Mustermann', role: 'Mitarbeiter' as const, email: 'u1@perl.at', docId: 'u1' },
  // Das Abo ist erlaubt — die Team-Woche zeigt es trotzdem nicht.
  company: { id: 'perl', name: 'Perl Installationen', wochenplanFuerAlle: true, kalenderAboErlaubt: true },
  loading: false, error: null,
  signIn: vi.fn(), signOut: vi.fn(), resetPassword: vi.fn(), reloadCompany: vi.fn(),
};
vi.mock('@/app/AuthContext', () => ({ useAuth: () => authWert }));

const { default: WochenplanView } = await import('@/features/assignments/WochenplanView');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 9, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

/** Die von React vergebenen Kennungen (`useId`) hängen an der Reihenfolge der Bausteine, nicht an der Team-Woche. */
function ohneZufall(html: string): string {
  return html.replace(/«r[0-9a-z]+»|:r[0-9a-z]+:/g, '«id»');
}

describe('Team-Woche — unverändert', () => {
  it('zeichnet mit festen Daten genau das DOM von vor Runde 4', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/my-schedule/team']}>
        <ToastProvider>
          <WochenplanView nurLesen />
        </ToastProvider>
      </MemoryRouter>,
    );
    // Warten, bis alles geladen ist: Einsätze, Abwesenheiten, Betriebsurlaub, Termine.
    await screen.findAllByText('Wohnungseigentümergemeinschaft Hauptstraße 112–118');
    await screen.findByText('Fenstertag');
    await screen.findByRole('rowheader', { name: 'Termine' });
    await screen.findAllByText('abwesend 13:00–17:00');
    await expect(ohneZufall(container.innerHTML).replace(/></g, '>\n<')).toMatchFileSnapshot(
      '../fixtures/teamWoche-dom.html',
    );
  });
});
