import { describe, it, expect } from 'vitest';
import {
  calcTotals, istPreiszeile, positionNetto, positionsRabattText, rabattAnteil, titelSummen, zeilenNetto,
  type InvoicePosition,
} from '@/features/invoices/totals';
import { recalc, type AssembledInvoice } from '@/features/invoices/assemble';
import { einheitspreisVorschau, pauschalVorschau } from '@/features/invoices/pauschale';
import { belegZeilen } from '@/lib/belegLayout';
import type { Quote } from '@/types';

/**
 * Angebote mit Titel, Text und Positionsrabatt (Testbericht 30.09.2026,
 * M18) — die Rechnung an einer Stelle, und dieselbe für Angebot, Rechnung und
 * Beleg. Jede Regel mit Gegenprobe.
 */

const pos = (label: string, qty: number, unitPrice: number, rabattProzent?: number): InvoicePosition => ({
  label, qty, unit: 'Stk', unitPrice, netto: positionNetto(qty, unitPrice, rabattProzent), ...(rabattProzent ? { rabattProzent } : {}),
});
const titel = (label: string): InvoicePosition => ({ art: 'titel', label, qty: 0, unit: '', unitPrice: 0, netto: 0 });
const text = (label: string): InvoicePosition => ({ art: 'text', label, qty: 0, unit: '', unitPrice: 0, netto: 0 });

describe('Der Positionsrabatt', () => {
  it('mindert das Netto der Zeile, der Einzelpreis bleibt', () => {
    expect(positionNetto(2, 100, 10)).toBe(180);
    expect(positionNetto(3, 33.33, 5)).toBe(94.99);
  });

  it('Gegenprobe: ohne, mit 0 oder mit 100 % kein Rabatt', () => {
    expect(positionNetto(2, 100)).toBe(200);
    expect(rabattAnteil(0)).toBeNull();
    expect(rabattAnteil(100)).toBeNull();
    expect(rabattAnteil(-5)).toBeNull();
    expect(rabattAnteil(12.5)).toBe(12.5);
  });

  it('steht als „abzüglich 12,5 % Rabatt“ da, ohne Rabatt gar nicht', () => {
    expect(positionsRabattText(12.5)).toBe('abzüglich 12,5 % Rabatt');
    expect(positionsRabattText(null)).toBeNull();
  });

  it('kommt vor dem Rabatt über die ganze Rechnung', () => {
    const t = calcTotals([pos('Heizkörper', 1, 1000, 10)], 0.2, { mode: 'percent', value: 5 });
    expect(t.subtotalNetto).toBe(900);
    expect(t.discountAmount).toBe(45);
    expect(t.totalNetto).toBe(855);
  });
});

describe('Titel und Text', () => {
  it('tragen kein Netto und zählen nie zur Summe — auch nicht mit einem versehentlichen Betrag', () => {
    expect(istPreiszeile(titel('Bad'))).toBe(false);
    expect(zeilenNetto({ ...titel('Bad'), qty: 2, unitPrice: 50 })).toBe(0);
    const t = calcTotals([{ ...titel('Bad'), netto: 999 }, pos('WC', 1, 300), text('Bauseits Strom')], 0.2);
    expect(t.subtotalNetto).toBe(300);
  });

  it('Gegenprobe: eine Zeile ohne Art ist eine Position', () => {
    expect(istPreiszeile({})).toBe(true);
    expect(zeilenNetto({ qty: 2, unitPrice: 50 })).toBe(100);
  });

  it('die Summe je Titel reicht bis zum nächsten Titel', () => {
    const liste = [titel('Bad'), pos('WC', 1, 300), pos('Waschtisch', 1, 200, 10), text('Fliesen bauseits'),
      titel('Heizraum'), pos('Therme', 1, 2500), pos('Ohne Titel geht nicht', 0, 0)];
    expect([...titelSummen(liste)]).toEqual([[0, 480], [4, 2500]]);
  });

  it('Positionen vor dem ersten Titel gehören zu keinem', () => {
    expect([...titelSummen([pos('Anfahrt', 1, 50), titel('Bad'), pos('WC', 1, 300)])]).toEqual([[1, 300]]);
  });

  it('recalc rechnet beim Ändern mit Rabatt und lässt Titel bei null', () => {
    const base = { positions: [], subtotalNetto: 0, discountAmount: 0, totalNetto: 0, totalVat: 0, totalBrutto: 0 } as unknown as AssembledInvoice;
    const r = recalc(base, [titel('Bad'), { ...pos('WC', 1, 300, 10), qty: 2 }], 0.2);
    expect(r.positions.map((p) => p.netto)).toEqual([0, 540]);
    expect(r.totalNetto).toBe(540);
  });
});

