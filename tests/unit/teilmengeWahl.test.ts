/**
 * M5/F5 (16.11.2026): was die Mengeneingabe bei „Abgeholt“ und „Aus Lager“
 * heißt — die ganze Menge (der Aufruf wie bisher), ein Teil, oder ein Fehler.
 */
import { describe, it, expect } from 'vitest';
import { abholTeil, teilwahl } from '@/features/orders/teilmengeWahl';

describe('teilwahl', () => {
  it('weniger als angefordert ist ein Teil — mit Komma wie geschrieben', () => {
    expect(teilwahl('6', 10)).toEqual({ art: 'teil', menge: 6 });
    expect(teilwahl('2,5', 10)).toEqual({ art: 'teil', menge: 2.5 });
  });

  it('Gleichbleiben: leer oder die ganze Menge ist „ganz“ — gebucht wird wie bisher', () => {
    expect(teilwahl('', 10)).toEqual({ art: 'ganz' });
    expect(teilwahl('10', 10)).toEqual({ art: 'ganz' });
  });

  it('null, mehr als angefordert und keine Zahl sind Fehler mit Grund', () => {
    expect(teilwahl('0', 10)).toMatchObject({ art: 'fehler', grund: /größer als null/ });
    expect(teilwahl('11', 10)).toMatchObject({ art: 'fehler', grund: /Höchstens die angeforderten 10/ });
    expect(teilwahl('abc', 10)).toMatchObject({ art: 'fehler' });
  });

  it('der Satz der Rückfrage nennt die Teilmenge', () => {
    expect(abholTeil({ quantity: 10 }, '6')).toEqual({ quantity: 6 });
    expect(abholTeil({ quantity: 10 }, '10')).toEqual({ quantity: 10 });
  });
});
