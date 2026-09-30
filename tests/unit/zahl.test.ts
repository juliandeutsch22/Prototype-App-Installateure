/**
 * Testbericht 30.09.2026, M15 — eine Zahleneingabe für alle Beträge und Mengen.
 * „7.500,50“ ergab im Angebot kommentarlos 0,00 €.
 */
import { describe, it, expect } from 'vitest';
import { leseZahl, preisAlsText, zahlAlsText, zahlOder } from '@/lib/zahl';

describe('leseZahl', () => {
  it.each([
    ['7.500,50', 7500.5],
    ['7500,50', 7500.5],
    ['7500.50', 7500.5],
    ['7,500.50', 7500.5],
    ['7.500.000', 7500000],
    ['7 500,50', 7500.5],
    ["7'500.50", 7500.5],
    ['0,5', 0.5],
    [',5', 0.5],
    ['12', 12],
    ['€ 12,40', 12.4],
    ['0.500', 0.5],
  ])('liest „%s“ als %s', (text, zahl) => {
    expect(leseZahl(text)).toEqual({ wert: zahl, fehler: null });
  });

  it('meldet uneindeutige Eingaben, statt 0 zu setzen', () => {
    expect(leseZahl('7.500').fehler).toMatch(/nicht eindeutig/);
    expect(leseZahl('7,500').fehler).toMatch(/nicht eindeutig/);
    expect(leseZahl('7.500').wert).toBeNull();
  });

  it('meldet Unsinn und falsche Gruppen', () => {
    expect(leseZahl('abc').fehler).toMatch(/keine Zahl/);
    expect(leseZahl('7.50.0,1').fehler).not.toBeNull();
    expect(leseZahl('1,2,3').fehler).not.toBeNull();
  });

  it('leer ist weder Zahl noch Fehler', () => {
    expect(leseZahl('')).toEqual({ wert: null, fehler: null });
    expect(leseZahl('  ')).toEqual({ wert: null, fehler: null });
  });

  it('negativ nur, wo vorgesehen', () => {
    expect(leseZahl('-5').fehler).not.toBeNull();
    expect(leseZahl('-5,5', { negativ: true }).wert).toBe(-5.5);
  });

  it('Kurzformen', () => {
    expect(zahlOder('7.500', 0)).toBe(0);
    expect(zahlOder('7.500,00', 0)).toBe(7500);
    expect(zahlAlsText(7500.5)).toBe('7500,5');
    expect(zahlAlsText(null)).toBe('');
  });

  it('was ins Feld zurückgeschrieben wird, liest sich wieder als dieselbe Zahl', () => {
    // Drei Nachkommastellen wären sonst „uneindeutig“ — ein Feld, das seinen eigenen Wert abweist.
    for (const n of [1.125, 7500.5, 0.001, -2.375, 40, 8.33]) {
      expect(leseZahl(zahlAlsText(n), { negativ: true })).toEqual({ wert: n, fehler: null });
    }
    expect(zahlAlsText(1.125)).toBe('1,1250');
  });
});

// Testbericht 30.09.2026, G8 — Preise mit zwei Nachkommastellen.
describe('preisAlsText', () => {
  it('„4,20“ statt „4,2“, und ganze Euro mit „,00“', () => {
    expect(preisAlsText(4.2)).toBe('4,20');
    expect(preisAlsText(12)).toBe('12,00');
  });

  it('behält mehr Stellen, wo der Katalog sie hat — und liest sich zurück', () => {
    expect(preisAlsText(0.125)).toBe('0,1250');
    expect(leseZahl(preisAlsText(0.125)).wert).toBe(0.125);
    expect(leseZahl(preisAlsText(1234.5)).wert).toBe(1234.5);
  });

  it('Gegenprobe: nichts bleibt leer', () => {
    expect(preisAlsText(null)).toBe('');
    expect(preisAlsText(Number.NaN)).toBe('');
  });
});
