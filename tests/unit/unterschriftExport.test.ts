import { describe, it, expect } from 'vitest';
import {
  aufExportflaeche,
  EXPORT_BREITE,
  EXPORT_HOEHE,
  type Punkt,
} from '@/components/unterschriftExport';

/**
 * Die Unterschrift wird auf eine FESTE Fläche übertragen — im Verhältnis des
 * PDF-Felds (70 × 25 mm), gleichmäßig skaliert und mittig. Was hier steht,
 * hält fest, dass das Bild nicht mehr an der Größe der Anzeige hängt: auf
 * dem schmalen Telefon und im breiten Querformat-Blatt entsteht dasselbe.
 */

/** Ein Namenszug in CSS-Pixeln, wie er auf einem Telefon im Hochformat entsteht. */
const zug: Punkt[][] = [
  [
    { x: 20, y: 60 },
    { x: 45, y: 30 },
    { x: 70, y: 75 },
    { x: 95, y: 35 },
    { x: 130, y: 70 },
  ],
  [
    { x: 140, y: 40 },
    { x: 180, y: 52 },
  ],
];

/** Derselbe Zug auf einer dreimal so großen Fläche, an anderer Stelle. */
const imBlatt = zug.map((s) => s.map((p) => ({ x: p.x * 3 + 210, y: p.y * 3 + 40 })));

function rahmen(striche: Punkt[][]) {
  const alle = striche.flat();
  return {
    minX: Math.min(...alle.map((p) => p.x)),
    maxX: Math.max(...alle.map((p) => p.x)),
    minY: Math.min(...alle.map((p) => p.y)),
    maxY: Math.max(...alle.map((p) => p.y)),
  };
}

describe('Unterschrift auf der festen Exportfläche', () => {
  it('hat das Seitenverhältnis des PDF-Felds', () => {
    expect(EXPORT_BREITE).toBe(700);
    expect(EXPORT_HOEHE).toBe(250);
    expect(EXPORT_BREITE / EXPORT_HOEHE).toBeCloseTo(70 / 25);
  });

  it('ergibt dasselbe Bild, egal wie groß und wo gezeichnet wurde', () => {
    const klein = aufExportflaeche(zug);
    const gross = aufExportflaeche(imBlatt);
    klein.forEach((strich, i) =>
      strich.forEach((p, j) => {
        expect(gross[i][j].x).toBeCloseTo(p.x, 6);
        expect(gross[i][j].y).toBeCloseTo(p.y, 6);
      }),
    );
  });

  it('bleibt innerhalb der Fläche und steht mittig', () => {
    const r = rahmen(aufExportflaeche(zug));
    expect(r.minX).toBeGreaterThanOrEqual(0);
    expect(r.maxX).toBeLessThanOrEqual(EXPORT_BREITE);
    expect(r.minY).toBeGreaterThanOrEqual(0);
    expect(r.maxY).toBeLessThanOrEqual(EXPORT_HOEHE);
    expect((r.minX + r.maxX) / 2).toBeCloseTo(EXPORT_BREITE / 2, 6);
    expect((r.minY + r.maxY) / 2).toBeCloseTo(EXPORT_HOEHE / 2, 6);
  });

  it('verzerrt nicht — gleicher Maßstab in beide Richtungen', () => {
    const vorher = rahmen(zug);
    const nachher = rahmen(aufExportflaeche(zug));
    const sx = (nachher.maxX - nachher.minX) / (vorher.maxX - vorher.minX);
    const sy = (nachher.maxY - nachher.minY) / (vorher.maxY - vorher.minY);
    expect(sx).toBeCloseTo(sy, 6);
  });

  it('kommt mit einem einzelnen Punkt und mit gar nichts zurecht', () => {
    const punkt = aufExportflaeche([[{ x: 5, y: 5 }]]);
    expect(punkt[0][0].x).toBeCloseTo(EXPORT_BREITE / 2);
    expect(punkt[0][0].y).toBeCloseTo(EXPORT_HOEHE / 2);
    expect(aufExportflaeche([])).toEqual([]);
  });
});
