import { describe, expect, it } from 'vitest';
import { einpassen } from '@/components/unterschriftEinpassen';

/*
  Striche zwischen Feld und großem Blatt umrechnen: gleichmäßig (nichts
  verzerrt), mittig, mit Luft zum Rand — und ins Feld zurück nie größer.
*/
describe('einpassen', () => {
  const zug = [
    [
      { x: 100, y: 100 },
      { x: 700, y: 200 },
    ],
  ];

  it('passt eine breite Unterschrift aus dem Blatt ins Feld, ohne sie zu verzerren', () => {
    const [[a, b]] = einpassen(zug, { w: 300, h: 160 }, 1);
    // 600 × 100 → Breite begrenzt: (300 − 16) / 600
    const massstab = 284 / 600;
    expect(b.x - a.x).toBeCloseTo(600 * massstab);
    expect(b.y - a.y).toBeCloseTo(100 * massstab);
    expect(a.x).toBeCloseTo(8);
    expect(b.x).toBeCloseTo(292);
    // senkrecht mittig
    expect((a.y + b.y) / 2).toBeCloseTo(80);
  });

  it('bläst eine kleine Unterschrift beim Zurückpassen nicht auf', () => {
    const klein = [
      [
        { x: 10, y: 10 },
        { x: 60, y: 30 },
      ],
    ];
    const [[a, b]] = einpassen(klein, { w: 300, h: 160 }, 1);
    expect(b.x - a.x).toBeCloseTo(50);
    expect(b.y - a.y).toBeCloseTo(20);
  });

  it('vergrößert ins Blatt höchstens um das Verhältnis der Flächen', () => {
    const [[a, b]] = einpassen(zug.map((s) => s.map((p) => ({ x: p.x / 4, y: p.y / 4 }))), { w: 800, h: 300 }, 2);
    expect(b.x - a.x).toBeCloseTo(300);
  });

  it('lässt leere Striche in Ruhe und teilt bei einem Punkt nicht durch null', () => {
    expect(einpassen([], { w: 300, h: 160 }, 1)).toEqual([]);
    const [[p]] = einpassen([[{ x: 5, y: 5 }]], { w: 300, h: 160 }, 1);
    expect(p).toEqual({ x: 150, y: 80 });
  });
});