describe('Die Zeilen auf dem Beleg', () => {
  it('Titel fett über die Breite, Summe nach seiner letzten Position, Text ohne Beträge, Rabatt unter der Bezeichnung', () => {
    const z = belegZeilen([titel('Bad'), pos('Waschtisch', 1, 200, 10), text('Fliesen bauseits'), titel('Heizraum'), pos('Therme', 1, 2500)]);
    expect(z[0]).toEqual([{ content: 'Bad', colSpan: 5, styles: { fontStyle: 'bold' } }]);
    expect(z[1][0]).toBe('Waschtisch\nabzüglich 10 % Rabatt');
    expect(z[1][4]).toMatch(/180,00/);
    expect(z[2]).toEqual([{ content: 'Fliesen bauseits', colSpan: 5 }]);
    expect(z[3][0]).toMatchObject({ content: 'Summe Bad', colSpan: 4 });
    expect((z[3][1] as { content: string }).content).toMatch(/180,00/);
    expect(z[4][0]).toMatchObject({ content: 'Heizraum' });
    expect(z[6][0]).toMatchObject({ content: 'Summe Heizraum' });
    expect(z).toHaveLength(7);
  });

  it('Gegenprobe: ohne Titel und Rabatt dieselben fünf Spalten wie bisher', () => {
    expect(belegZeilen([pos('WC', 2, 150)])).toEqual([['WC', '2', 'Stk', expect.stringMatching(/150,00/), expect.stringMatching(/300,00/)]]);
  });

  it('ein Titel ohne Positionen bekommt keine Summenzeile', () => {
    expect(belegZeilen([titel('Leer'), text('nur Text')])).toHaveLength(2);
  });
});

describe('Die Rechnung aus dem Angebot', () => {
  const BELEGE = {
    positions: [], subtotalNetto: 0, discountAmount: 0, totalNetto: 0, totalVat: 0, totalBrutto: 0,
    linkedEntries: [], linkedOrders: [], linkedWorkSheets: [], leistung: null, materialOhnePreis: [], entries: [],
  } as unknown as AssembledInvoice;
  const angebot = {
    id: 'q', companyId: 'b', quoteNumber: 'AN-2026-0010', customerName: 'Huber', quoteDate: '2026-09-01',
    validUntil: '2026-10-01', status: 'Angenommen',
    positions: [titel('Bad'), pos('Waschtisch', 2, 200, 10), text('Fliesen bauseits')],
    subtotalNetto: 360, totalNetto: 360, totalVat: 72, totalBrutto: 432, vatRate: 0.2,
  } as unknown as Quote;

  it('Pauschale: Titel, Text und Rabatt gehen mit, die Summe stimmt', () => {
    const v = pauschalVorschau('einzel', BELEGE, angebot, 0.2);
    expect(v.positions.map((p) => p.art ?? 'position')).toEqual(['titel', 'position', 'text']);
    expect(v.positions[1].rabattProzent).toBe(10);
    expect(v.totalNetto).toBe(360);
  });

  it('Einheitspreis, Teilrechnung: Positionen auf null, Titel und Text bleiben', () => {
    const v = einheitspreisVorschau('teil', BELEGE, angebot, 0.2);
    expect(v.positions.map((p) => [p.art ?? 'position', p.qty])).toEqual([['titel', 0], ['position', 0], ['text', 0]]);
    expect(v.totalNetto).toBe(0);
    const voll = einheitspreisVorschau('einzel', BELEGE, angebot, 0.2);
    expect(voll.positions[1].netto).toBe(360);
  });

  it('Gegenprobe: ein älteres Angebot ergibt dieselben Zeilen wie bisher, ohne neue Felder', () => {
    const alt = { ...angebot, positions: [{ label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 300 }] } as Quote;
    expect(pauschalVorschau('einzel', BELEGE, alt, 0.2).positions).toEqual([{ label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 300 }]);
  });
});
