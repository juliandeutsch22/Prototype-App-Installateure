/**
 * DER BUDGETSTAND REISST DEN BLOCK DER LEITUNG NICHT MIT.
 *
 * Seit Runde 5 (M1) kommen die Stunden der Baustellen aus
 * `baustellen_stunden`, und die antwortet allen außer der Leitung des
 * Betriebs mit einem Fehler — auch dem Support im Einblick. Der Fehler stieg
 * bis zum Block „Baustellen und Einsätze“ auf, und die Startseite verlor
 * Baustellen, Einsätze und Wartungen. Jetzt fehlt nur der Budgetstand — und
 * mit ihm das „alle im Budget“ (`aufbau.ts`).
 *
 * Gegenprobe: ohne die Änderung scheitert `leitung` als Ganzes.
 */
import { describe, it, expect, vi } from 'vitest';

const stunden = vi.fn<(n: string[]) => Promise<unknown[]>>();
vi.mock('@/lib/db/timeEntries', () => ({
  stundenDerBaustellen: (n: string[]) => stunden(n),
  listOwnEntriesSince: vi.fn(), listOwnEntriesInRange: vi.fn(), listEntriesInRange: vi.fn(),
}));
vi.mock('@/lib/db/projects', () => ({
  listActiveProjects: vi.fn(async () => [
    { id: 'p1', projectNumber: 'B-1', customerName: 'Huber', status: 'Aktiv', estimatedHours: 10 },
  ]),
  listProjectsByNumbers: vi.fn(async () => []),
}));
vi.mock('@/lib/db/users', () => ({ listUsers: vi.fn(async () => []), getUserByUid: vi.fn() }));

const { leitung } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'u1', companyId: 'c1', role: 'Administrator' as const }, company: null, heute: '2026-10-10' };

describe('Startseite der Leitung: Budgetstand', () => {
  it('scheitern die Stunden, fehlt nur der Budgetstand — die Baustellen bleiben', async () => {
    stunden.mockRejectedValueOnce(new Error('Die Stunden der Baustellen sieht nur die Leitung'));
    const d = await leitung(k, { einsatzplanung: false, wartung: false, budget: true });
    expect(d.projekte?.map((p) => p.projectNumber)).toEqual(['B-1']);
    expect(d.budget).toBeUndefined();
  });

  it('mit den Stunden steht der Budgetstand da — wie bisher', async () => {
    stunden.mockResolvedValueOnce([{ projectNumber: 'B-1', art: 'fach', minuten: 540, userId: 'x', userName: 'X', zuletzt: '2026-10-01' }]);
    const d = await leitung(k, { einsatzplanung: false, wartung: false, budget: true });
    expect(d.budget?.map((b) => [b.projectNumber, b.pct])).toEqual([['B-1', 90]]);
  });
});
