// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ABLAGE_SUCHE_AB, ablageTreffer, ablageZuLesen, ablageZuMerken } from '@/features/assignments/ablage';

const B = [
  { customerName: 'Familie Huber', projectNumber: 'B-2026-0147', bezeichnung: 'Bad' },
  { customerName: 'Familie Huber', projectNumber: 'B-2026-0150', bezeichnung: 'Heizung' },
  { customerName: 'Bäckerei Hofer GmbH', projectNumber: 'B-2026-0161', bezeichnung: undefined },
];

describe('Noch einzuplanen: Suche (E96)', () => {
  it('jedes Wort muss in Kunde, Nummer oder Kurzbezeichnung stehen, gleich in welcher Schreibung', () => {
    expect(ablageTreffer(B, 'huber').map((p) => p.projectNumber)).toEqual(['B-2026-0147', 'B-2026-0150']);
    expect(ablageTreffer(B, 'hub BAD').map((p) => p.projectNumber)).toEqual(['B-2026-0147']);
    expect(ablageTreffer(B, '0161').map((p) => p.customerName)).toEqual(['Bäckerei Hofer GmbH']);
    expect(ablageTreffer(B, 'bäckerei')).toHaveLength(1);
    expect(ablageTreffer(B, 'gibt es nicht')).toEqual([]);
  });

  it('gleich geblieben: ohne Eingabe alle, in derselben Reihenfolge', () => {
    expect(ablageTreffer(B, '')).toEqual(B);
    expect(ablageTreffer(B, '   ')).toEqual(B);
  });

  it('das Suchfeld kommt ab neun Baustellen', () => {
    expect(ABLAGE_SUCHE_AB).toBe(9);
  });
});

describe('Noch einzuplanen: eingeklappt bleibt eingeklappt, je Person', () => {
  afterEach(() => window.localStorage.clear());

  it('gemerkt für die Person, nicht für die nächste am selben Gerät', () => {
    expect(ablageZuLesen('u1')).toBe(false);
    ablageZuMerken('u1', true);
    expect(ablageZuLesen('u1')).toBe(true);
    expect(ablageZuLesen('u2')).toBe(false);
    ablageZuMerken('u1', false);
    expect(ablageZuLesen('u1')).toBe(false);
  });
});
