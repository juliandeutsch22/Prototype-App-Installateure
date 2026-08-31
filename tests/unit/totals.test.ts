import { describe, it, expect } from 'vitest';
import { calcTotals, cent, positionNetto, discountLabel } from '@/features/invoices/totals';

const pos = (netto: number) => ({ netto });

describe('Rundung auf Cent', () => {
  it('rundet kaufmaennisch', () => {
    expect(cent(10.005)).toBe(10.01);
    expect(cent(10.004)).toBe(10.0);
  });

  it('faengt die Ungenauigkeit von Gleitkommazahlen ab', () => {
    // 0.1 + 0.2 ist in Gleitkomma 0.30000000000000004. Ohne Epsilon rutschte
    // manche Position um einen Cent — und die Rechnung ginge nicht auf.
    expect(cent(0.1 + 0.2)).toBe(0.3);
    expect(positionNetto(3, 1.115)).toBe(3.35);
  });
});

describe('Rechnungssummen ohne Rabatt', () => {
  it('summiert die Positionen und rechnet die Steuer', () => {
    const t = calcTotals([pos(100), pos(50)], 0.2);
    expect(t.subtotalNetto).toBe(150);
    expect(t.discountAmount).toBe(0);
    expect(t.totalNetto).toBe(150);
    expect(t.totalVat).toBe(30);
    expect(t.totalBrutto).toBe(180);
  });

  it('kommt mit 0 % Umsatzsteuer zurecht (Reverse Charge)', () => {
    const t = calcTotals([pos(100)], 0);
    expect(t.totalVat).toBe(0);
    expect(t.totalBrutto).toBe(100);
  });
});

describe('Rabatt', () => {
  it('zieht einen Prozentsatz vom NETTO ab, nicht vom Brutto', () => {
    // Der Punkt: die Umsatzsteuer bemisst sich am tatsaechlich vereinbarten
    // Entgelt. Vom Brutto gerechnet stuende auf der Rechnung eine Steuer, die
    // nie geschuldet wurde.
    const t = calcTotals([pos(1000)], 0.2, { mode: 'percent', value: 10 });
    expect(t.subtotalNetto).toBe(1000);
    expect(t.discountAmount).toBe(100);
    expect(t.totalNetto).toBe(900);
    expect(t.totalVat).toBe(180);
    expect(t.totalBrutto).toBe(1080);
  });

  it('zieht einen festen Betrag ab', () => {
    const t = calcTotals([pos(500)], 0.2, { mode: 'amount', value: 50 });
    expect(t.totalNetto).toBe(450);
    expect(t.totalBrutto).toBe(540);
  });

  it('deckelt einen zu hohen Betrag auf die Rechnungssumme', () => {
    // Ein Tippfehler darf keine Gutschrift erzeugen.
    const t = calcTotals([pos(100)], 0.2, { mode: 'amount', value: 999 });
    expect(t.discountAmount).toBe(100);
    expect(t.totalNetto).toBe(0);
    expect(t.totalBrutto).toBe(0);
  });

  it('deckelt einen Prozentsatz ueber 100', () => {
    const t = calcTotals([pos(100)], 0.2, { mode: 'percent', value: 150 });
    expect(t.discountAmount).toBe(100);
    expect(t.totalNetto).toBe(0);
  });

  it('ignoriert einen Rabatt von null oder negativ', () => {
    expect(calcTotals([pos(100)], 0.2, { mode: 'percent', value: 0 }).discountAmount).toBe(0);
    expect(calcTotals([pos(100)], 0.2, { mode: 'amount', value: -5 }).discountAmount).toBe(0);
  });

  it('rundet den Abzug auf Cent', () => {
    const t = calcTotals([pos(333.33)], 0.2, { mode: 'percent', value: 7.5 });
    expect(t.discountAmount).toBe(25);
    expect(t.totalNetto).toBe(308.33);
  });
});

describe('Beschriftung der Rabattzeile', () => {
  it('nennt den Prozentsatz mit', () => {
    expect(discountLabel({ mode: 'percent', value: 5 })).toBe('Rabatt 5 %');
    expect(discountLabel({ mode: 'percent', value: 7.5, label: 'Stammkunde' })).toBe(
      'Stammkunde 7,5 %',
    );
  });

  it('nennt beim Festbetrag nur den Namen — der Betrag steht daneben', () => {
    expect(discountLabel({ mode: 'amount', value: 50 })).toBe('Rabatt');
    expect(discountLabel({ mode: 'amount', value: 50, label: 'Nachlass' })).toBe('Nachlass');
  });
});
