/**
 * Die Einkaufsliste — zusammenfassen, gruppieren, als Text und als Mail.
 *
 * WAS HIER NICHT SCHIEFGEHEN DARF: eine Zeile, die doppelt oder gar nicht
 * beim Grosshändler ankommt. Doppelt heisst zu viel Ware im Keller, gar
 * nicht heisst ein Monteur, der auf etwas wartet, das niemand bestellt hat.
 */
import { describe, it, expect } from 'vitest';
import type { MaterialOrder } from '@/types';
import type { WithId } from '@/lib/db/core';
import { bestellMail, bestellText, einkaufsliste, MAILTO_GRENZE } from '@/features/orders/einkauf';

let n = 0;
function a(rest: Partial<MaterialOrder>): WithId<MaterialOrder> {
  n += 1;
  return {
    id: `o${n}`, companyId: 'perl', materialId: '', materialName: 'Eckventil 1/2', quantity: 1,
    status: 'In Bearbeitung', transactionType: 'order', userId: 'u1', userName: 'Manfred',
    beschaffung: 'einkauf', supplierId: 'holter',
    ...rest,
  } as WithId<MaterialOrder>;
}

const KATALOG = new Map([['m1', { articleNumber: 'EV-12', unit: 'Stk' }]]);

describe('Zusammenfassen', () => {
  it('fasst denselben Artikel zu EINER Zeile zusammen — mit allen Kommissionen', () => {
    const [g] = einkaufsliste(
      [
        a({ materialId: 'm1', quantity: 2, projectNumber: 'B-2' }),
        a({ materialId: 'm1', quantity: 4, projectNumber: 'B-1' }),
        a({ materialId: 'm1', quantity: 1, projectNumber: 'B-1' }),
      ],
      KATALOG,
    );
    expect(g.zuBestellen).toHaveLength(1);
    expect(g.zuBestellen[0]).toMatchObject({
      menge: 7, artikelnummer: 'EV-12', einheit: 'Stk', kommissionen: ['B-1', 'B-2'],
    });
    expect(g.zuBestellen[0].anforderungen).toHaveLength(3);
  });

  it('fasst freie Anforderungen ohne Katalog über den Namen zusammen', () => {
    const [g] = einkaufsliste(
      [a({ materialName: 'Hanf ' }), a({ materialName: 'hanf' })],
      new Map(),
    );
    expect(g.zuBestellen).toHaveLength(1);
    expect(g.zuBestellen[0].menge).toBe(2);
  });

  it('rechnet Kommazahlen ohne Rundungsrest zusammen', () => {
    const [g] = einkaufsliste(
      [a({ materialId: 'm1', quantity: 0.1 }), a({ materialId: 'm1', quantity: 0.2 })],
      KATALOG,
    );
    expect(g.zuBestellen[0].menge).toBe(0.3);
  });
});

describe('Was auf die Liste gehört', () => {
  it('nur Einkauf, nicht geliefert, nicht erledigt, keine Retoure', () => {
    const gruppen = einkaufsliste(
      [
        a({ beschaffung: 'lager' }),
        a({ beschaffung: null }),
        a({ geliefertAm: 1 }),
        a({ status: 'Erledigt' }),
        a({ transactionType: 'return' }),
        a({ materialName: 'bleibt' }),
      ],
      new Map(),
    );
    expect(gruppen.flatMap((g) => g.zuBestellen.map((z) => z.bezeichnung))).toEqual(['bleibt']);
  });

  it('trennt Bestelltes von noch zu Bestellendem', () => {
    const [g] = einkaufsliste([a({ bestelltAm: 1 }), a({})], new Map());
    expect(g.zuBestellen).toHaveLength(1);
    expect(g.unterwegs).toHaveLength(1);
  });

  it('gruppiert je Grosshändler — ohne Grosshändler zuletzt', () => {
    const gruppen = einkaufsliste(
      [a({ supplierId: null }), a({ supplierId: 'holter' }), a({ supplierId: 'frauenthal' })],
      new Map(),
    );
    expect(gruppen.map((g) => g.supplierId)).toEqual(['holter', 'frauenthal', null]);
  });
});

describe('Text und Mail', () => {
  const zeilen = einkaufsliste([a({ materialId: 'm1', quantity: 6, projectNumber: 'B-1' })], KATALOG)[0].zuBestellen;

  it('nennt Menge, Einheit, Artikelnummer, Kommission und Kundennummer', () => {
    const t = bestellText({
      company: { name: 'Perl Installationen', addressLine: 'Gasse 1 · 2700 WN', contactLine: '0664 1' },
      kundennummer: '4711', zeilen, datum: '24.09.2026', besteller: 'Petra Perl',
    });
    expect(t).toContain('Kundennummer 4711');
    expect(t).toContain('- 6 Stk × Art.-Nr. EV-12 – Eckventil 1/2 (Kommission B-1)');
    expect(t).toContain('Petra Perl');
    expect(t).not.toMatch(/\n\n\n/);
  });

  it('öffnet das Mailprogramm mit Empfänger, Betreff und Text', () => {
    const { href, gekuerzt } = bestellMail({ an: 'vertreter@holter.at', betreff: 'Bestellung', text: 'Zeile' });
    expect(gekuerzt).toBe(false);
    expect(href.startsWith('mailto:vertreter@holter.at?subject=Bestellung&body=Zeile')).toBe(true);
  });

  it('schickt eine zu lange Liste nicht abgeschnitten, sondern verweist aufs PDF', () => {
    const lang = 'x'.repeat(MAILTO_GRENZE);
    const { href, gekuerzt } = bestellMail({ an: 'v@h.at', betreff: 'B', text: lang });
    expect(gekuerzt).toBe(true);
    expect(href.length).toBeLessThan(MAILTO_GRENZE);
    expect(decodeURIComponent(href)).toContain('im Anhang');
  });
});
