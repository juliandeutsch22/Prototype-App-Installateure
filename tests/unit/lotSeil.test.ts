import { describe, it, expect } from 'vitest';
import { fahrtDauer, nachfedern, seilVerlauf } from '@/lib/lotSeil';

/**
 * Die Fahrt des Lots in der Seitenleiste (E38, Auftrag 03.11.2026): Dauer
 * nach Strecke, herab mit kurzem Nachfedern, herauf ohne Überschwingen.
 */
describe('Dauer nach Strecke', () => {
  it('der Nachbarpunkt in etwa 200 ms, ganz nach unten höchstens 450 ms', () => {
    expect(fahrtDauer(40)).toBe(200);
    expect(fahrtDauer(-40)).toBe(200);
    expect(fahrtDauer(200)).toBe(310);
    expect(fahrtDauer(900)).toBe(450);
    // Nie unter 200 ms, auch für einen Schritt von einem Pixel.
    expect(fahrtDauer(1)).toBe(200);
  });
});

describe('Verlauf der Seillänge', () => {
  it('herab: weich gebremst, dann bis zu 3 px ins Seil und zurück', () => {
    const v = seilVerlauf(20, 220);
    expect(v.map((s) => s.laenge)).toEqual([20, 223, 220]);
    expect(v[1].offset).toBe(0.8);
    expect(nachfedern(200)).toBe(3);
    // Kurzer Weg, kleines Nachfedern.
    expect(nachfedern(16)).toBe(2);
  });

  it('herauf: eingeholt ohne Überschwingen — nur Anfang und Ziel', () => {
    const v = seilVerlauf(220, 20);
    expect(v.map((s) => s.laenge)).toEqual([220, 20]);
    expect(nachfedern(-200)).toBe(0);
  });

  it('kein Schritt geht über das Ziel hinaus nach oben', () => {
    for (const [von, nach] of [[0, 300], [300, 0], [100, 140], [140, 100]]) {
      const tiefst = Math.min(...seilVerlauf(von, nach).map((s) => s.laenge));
      expect(tiefst).toBeGreaterThanOrEqual(Math.min(von, nach));
    }
  });
});
