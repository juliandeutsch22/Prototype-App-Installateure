/**
 * Was der Abschluss-Dialog über eine Anforderung sagt.
 *
 * Prüflauf 24.09.2026, F15/L5: bei einer bestellten, aber noch nicht
 * gelieferten Einkaufszeile sagte er „vom Lagerbestand abgezogen" — die
 * Datenbank bucht aber Eingang und Abgang zugleich, der Bestand bleibt, und
 * die Lieferung verschwindet aus der Einkaufsliste.
 */
import { describe, it, expect } from 'vitest';
import { abschlussText } from '@/features/orders/abschlussText';

const basis = { materialName: 'Eckventil', quantity: 5 };

describe('abschlussText', () => {
  it('aus dem Lager: wird abgezogen', () => {
    expect(abschlussText({ ...basis, beschaffung: 'lager' })).toBe(
      '„Eckventil" ×5 wird als erledigt gebucht und vom Lagerbestand abgezogen.',
    );
  });

  it('eingekauft und geliefert: wird abgezogen — der Eingang ist schon gebucht', () => {
    expect(abschlussText({ ...basis, beschaffung: 'einkauf', geliefertAm: 1 })).toMatch(
      /vom Lagerbestand abgezogen/,
    );
  });

  it('bestellt, aber nicht geliefert: sagt, dass die Lieferung aus der Einkaufsliste fällt', () => {
    const t = abschlussText({ ...basis, beschaffung: 'einkauf', geliefertAm: null });
    expect(t).toMatch(/noch nicht als geliefert gebucht/);
    expect(t).toMatch(/verschwindet aus der Einkaufsliste, der Lagerbestand bleibt gleich/);
    expect(t).not.toMatch(/abgezogen/);
  });
});
