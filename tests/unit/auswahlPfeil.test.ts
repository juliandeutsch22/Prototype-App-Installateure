import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * DER PFEIL DER AUSWAHL WIE DAS KALENDERZEICHEN (Auftrag 04.11.2026: „bei
 * Dropdowns ist der Pfeil zu nah am Rand, er sollte in etwa gleich sein wie
 * der Kalender bei der Datumsauswahl“). Die Lage misst
 * `tests/durchklick/listenLuft.spec.ts` im Browser; hier steht, dass die
 * Regel für jedes einzeilige Auswahlfeld gilt und der Pfeil in hell und
 * dunkel die Farbe des Texts trägt.
 */
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

describe('Der Pfeil im Auswahlfeld', () => {
  it('zeichnet die App selbst, 12 px breit, mit der Mitte 22 px vom Rand und Platz für den Text', () => {
    const regel = css.match(/select:not\(\[multiple\]\):not\(\[size\]\) \{([^}]*)\}/)?.[1] ?? '';
    expect(regel).toMatch(/appearance: none;/);
    expect(regel).toMatch(/background-image: var\(--auswahl-pfeil\);/);
    expect(regel).toMatch(/background-position: right 0\.9375rem center;/);
    expect(regel).toMatch(/background-size: 0\.75rem 0\.75rem;/);
    expect(regel).toMatch(/padding-right: 2\.5rem;/);
  });

  it('in der Farbe des Texts — hell wie dunkel', () => {
    const hell = css.match(/--text: (#[0-9a-f]{6});\n\s*\/\*[^*]*\*\/\n\s*--auswahl-pfeil: url\("([^"]+)"\);/);
    expect(hell).not.toBeNull();
    expect(hell![2]).toContain(`stroke='%23${hell![1].slice(1)}'`);
    const dunkel = css.match(/--text: (#[0-9a-f]{6});\n\s*--auswahl-pfeil: url\("([^"]+)"\);/);
    expect(dunkel).not.toBeNull();
    expect(dunkel![1]).not.toBe(hell![1]);
    expect(dunkel![2]).toContain(`stroke='%23${dunkel![1].slice(1)}'`);
  });

  it('Gegenprobe: ein Auswahlfeld mit mehreren Zeilen behält die Liste des Browsers', () => {
    expect(css).not.toMatch(/(^|\n)select \{[^}]*appearance: none/);
  });
});
