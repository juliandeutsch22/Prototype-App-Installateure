/**
 * Der Basiszinssatz, zentral gepflegt (Stand-Datei 11.1, Punkt 2).
 *
 * Zwei Zusagen: der zentrale Satz gewinnt je Halbjahr, und ohne zentrale
 * Sätze rechnet jeder Betrieb genau wie vorher.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { basiszinsVerlauf, verzugszinsen } from '@/features/invoices/mahnung';
import type { Company } from '@/types';

let zentral: Array<{ ab: string; satz: number }> = [];
let zentralFaellt = false;
vi.mock('@/lib/db/basiszins', () => ({
  listBasiszinssaetze: vi.fn(async () => {
    if (zentralFaellt) throw new Error('nicht erreichbar');
    return zentral;
  }),
}));

const { einstellungen } = await import('@/features/dashboard/start/laden');

const eigene = {
  basiszinssaetze: [{ ab: '2026-01-01', satz: 2 }, { ab: '2026-07-01', satz: 1.6 }],
};

describe('Basiszinssatz: zentral vor eigen', () => {
  it('nimmt je Halbjahr den zentralen Satz und füllt Lücken mit dem eigenen', () => {
    expect(basiszinsVerlauf(eigene, [{ ab: '2026-07-01', satz: 1.53 }, { ab: '2025-07-01', satz: 2.4 }])).toEqual([
      { ab: '2025-07-01', satz: 2.4 },
      { ab: '2026-01-01', satz: 2 },
      { ab: '2026-07-01', satz: 1.53 },
    ]);
  });

  it('Gegenprobe: ohne zentrale Sätze bleibt der Verlauf des Betriebs, wie er war', () => {
    expect(basiszinsVerlauf(eigene, [])).toEqual(basiszinsVerlauf(eigene));
    expect(basiszinsVerlauf(eigene, null)).toEqual(basiszinsVerlauf(eigene));
    expect(basiszinsVerlauf(eigene, undefined)).toEqual(eigene.basiszinssaetze);
  });

  it('übergeht zentrale Einträge, die keine Halbjahre sind', () => {
    expect(basiszinsVerlauf({}, [{ ab: '2026-03-01', satz: 9 }, { ab: '2026-07-01', satz: Number.NaN }])).toEqual([]);
  });

  it('rechnet Verzugszinsen mit dem zentralen Satz, auch wenn der Betrieb keinen hat', () => {
    const z = verzugszinsen({
      stufe: 2, rest: 1200, faellig: '2026-09-03', bis: '2026-10-03', unternehmer: true,
      zentral: [{ ab: '2026-07-01', satz: 1.53 }],
    });
    // 1.200 € × 10,73 % × 30/365 = 10,58 € — dieselbe Zahl wie mit dem eigenen Satz.
    expect(z).toEqual({ art: 'berechnet', satz: 10.73, tage: 30, betrag: 10.58, grundlage: '§ 456 UGB' });
  });

  it('der zentrale Satz verdrängt einen abweichenden eigenen im selben Halbjahr', () => {
    const z = verzugszinsen({
      stufe: 2, rest: 1200, faellig: '2026-09-03', bis: '2026-10-03', unternehmer: true,
      basiszinssaetze: [{ ab: '2026-07-01', satz: 5 }],
      zentral: [{ ab: '2026-07-01', satz: 1.53 }],
    });
    expect(z).toMatchObject({ art: 'berechnet', satz: 10.73 });
  });
});

describe('Startseite: Basiszinssatz fehlt', () => {
  const kontext = (rates: Company['rates'] | undefined) => ({
    user: { uid: 'u', companyId: 'perl', role: 'Buchhaltung' as const },
    company: { id: 'perl', name: 'Perl', rates } as unknown as Company,
    heute: '2026-10-05',
  });
  const nurRechnungen = { rechnungen: true, konten: false, personen: false };

  beforeEach(() => {
    zentral = [];
    zentralFaellt = false;
  });

  it('meldet nichts, wenn der Satz des Halbjahres zentral steht', async () => {
    zentral = [{ ab: '2026-07-01', satz: 1.53 }];
    const d = await einstellungen(kontext(undefined), nurRechnungen);
    expect(d.basiszinsFehltAb).toBeNull();
  });

  it('Gegenprobe: ohne zentralen und ohne eigenen Satz meldet sie das Halbjahr', async () => {
    const d = await einstellungen(kontext(undefined), nurRechnungen);
    expect(d.basiszinsFehltAb).toBe('2026-07-01');
  });

  it('kommt die zentrale Liste nicht, zählt der eigene Satz wie bisher', async () => {
    zentralFaellt = true;
    const mitEigenem = await einstellungen(kontext({ basiszinssaetze: [{ ab: '2026-07-01', satz: 1.53 }] } as Company['rates']), nurRechnungen);
    expect(mitEigenem.basiszinsFehltAb).toBeNull();
    const ohne = await einstellungen(kontext(undefined), nurRechnungen);
    expect(ohne.basiszinsFehltAb).toBe('2026-07-01');
  });
});
