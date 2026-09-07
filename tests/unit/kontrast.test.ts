import { describe, it, expect } from 'vitest';
import { hexZuRgb, kontrast, urteil, AA_NORMAL } from '@/lib/kontrast';

/**
 * Die Kontrastprüfung hinter den Markenfarben.
 *
 * Zwei Werte wirken über die ganze Oberfläche: `--brand` trägt jeden
 * Hauptknopf, `--accent` jede Hervorhebung. Eine unglückliche Kombination
 * macht Text unlesbar — und zwar nicht für den, der sie aussucht, sondern für
 * den Monteur im Keller bei schlechtem Licht.
 */

describe('Farben lesen', () => {
  it('versteht die kurze und die lange Schreibweise', () => {
    expect(hexZuRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexZuRgb('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexZuRgb('003366')).toEqual([0, 51, 102]);
  });

  it('lehnt ab, was keine Farbe ist', () => {
    // Ein stillschweigendes Schwarz wäre schlimmer: die Prüfung meldete dann
    // „gut lesbar" für eine Eingabe, die gar keine Farbe ist.
    expect(hexZuRgb('rot')).toBeNull();
    expect(hexZuRgb('#12345')).toBeNull();
    expect(hexZuRgb('')).toBeNull();
  });
});

describe('Kontrast rechnen', () => {
  it('Schwarz auf Weiss ist das Höchste: 21:1', () => {
    expect(kontrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('dieselbe Farbe ergibt 1:1', () => {
    expect(kontrast('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('ist symmetrisch — die Reihenfolge ändert nichts', () => {
    expect(kontrast('#003366', '#ffffff')).toBeCloseTo(kontrast('#ffffff', '#003366')!, 10);
  });

  it('gewichtet die Kanäle wie das Auge, nicht gleich', () => {
    /*
      Reines Grün ist für das Auge deutlich heller als reines Blau. Ein
      Mittelwert der Kanäle sähe beide gleich und liesse damit weisse Schrift
      auf Grün durchgehen, die niemand lesen kann.
    */
    const aufGruen = kontrast('#00ff00', '#ffffff')!;
    const aufBlau = kontrast('#0000ff', '#ffffff')!;
    expect(aufGruen).toBeLessThan(aufBlau);
    expect(aufGruen).toBeLessThan(AA_NORMAL);
  });
});

describe('Das Urteil für die Oberfläche', () => {
  it('lässt eine lesbare Kombination durch', () => {
    const u = urteil('#003366', '#ffffff');
    expect(u.reicht).toBe(true);
    expect(u.text).toContain('gut lesbar');
  });

  it('hält eine unlesbare auf und sagt, was fehlt', () => {
    // Gelb auf Weiss: sieht am Bildschirm des Aussuchenden noch irgendwie aus
    // und ist auf der Baustelle nicht zu entziffern.
    const u = urteil('#ffee00', '#ffffff');
    expect(u.reicht).toBe(false);
    expect(u.text).toContain('4.5:1');
  });

  it('sagt bei Unsinn, dass es keine Farbe ist — statt „gut lesbar"', () => {
    const u = urteil('blau', '#ffffff');
    expect(u.reicht).toBe(false);
    expect(u.verhaeltnis).toBeNull();
  });

  it('zieht die Grenze genau bei 4,5', () => {
    // #767676 auf Weiss ist der bekannte Grenzfall aus WCAG.
    expect(kontrast('#767676', '#ffffff')!).toBeGreaterThanOrEqual(4.5);
    expect(kontrast('#777777', '#ffffff')!).toBeLessThan(4.5);
  });
});
