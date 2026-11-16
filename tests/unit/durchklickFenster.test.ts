/**
 * WÄCHTER: SELBST GEÖFFNETE BROWSERFENSTER SCHLIESSEN SICH (16.11.2026).
 *
 * Jeder Weg im Durchklick, der `browser.newContext()` ruft, muss `test` aus
 * `tests/durchklick/grund.ts` holen — dort schließt eine Vorrichtung jedes
 * selbst geöffnete Fenster nach dem Weg. Mit `test` direkt aus Playwright
 * blieben sie bis zum Ende des Laufs offen (Abbrüche mit
 * `net::ERR_INSUFFICIENT_RESOURCES` in langen Läufen).
 *
 * Gegenprobe: am Stand davor holten 14 Dateien `test` aus
 * `@playwright/test` und öffneten trotzdem eigene Fenster — die Prüfung
 * nennt sie (rot).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ORDNER = join(__dirname, '..', 'durchklick');

/** `test` stammt aus `./grund`, nicht aus Playwright selbst. */
export function holtTestAusGrund(quelle: string): boolean {
  return /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*'\.\/grund'/.test(quelle)
    && !/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*'@playwright\/test'/.test(quelle);
}

describe('Durchklick: selbst geöffnete Fenster', () => {
  it('jede Datei mit browser.newContext() holt test aus ./grund', () => {
    const verstoesse = readdirSync(ORDNER)
      .filter((d) => d.endsWith('.spec.ts'))
      .filter((d) => {
        const q = readFileSync(join(ORDNER, d), 'utf8');
        return q.includes('browser.newContext(') && !holtTestAusGrund(q);
      });
    expect(verstoesse).toEqual([]);
  });

  it('Gegenprobe: test direkt aus Playwright fällt auf', () => {
    expect(holtTestAusGrund("import { test, expect } from '@playwright/test';")).toBe(false);
    expect(holtTestAusGrund("import { test, expect } from './grund';\nimport { type Page } from '@playwright/test';")).toBe(true);
  });

  it('die Vorrichtung schließt automatisch, ohne dass ein Weg sie nennt', () => {
    const grund = readFileSync(join(ORDNER, 'grund.ts'), 'utf8');
    expect(grund).toMatch(/\{\s*auto:\s*true\s*\}/);
    expect(grund).toMatch(/\.close\(\)/);
  });
});
