/**
 * E4 (15.11.2026): Gefahr deutlich vom Terrakotta absetzen — ein Vorschlag
 * auf der Musterseite, gemessen wie die Grundwerte (`lotGrundwerte.test.ts`),
 * in beiden Sätzen. Eingebaut wird erst nach dem Ansehen; bis dahin bleibt
 * `--danger` in `index.css`, wie es ist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { AA_NORMAL } from '@/lib/kontrast';
import { GEFAHR, farbabstand, messungen } from '@/features/muster/gefahrVorschlag';

describe.each(['hell', 'dunkel'] as const)('Vorschlag Gefahr, %ser Satz', (satz) => {
  const m = Object.fromEntries(messungen(satz).map((x) => [x.name, x]));

  it('der neue Ton trägt Text auf Blatt, Papier, Fläche 3 und in der Spalte „heute“ (AA)', () => {
    for (const name of ['Text auf Blatt', 'Text auf Papier', 'Text auf Fläche 3', 'Text in der Spalte „heute“']) {
      expect(m[name].neu, name).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('er liegt deutlich weiter vom Terrakotta weg als heute (ΔE ≥ 20, heute darunter)', () => {
    expect(m['Abstand zu Terrakotta'].alt).toBeLessThan(20);
    expect(m['Abstand zu Terrakotta'].neu).toBeGreaterThanOrEqual(20);
    expect(m['Abstand zur Warnung'].neu).toBeGreaterThan(m['Abstand zur Warnung'].alt);
  });
});

describe('E4 bleibt ein Vorschlag', () => {
  it('die Grundwerte sind unverändert: --danger hell #a5483b, dunkel #e08a7c', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toMatch(/--danger: #a5483b;/);
    expect(css).toMatch(/--danger: #e08a7c;/);
    expect(GEFAHR.hell.alt).toBe('#a5483b');
    expect(GEFAHR.dunkel.alt).toBe('#e08a7c');
  });

  it('Gegenprobe: der Abstand misst — gleiche Farben 0, Terrakotta gegen heutige Gefahr unter 10', () => {
    expect(farbabstand('#a85439', '#a85439')).toBe(0);
    expect(farbabstand('#a85439', '#a5483b')).toBeLessThan(10);
  });
});
