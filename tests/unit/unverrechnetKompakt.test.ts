import { describe, it, expect } from 'vitest';
import {
  AUFFAELLIG_AB_TAGEN,
  auffaelligBis,
  auffaellige,
  nichtVerrechnetJeBaustelle,
  unverrechnetZeilen,
} from '@/features/worksheets/unverrechnet';
import type { WorkSheet } from '@/types';

/*
  L22 (Messung gegen den gewachsenen Bestand): die Startseite und das
  Schriftfeld der Scheinliste bekommen nur noch die Zahl aus der Datenbank,
  die Rechnungen je Baustelle eine Zeile. Hier, was der Browser dazu
  beiträgt: der Stichtag für „über 4 Wochen“ und das Zählen der Gruppen.
*/

const kopf = (id: string, datum: string, nummer = '2026-001', anzahl?: number) =>
  ({ id, projectNumber: nummer, customerName: 'Huber', datum, abrechnung: 'Regie', ...(anzahl === undefined ? {} : { anzahl }) }) as
    Pick<WorkSheet, 'projectNumber' | 'customerName' | 'datum' | 'abrechnung'> & { id: string; anzahl?: number };

const tag = (iso: string, plus: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + plus * 86_400_000).toISOString().slice(0, 10);

describe('Der Stichtag für die Datenbank (`auffaelligBis`)', () => {
  it('ist heute minus vier Wochen', () => {
    expect(auffaelligBis('2026-11-15')).toBe('2026-10-18');
  });

  /*
    BLEIBT GLEICH: „über 4 Wochen“ zählt die Datenbank jetzt mit `datum <=
    Stichtag`. Für jeden Tag um die Grenze — auch über Sommerzeit und
    Jahreswechsel — sagt das dasselbe wie das Alter aus `unverrechnetZeilen`.
    Gegenprobe: mit einem Tag zu wenig (27) wäre der Schein von genau vor
    vier Wochen nicht mehr alt.
  */
  it('sagt für jeden Tag dasselbe wie das Alter aus `unverrechnetZeilen`', () => {
    for (const heute of ['2026-11-15', '2026-03-30', '2026-10-26', '2027-01-10', '2028-03-20']) {
      const bis = auffaelligBis(heute);
      for (let d = -AUFFAELLIG_AB_TAGEN - 3; d <= -AUFFAELLIG_AB_TAGEN + 3; d += 1) {
        const datum = tag(heute, d);
        const alt = auffaellige(unverrechnetZeilen([kopf('s', datum)], heute)).length === 1;
        expect(datum <= bis, `${heute} / ${datum}`).toBe(alt);
      }
    }
  });
});

describe('Je Baustelle zusammengefasst (`anzahl`)', () => {
  it('zählt die Scheine der Gruppen, nicht die Vertreter', () => {
    const zeilen = nichtVerrechnetJeBaustelle(
      unverrechnetZeilen([kopf('a', '2026-08-01', '2026-001', 3), kopf('b', '2026-09-01', '2026-009', 2)], '2026-09-08'),
      [],
    );
    expect(zeilen.map((b) => [b.projectNumber, b.anzahlScheine, b.scheine.length])).toEqual([['2026-001', 3, 1], ['2026-009', 2, 1]]);
  });

  it('zwei Schreibweisen derselben Baustelle werden eine Zeile — Zahlen addiert, gemessen am ältesten', () => {
    const zeilen = nichtVerrechnetJeBaustelle(
      unverrechnetZeilen([kopf('a', '2026-08-01', 'PR-2026-001', 3), kopf('b', '2026-07-01', '2026-001 ', 2)], '2026-09-08'),
      [],
    );
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ projectNumber: '2026-001 ', anzahlScheine: 5, aeltesterSchein: '2026-07-01', tage: 69 });
  });

  it('bleibt gleich: einzelne Scheine ohne `anzahl` zählen je einen, Stunden allein keinen', () => {
    const zeilen = nichtVerrechnetJeBaustelle(
      [{ schein: kopf('a', '2026-08-01'), tage: 38 }, { schein: kopf('b', '2026-08-02'), tage: 37 }],
      [{ stunden: { projectNumber: '2026-777', kunde: 'Maier', aeltester: '2026-08-10' }, tage: 29 }],
    );
    expect(zeilen.map((b) => [b.projectNumber, b.anzahlScheine])).toEqual([['2026-001', 2], ['2026-777', 0]]);
  });
});
