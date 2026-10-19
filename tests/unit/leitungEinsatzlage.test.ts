/**
 * „BAUSTELLEN OHNE EINSATZ“ UND DIE AUSLASTUNG — AUS DER EINSATZLAGE
 * (Ladezeit, 19.10.2026).
 *
 * Bis hierher holte die Startseite der Leitung jeden Einsatz von 90 Tagen
 * zurück bis 14 Tage voraus (mit einer Grenze von 3.000, die still abschnitt).
 * Jetzt: je Baustelle der letzte und der nächste Einsatz
 * (`baustellenEinsatzlage`) und die Einsatztage dieser Woche.
 *
 * Gegenprobe: gegen den Stand davor fragt der Block weder die Einsatzlage
 * noch die Woche allein (rot). Gleich bleibt: welche Baustellen ohne Einsatz
 * dastehen, mit ihrem letzten Einsatz, und die Auslastung.
 */
import { describe, it, expect, vi } from 'vitest';

const gefragt: { lage?: unknown[]; tage?: unknown[] } = {};
vi.mock('@/lib/db/assignments', () => ({
  listAssignmentsForDate: vi.fn(async () => []),
  listEinsatztageInRange: vi.fn(async (...a: unknown[]) => {
    gefragt.tage = a;
    return [{ userId: 'm1', date: '2026-10-13', projectNumber: 'B-1' }];
  }),
  baustellenEinsatzlage: vi.fn(async (...a: unknown[]) => {
    gefragt.lage = a;
    return [
      { projectNumber: 'B-1', zuletzt: '2026-10-09', naechster: '2026-10-14' },
      { projectNumber: 'B-2', zuletzt: '2026-09-20', naechster: null },
    ];
  }),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => [
    { id: 'p1', projectNumber: 'B-1', status: 'Aktiv' },
    { id: 'p2', projectNumber: 'B-2', status: 'Aktiv' },
    { id: 'p3', projectNumber: 'B-3', status: 'Aktiv' },
  ]),
  listProjectsByNumbers: vi.fn(async () => []),
}));
vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => null),
  listUsers: vi.fn(async () => [{ uid: 'm1', name: 'Max', role: 'Mitarbeiter', active: true, workDays: [1, 2, 3, 4, 5] }]),
}));
vi.mock('@/lib/db/vacations', () => ({ listAbwesendInRange: vi.fn(async () => []), listOpenVacations: vi.fn(async () => []) }));

const { leitung } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'gf', companyId: 'c1', role: 'Geschäftsführung' as const }, company: null, heute: '2026-10-13' };

describe('Leitung: Einsatzlage statt jedes Einsatzes', () => {
  it('fragt je Baustelle den letzten und nächsten Einsatz im Fenster — und die Woche allein', async () => {
    await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    expect(gefragt.lage).toEqual(['c1', '2026-07-15', '2026-10-13', '2026-10-27']);
    expect(gefragt.tage).toEqual(['c1', '2026-10-12', '2026-10-18']);
  });

  it('Gleichbleiben: ohne kommenden Einsatz mit dem letzten davor, ganz ohne Einsatz ohne Datum', async () => {
    const d = await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    expect(d.ohneEinsatz).toEqual([
      { projectNumber: 'B-2', zuletzt: '2026-09-20' },
      { projectNumber: 'B-3', zuletzt: undefined },
    ]);
  });

  it('Gleichbleiben: die Auslastung aus den Einsatztagen der Woche', async () => {
    const d = await leitung(k, { einsatzplanung: true, wartung: false, budget: false });
    // Ein Monteur, fünf Arbeitstage, an einem davon eingeteilt.
    expect(d.auslastung).toBe(20);
  });
});
