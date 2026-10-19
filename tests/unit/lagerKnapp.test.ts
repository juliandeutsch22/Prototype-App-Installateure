/**
 * DIE KNAPPEN ARTIKEL DER STARTSEITE.
 *
 * Analyse 09.10.2026: die Startseite suchte unter den ersten 1.000 Artikeln
 * des Katalogs; mit einem eingespielten Großhandelskatalog fehlte ein knapper
 * Lagerartikel still. Danach holte sie alle Lagerartikel und ihr Freies.
 *
 * Ladezeit 19.10.2026: die Datenbank rechnet die Regel (`lager_knapp`, siehe
 * `tests/supabase/schmaleAbfragen.test.ts` — dort auch, dass sie dieselbe
 * Antwort gibt wie der Weg im Browser). Hier: die Startseite fragt genau
 * danach, mit der Grenze der Lagerliste, und holt dafür keinen Artikel mehr.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const KNAPP = [
  { id: 'a', name: 'Knapp hinten', unit: 'Stk', mindestmenge: null, frei: 2 },
  { id: 'b', name: 'Zugesagt', unit: 'Stk', mindestmenge: null, frei: 3 },
];
const lagerKnapp = vi.fn(async (grenze: number) => (grenze >= 0 ? KNAPP : []));
const listLagerartikel = vi.fn(async () => []);
const lagerFrei = vi.fn(async () => new Map());
vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  lagerKnapp: (g: number) => lagerKnapp(g),
  listLagerartikel: () => listLagerartikel(),
  lagerFrei: () => lagerFrei(),
}));
vi.mock('@/lib/db/materialOrders', () => ({ listOpenOrders: vi.fn(async () => []) }));
vi.mock('@/lib/db/einkauf', () => ({ listLagerPosten: vi.fn(async () => []) }));

const { lager } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'u1', companyId: 'c1', role: 'Verwaltung' as const }, company: null, heute: '2026-10-10' };

beforeEach(() => {
  lagerKnapp.mockClear();
  listLagerartikel.mockClear();
  lagerFrei.mockClear();
});

describe('knappe Artikel der Startseite', () => {
  it('fragt die Datenbank nach den knappen, mit der Grenze der Lagerliste', async () => {
    const d = await lager(k, { posten: false, bestand: true });
    expect(lagerKnapp).toHaveBeenCalledWith(5);
    expect(d.knapp).toEqual(KNAPP);
  });

  it('holt dafür weder die Lagerartikel noch ihr Freies in den Browser', async () => {
    await lager(k, { posten: false, bestand: true });
    expect(listLagerartikel).not.toHaveBeenCalled();
    expect(lagerFrei).not.toHaveBeenCalled();
  });

  it('fragt ohne Bestand nichts', async () => {
    const d = await lager(k, { posten: false, bestand: false });
    expect(d.knapp).toBeUndefined();
    expect(lagerKnapp).not.toHaveBeenCalled();
  });
});
