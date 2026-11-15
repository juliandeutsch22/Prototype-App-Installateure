import { describe, expect, it } from 'vitest';
import { zahlAus } from '@/components/RollZahl';

/* B6: die Richtung des Rollens aus dem Anzeigetext (österreichische Schreibweise). */
describe('zahlAus', () => {
  it('liest Beträge, Stunden und Minuszeichen', () => {
    expect(zahlAus('€ 1.234,50')).toBe(1234.5);
    expect(zahlAus('−3,5 Std.')).toBe(-3.5);
    expect(zahlAus('+12:30')).toBe(750);
    expect(zahlAus('-0:15')).toBe(-15);
    expect(zahlAus('99+')).toBe(99);
    expect(zahlAus('Pauschal')).toBe(0);
  });
});
