/**
 * DIE KNAPPEN ARTIKEL DER STARTSEITE UNTER ALLEN LAGERARTIKELN (Analyse
 * 09.10.2026, „Nebenbei gefundene Lücken“).
 *
 * Bisher suchte die Startseite unter den ersten 1.000 Artikeln des Katalogs
 * (`listMaterials`) und fragte `lager_frei()` ohne Liste, das ebenfalls bei
 * 1.000 Zeilen endete. Mit einem eingespielten Großhandelskatalog fehlte ein
 * knapper Lagerartikel still. Jetzt: alle im Lager geführten Artikel
 * (`listLagerartikel`) und das Freie genau für sie.
 *
 * Gegenprobe: `listMaterials` liefert hier, wie die Datenbank, nur die ersten
 * 1.000 — der alte Weg fand den Artikel Nr. 1.100 nicht.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Material } from '@/types';

const LAGER: Array<Material & { id: string }> = Array.from({ length: 1200 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  name: `Artikel ${i}`,
  stock: 50,
  unit: 'Stk',
  lagerartikel: true,
})) as Array<Material & { id: string }>;
LAGER[1100] = { ...LAGER[1100], name: 'Knapp hinten', stock: 2 };
// Im Regal genug, aber fast alles zugesagt: knapp ist, was FREI ist.
LAGER[10] = { ...LAGER[10], name: 'Zugesagt', stock: 20 };

const gefragt: string[][] = [];
vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  listMaterials: vi.fn(async () => LAGER.slice(0, 1000)),
  listLagerartikel: vi.fn(async () => LAGER),
  lagerFrei: vi.fn(async (ids?: readonly string[]) => {
    gefragt.push([...(ids ?? [])]);
    const liste = ids ? LAGER.filter((m) => ids.includes(m.id)) : LAGER.slice(0, 1000);
    return new Map(liste.map((m) => {
      const zugesagt = m.name === 'Zugesagt' ? 17 : 0;
      return [m.id, { bestand: m.stock, zugesagt, geplant: 0, frei: m.stock - zugesagt }];
    }));
  }),
}));
vi.mock('@/lib/db/materialOrders', () => ({ listOpenOrders: vi.fn(async () => []) }));
vi.mock('@/lib/db/einkauf', () => ({ listLagerPosten: vi.fn(async () => []) }));

const { lager } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'u1', companyId: 'c1', role: 'Verwaltung' as const }, company: null, heute: '2026-10-10' };

beforeEach(() => { gefragt.length = 0; });

describe('knappe Artikel der Startseite', () => {
  it('findet einen knappen Artikel hinter den ersten 1.000 des Katalogs', async () => {
    const d = await lager(k, { posten: false, bestand: true });
    expect(d.knapp?.map((a) => a.name)).toContain('Knapp hinten');
  });

  it('rechnet mit dem Freien, nicht mit dem Regal — wie bisher', async () => {
    const d = await lager(k, { posten: false, bestand: true });
    expect(d.knapp?.find((a) => a.name === 'Zugesagt')?.frei).toBe(3);
    expect(d.knapp?.some((a) => a.name === 'Artikel 0')).toBe(false);
  });

  it('fragt das Freie genau für die Lagerartikel', async () => {
    await lager(k, { posten: false, bestand: true });
    expect(gefragt).toHaveLength(1);
    expect(gefragt[0]).toEqual(LAGER.map((m) => m.id));
  });

  it('fragt ohne Bestand nichts', async () => {
    const d = await lager(k, { posten: false, bestand: false });
    expect(d.knapp).toBeUndefined();
    expect(gefragt).toHaveLength(0);
  });
});
