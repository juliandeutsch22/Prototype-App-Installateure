/**
 * DIE STARTSEITE DES MONTEURS FRAGT GLEICHZEITIG (Analyse 09.10.2026,
 * Maßnahme 7).
 *
 * Nach Profil, Buchungen und Einsätzen hingen die übrigen Teile
 * nacheinander: offene Nachträge (Scheine), eigene Anforderungen, Saldo …
 * Keiner wartet auf den anderen. Gegenprobe: gegen den Stand davor ist die
 * Anforderung erst gefragt, wenn die Scheine geantwortet haben (rot).
 * Gleich bleibt: was herauskommt.
 */
import { describe, it, expect, vi } from 'vitest';

const offen: Record<string, (w: unknown) => void> = {};
const gefragt: string[] = [];
const spaeter = <T>(name: string) => () => {
  gefragt.push(name);
  return new Promise<T>((r) => { offen[name] = r as (w: unknown) => void; });
};

vi.mock('@/lib/db/users', () => ({
  getUserByUid: vi.fn(async () => ({ uid: 'm1', name: 'Max', role: 'Mitarbeiter', active: true })),
  listUsers: vi.fn(async () => []),
}));
vi.mock('@/lib/db/timeEntries', () => ({
  listOwnEntriesSince: vi.fn(async () => []),
  listOwnEntriesInRange: vi.fn(async () => []),
  listEntriesInRange: vi.fn(async () => []),
  stundenDerBaustellen: vi.fn(async () => []),
}));
vi.mock('@/lib/db/assignments', async (orig) => ({
  ...(await orig<object>()),
  listUpcomingAssignments: vi.fn(async () => []),
  listAssignmentsForUserInRange: vi.fn(async () => []),
}));
vi.mock('@/lib/db/workSheets', () => ({
  listOwnWorkSheetsSince: vi.fn(spaeter('scheine')),
  listRecentWorkSheets: vi.fn(async () => []),
}));
vi.mock('@/lib/db/materialOrders', () => ({
  listOwnOpenOrders: vi.fn(spaeter('anforderungen')),
  listOpenOrders: vi.fn(async () => []),
}));

const { persoenlich } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'm1', companyId: 'c1', role: 'Mitarbeiter' as const, name: 'Max' }, company: null, heute: '2026-10-10' };

describe('Startseite des Monteurs', () => {
  it('fragt Scheine und Anforderungen gleichzeitig — und liefert dasselbe', async () => {
    const lauf = persoenlich(k, { material: true, scheine: true, kennzahlen: false });
    await vi.waitFor(() => expect(gefragt).toContain('scheine'));
    await vi.waitFor(() => expect(gefragt).toContain('anforderungen'));
    offen.scheine([]);
    offen.anforderungen([{ id: 'o1' }]);
    const d = await lauf;
    expect(d.eigeneOrders).toEqual([{ id: 'o1' }]);
    expect(d.nachtraege).toEqual([]);
    expect(d.heuteEigene).toEqual([]);
  });
});
