/**
 * DIE KNAPPEN ARTIKEL DER STARTSEITE.
 *
 * Analyse 09.10.2026: die Startseite suchte unter den ersten 1.000 Artikeln
 * des Katalogs; mit einem eingespielten Großhandelskatalog fehlte ein knapper
 * Lagerartikel still. Danach holte sie alle Lagerartikel und ihr Freies.
 *
 * Ladezeit 19.10.2026: die Datenbank rechnet die Regel (`lager_knapp`, siehe
 * `tests/supabase/schmaleAbfragen.test.ts`).
 *
 * Durchsicht 15.11.2026 (Budget B3): `lager_knapp` gab jeden knappen Artikel
 * (gewachsener Bestand: 192), gezeigt werden drei. Jetzt fragt die Startseite
 * die Lagerliste (`lager_liste`, dieselbe Regel, `tests/supabase/lagerListe.test.ts`)
 * nach einem Abschnitt voll der dringendsten und der Zahl über alle, dazu dem
 * ersten nach dem Namen. Gegenprobe: mit dem Stand davor wird `lagerKnapp`
 * gerufen und `lagerListe` nicht (rot).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LagerListeFrage } from '@/lib/db/materials';

const zeile = (id: string, name: string, frei: number) =>
  ({ id, companyId: 'c1', name, unit: 'Stk', stock: frei, reserved: 0, geplant: 0, free: frei });
const lagerListe = vi.fn(async (f: LagerListeFrage) => ({
  zeilen: f.reihenfolge === 'name'
    ? [zeile('z', 'Abflussrohr', 4)]
    : [zeile('a', 'Knapp hinten', -2), zeile('b', 'Zugesagt', 3), zeile('c', 'Muffe', 4)].slice(0, f.anzahl),
  treffer: 192, imLager: 1600, knapp: 192, knappBestand: 150, fehlt: 6, reserviert: 0, warengruppen: [],
}));
const lagerKnapp = vi.fn(async () => []);
const listLagerartikel = vi.fn(async () => []);
const lagerFrei = vi.fn(async () => new Map());
vi.mock('@/lib/db/materials', () => ({
  LOW_STOCK_THRESHOLD: 5,
  lagerListe: (f: LagerListeFrage) => lagerListe(f),
  lagerKnapp: () => lagerKnapp(),
  listLagerartikel: () => listLagerartikel(),
  lagerFrei: () => lagerFrei(),
}));
vi.mock('@/lib/db/materialOrders', () => ({ listOpenOrders: vi.fn(async () => []) }));
vi.mock('@/lib/db/einkauf', () => ({ listLagerPosten: vi.fn(async () => []) }));

const { lager } = await import('@/features/dashboard/start/laden');
const k = { user: { uid: 'u1', companyId: 'c1', role: 'Verwaltung' as const }, company: null, heute: '2026-10-10' };

beforeEach(() => {
  lagerListe.mockClear();
  lagerKnapp.mockClear();
  listLagerartikel.mockClear();
  lagerFrei.mockClear();
});

describe('knappe Artikel der Startseite', () => {
  it('fragt die Datenbank nach den knappen, mit der Grenze der Lagerliste — nur einen Abschnitt voll und die Zahl', async () => {
    const d = await lager(k, { posten: false, bestand: true });
    expect(lagerListe).toHaveBeenCalledWith({ filter: 'knapp', reihenfolge: 'frei', anzahl: 3, grenze: 5 });
    expect(lagerListe).toHaveBeenCalledWith({ filter: 'knapp', reihenfolge: 'name', anzahl: 1, grenze: 5 });
    expect(d.knapp).toEqual({
      anzahl: 192,
      ersterNachName: 'Abflussrohr',
      zeilen: [
        { id: 'a', name: 'Knapp hinten', unit: 'Stk', mindestmenge: null, frei: -2 },
        { id: 'b', name: 'Zugesagt', unit: 'Stk', mindestmenge: null, frei: 3 },
        { id: 'c', name: 'Muffe', unit: 'Stk', mindestmenge: null, frei: 4 },
      ],
    });
  });

  it('holt dafür weder jeden knappen Artikel noch die Lagerartikel oder ihr Freies in den Browser', async () => {
    await lager(k, { posten: false, bestand: true });
    expect(lagerKnapp).not.toHaveBeenCalled();
    expect(listLagerartikel).not.toHaveBeenCalled();
    expect(lagerFrei).not.toHaveBeenCalled();
  });

  it('fragt ohne Bestand nichts', async () => {
    const d = await lager(k, { posten: false, bestand: false });
    expect(d.knapp).toBeUndefined();
    expect(lagerListe).not.toHaveBeenCalled();
  });
});
