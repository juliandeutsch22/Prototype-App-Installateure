import { describe, it, expect } from 'vitest';
import { SYMBOLE } from '@/components/naviSymbole';
import { NAV } from '@/app/navigation';

/**
 * Die Menü-Symbole stehen in einem Rahmen (E72, 09.11.2026).
 *
 * In der Leiste wirkten einzelne Symbole größer oder kleiner, weil sie über
 * das Feld 2,5–13,5 hinausragten oder höher und tiefer saßen. Gemessen wird
 * hier die Hülle aller Stütz- und Endpunkte eines Pfads — sie umschließt die
 * gezeichnete Linie immer, ragt also eher zu weit als zu kurz.
 */

type Hülle = { x0: number; x1: number; y0: number; y1: number };

function hülle(d: string): Hülle {
  const teile = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const h: Hülle = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  const punkt = (x: number, y: number) => {
    h.x0 = Math.min(h.x0, x); h.x1 = Math.max(h.x1, x);
    h.y0 = Math.min(h.y0, y); h.y1 = Math.max(h.y1, y);
  };
  let i = 0;
  let befehl = '';
  let x = 0;
  let y = 0;
  const zahl = () => Number(teile[i++]);
  while (i < teile.length) {
    if (/[A-Za-z]/.test(teile[i])) befehl = teile[i++];
    // Nur absolute Befehle: relative Pfade ließen die Hülle hier nicht prüfen.
    expect(befehl, d).toMatch(/^[MLHVCSQAZ]$/);
    switch (befehl) {
      case 'M': case 'L': x = zahl(); y = zahl(); punkt(x, y); break;
      case 'H': x = zahl(); punkt(x, y); break;
      case 'V': y = zahl(); punkt(x, y); break;
      case 'C': for (let k = 0; k < 3; k++) { x = zahl(); y = zahl(); punkt(x, y); } break;
      case 'S': case 'Q': for (let k = 0; k < 2; k++) { x = zahl(); y = zahl(); punkt(x, y); } break;
      case 'A': {
        // Die Symbole zeichnen Kreise als einen Bogen vom obersten Punkt fast ganz herum.
        const r = zahl(); zahl(); zahl(); zahl(); zahl();
        const sx = x; const sy = y;
        x = zahl(); y = zahl();
        punkt(sx - r, sy); punkt(sx + r, sy + 2 * r);
        break;
      }
      case 'Z': break;
    }
  }
  return h;
}

describe('Die Menü-Symbole', () => {
  it.each(Object.entries(SYMBOLE))('%s bleibt im Feld 2,5–13,5 und steht in der Mitte', (_, d) => {
    const h = hülle(d);
    expect(h.x0).toBeGreaterThanOrEqual(2.5);
    expect(h.y0).toBeGreaterThanOrEqual(2.5);
    expect(h.x1).toBeLessThanOrEqual(13.5);
    expect(h.y1).toBeLessThanOrEqual(13.5);
    expect(Math.abs((h.x0 + h.x1) / 2 - 8)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((h.y0 + h.y1) / 2 - 8)).toBeLessThanOrEqual(0.75);
  });

  it('jedes Ziel der Navigation hat ein eigenes Symbol der Linie', () => {
    expect(NAV.map((n) => n.path).filter((p) => !SYMBOLE[p])).toEqual([]);
  });

  it('Baustelle und Kunde, Team und Konto sind auseinanderzuhalten', () => {
    expect(SYMBOLE['/admin-projects']).not.toBe(SYMBOLE['/customers']);
    expect(SYMBOLE['/accounting']).not.toBe(SYMBOLE['/user-mgmt']);
  });

  it('gleich geblieben: dieselben Ziele teilen dasselbe Symbol', () => {
    expect(SYMBOLE['/my-projects']).toBe(SYMBOLE['/admin-projects']);
    expect(SYMBOLE['/my-schedule']).toBe(SYMBOLE['/assignments']);
    expect(SYMBOLE['/sonderurlaub']).toBe(SYMBOLE['/vacations']);
  });
});
