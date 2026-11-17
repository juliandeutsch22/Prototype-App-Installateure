import { describe, expect, it } from 'vitest';
import { randTempo, rollSchritt, ROLL_MAX, ROLL_RAND } from '@/features/assignments/mitrollen';

/*
  E96: beim Ziehen rollt das Raster (und die Seite), wenn der Zeiger am Rand
  steht. Gegenprobe: vor E96 gab es kein Mitrollen — `useZiehen` rollte nie;
  ob es im Browser wirklich rollt, prüft `tests/links/bewegungen.spec.ts`
  („E96 Mitrollen beim Ziehen“).
*/
describe('Mitrollen beim Ziehen', () => {
  it('ausserhalb des Rands steht es; am Rand und darüber hinaus rollt es am schnellsten', () => {
    expect(randTempo(ROLL_RAND)).toBe(0);
    expect(randTempo(200)).toBe(0);
    expect(randTempo(0)).toBe(ROLL_MAX);
    expect(randTempo(-30)).toBe(ROLL_MAX);
    // Je näher am Rand, desto schneller — und nie unter 1 px, sobald es rollt.
    expect(randTempo(36)).toBeLessThan(randTempo(12));
    expect(randTempo(ROLL_RAND - 1)).toBe(1);
  });

  const aussen = { links: 0, oben: 0, rechts: 1000, unten: 600 };
  // Feste Namensspalte 200 px, fester Kopf 100 px: dort beginnt der Rand.
  const frei = { links: 200, oben: 100, rechts: 1000, unten: 600 };

  it('in der Mitte rollt nichts', () => {
    expect(rollSchritt(frei, aussen, 600, 350)).toEqual({ dx: 0, dy: 0 });
  });

  it('rechts und unten vorwärts, links und oben zurück — der Rand beginnt an Namensspalte und Kopf', () => {
    expect(rollSchritt(frei, aussen, 990, 350).dx).toBeGreaterThan(0);
    expect(rollSchritt(frei, aussen, 600, 590).dy).toBeGreaterThan(0);
    // Gleich neben der Namensspalte, nicht erst am linken Rand der Hülle.
    expect(rollSchritt(frei, aussen, 220, 350).dx).toBeLessThan(0);
    expect(rollSchritt(frei, aussen, 600, 110).dy).toBeLessThan(0);
    // Über der Namensspalte selbst: am schnellsten zurück.
    expect(rollSchritt(frei, aussen, 50, 350).dx).toBe(-ROLL_MAX);
  });

  it('gleich geblieben: ausserhalb der Fläche (über „Noch einzuplanen“) rollt sie nicht', () => {
    expect(rollSchritt(frei, aussen, 1100, 350)).toEqual({ dx: 0, dy: 0 });
    expect(rollSchritt(frei, aussen, 600, 700)).toEqual({ dx: 0, dy: 0 });
  });
});
