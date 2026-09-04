import { describe, it, expect } from 'vitest';
import { fmtStd } from '@/lib/time';

/**
 * Dezimalstunden in einer deutschsprachigen Oberfläche.
 *
 * AUFGEFALLEN AUF DER STARTSEITE: dort stand „39.5 von 40 h" — mit PUNKT.
 * Das Dashboard rechnete selbst und gab die Zahl roh aus; JavaScript schreibt
 * sie so. In der Projektauswertung stand dieselbe Zahl als „39,5 h".
 *
 * Kein Rechenfehler, aber zwei Schreibweisen für dieselbe Größe in derselben
 * App. Beide Ansichten rufen jetzt diese eine Funktion.
 */

describe('Dezimalstunden', () => {
  it('schreibt mit Komma, nicht mit Punkt', () => {
    expect(fmtStd(150)).toBe('2,5');
    expect(fmtStd(2370)).toBe('39,5');
  });

  it('zeigt auch bei glatten Werten eine Nachkommastelle', () => {
    // „40" neben „39,5" liest sich als Bruch in der Darstellung, „40,0"
    // als Reihe.
    expect(fmtStd(2400)).toBe('40,0');
    expect(fmtStd(0)).toBe('0,0');
  });

  it('rundet auf eine Stelle', () => {
    // 8:20 h = 8,333… → 8,3
    expect(fmtStd(500)).toBe('8,3');
  });
});
