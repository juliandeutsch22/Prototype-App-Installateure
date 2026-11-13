import { describe, it, expect } from 'vitest';
import type { MaterialOrder } from '@/types';
import { zuletztAngefordert, ZULETZT_ANZAHL } from '@/features/orders/zuletztAngefordert';
import { abgeholtVorschlaege, abgeholtZeitraum } from '@/features/worksheets/abgeholtVorschlaege';

/** Zuletzt angefordert (C5) und Für diese Baustelle abgeholt (C2), E89. */

const TAG = 24 * 60 * 60 * 1000;
const JETZT = new Date(2026, 10, 13, 12).getTime();
const o = (p: Partial<MaterialOrder>) =>
  ({ id: 'x', companyId: 'perl', materialId: 'm1', materialName: 'Rohr', quantity: 1, status: 'Erledigt',
    transactionType: 'order', userId: 'u1', projectNumber: 'A', createdAt: JETZT - TAG, ...p }) as MaterialOrder;

describe('zuletztAngefordert', () => {
  it('mit Baustelle: nur deren Artikel, jeder einmal, die letzte Menge', () => {
    const r = zuletztAngefordert([
      o({ materialId: 'm1', quantity: 3, createdAt: JETZT - TAG }),
      o({ materialId: 'm1', quantity: 9, createdAt: JETZT - 3 * TAG }),
      o({ materialId: 'm2', createdAt: JETZT - 2 * TAG }),
      o({ materialId: 'm3', projectNumber: 'B' }),
    ], 'A', JETZT);
    expect(r.fuerBaustelle).toBe(true);
    expect(r.artikel.map((a) => [a.materialId, a.menge])).toEqual([['m1', 3], ['m2', 1]]);
  });

  it('für die Baustelle gibt es noch nichts: die letzten vier Wochen, Älteres nicht', () => {
    const r = zuletztAngefordert([
      o({ materialId: 'm1', projectNumber: 'B', createdAt: JETZT - 27 * TAG }),
      o({ materialId: 'm2', projectNumber: 'B', createdAt: JETZT - 29 * TAG }),
    ], 'A', JETZT);
    expect(r.fuerBaustelle).toBe(false);
    expect(r.artikel.map((a) => a.materialId)).toEqual(['m1']);
  });

  it(`höchstens ${ZULETZT_ANZAHL}; Retouren und frei getippte zählen nicht`, () => {
    const viele = Array.from({ length: 8 }, (_, i) => o({ materialId: `m${i}`, createdAt: JETZT - i * 1000 }));
    expect(zuletztAngefordert(viele, '', JETZT).artikel).toHaveLength(ZULETZT_ANZAHL);
    expect(zuletztAngefordert([o({ transactionType: 'return' }), o({ materialId: null })], '', JETZT).artikel).toEqual([]);
  });
});

describe('abgeholtVorschlaege', () => {
  it('zählt je Artikel zusammen, die jüngste Abholung zuerst; frei Angefordertes nach dem Namen', () => {
    const r = abgeholtVorschlaege([
      o({ materialId: 'm1', quantity: 2, erledigtAm: 10 }),
      o({ materialId: 'm1', quantity: 3, erledigtAm: 30 }),
      o({ materialId: null, materialName: 'Eckventil', quantity: 1, erledigtAm: 20, abgeholtHerkunft: 'haendler' }),
      o({ materialId: null, materialName: ' eckventil ', quantity: 1, erledigtAm: 5 }),
    ], []);
    expect(r.map((v) => [v.materialId, v.menge, v.zuletzt, v.vomHaendler])).toEqual([
      ['m1', 5, 30, false],
      [null, 2, 20, true],
    ]);
  });

  it('was auf dem Schein steht, nicht offene Anforderungen und Retouren auch nicht', () => {
    const r = abgeholtVorschlaege([
      o({ materialId: 'm1' }),
      o({ materialId: null, materialName: 'Hanf' }),
      o({ materialId: 'm2', status: 'Abholbereit' }),
      o({ materialId: 'm3', transactionType: 'return' }),
    ], [{ id: 'z', name: 'Rohr', menge: 1, materialId: 'm1' }, { id: 'y', name: 'HANF', menge: 1 }]);
    expect(r).toEqual([]);
  });

  it('der Zeitraum: vierzehn Kalendertage bis zum Ende des Scheintags, in Ortszeit', () => {
    const { abIso, bisIso } = abgeholtZeitraum('2026-11-13');
    expect(new Date(abIso)).toEqual(new Date(2026, 9, 31));
    expect(new Date(bisIso)).toEqual(new Date(2026, 10, 13, 23, 59, 59, 999));
  });
});
