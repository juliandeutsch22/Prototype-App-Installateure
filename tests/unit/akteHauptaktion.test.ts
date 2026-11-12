/** B5 (E83): die Hauptaktion der Baustellenakte folgt dem Stand. */
import { describe, it, expect } from 'vitest';
import { akteHauptaktion } from '@/features/projects/akteHauptaktion';

const alles = { darfPlanen: true, darfRechnen: true, darfSchein: true, hatEinsatz: true, offeneScheine: 0, abgeschlossen: false };

describe('akteHauptaktion', () => {
  it('ohne Einsatz: planen — auch vor offenen Scheinen', () => {
    expect(akteHauptaktion({ ...alles, hatEinsatz: false, offeneScheine: 2 })).toBe('planen');
  });
  it('mit offenen Scheinen: Rechnung', () => {
    expect(akteHauptaktion({ ...alles, offeneScheine: 1 })).toBe('rechnung');
  });
  it('sonst wie bisher: Schein', () => {
    expect(akteHauptaktion(alles)).toBe('schein');
  });
  it('nicht geladen ist nicht „keiner“', () => {
    expect(akteHauptaktion({ ...alles, hatEinsatz: null, offeneScheine: null })).toBe('schein');
  });
  it('abgeschlossen wird nicht mehr geplant', () => {
    expect(akteHauptaktion({ ...alles, hatEinsatz: false, abgeschlossen: true })).toBe('schein');
  });
  it('nur, was die Rolle darf', () => {
    expect(akteHauptaktion({ ...alles, darfPlanen: false, hatEinsatz: false })).toBe('schein');
    expect(akteHauptaktion({ ...alles, darfRechnen: false, offeneScheine: 3 })).toBe('schein');
    expect(akteHauptaktion({ ...alles, darfSchein: false })).toBeNull();
  });
});
