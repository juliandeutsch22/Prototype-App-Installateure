import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EINE RUNDUNG FÜR GELD — und sie bleibt die einzige (Durchsicht 15.11.2026, G7).
 *
 * Vor der Umstellung rundeten sechs Dateien Geld je auf ihre Art:
 * `totals.ts` mit `EPSILON`, `skonto.ts`, `zahlstand.ts`, `mahnlauf.ts`,
 * `mahnung.ts` und `nachkalkulation.ts` mit eigenem `Math.round(n * 100) / 100`
 * — dazu `ruecklass.ts`, `aufschlag.ts` und ein Dutzend Stellen in der
 * Rechnungsansicht. Daher kamen 2,13 € Skonto in der App gegen 2,14 € in der
 * Datenbank. Diese Prüfung hält die Geldstellen bei `cent()`/`aufStellen()`
 * aus `@/lib/betrag`.
 *
 * Gegenprobe: vor der Umstellung meldet sie jede der genannten Stellen.
 */

/** Wo Geld gerechnet wird. */
const BEREICHE = [
  'src/features/invoices',
  'src/features/costing',
  'src/features/quotes',
  'src/lib/aufschlag.ts',
  'src/lib/belegLayout.ts',
  'src/features/dashboard/start/laden.ts',
];

/**
 * Die zwei Ausnahmen mit Grund: die Rundung selbst, und die Wiedergabe der
 * alten Rundung für Belege von vor der Umstellung (Altdaten, nicht neu
 * gerechnet).
 */
const AUSGENOMMEN = new Set(['src/lib/betrag.ts', 'src/features/invoices/rundungBisher.ts']);

/** Eigene Cent-Rundungen in ihren üblichen Formen. */
const MUSTER: [RegExp, string][] = [
  [/\*\s*100\s*\)\s*\/\s*100\b/, '… * 100) / 100'],
  [/Math\.round\([^;\n]*\)\s*\/\s*100\b/, 'Math.round(…) / 100'],
  [/Math\.round\([^;\n]*\*\s*100\)\s*[<>=!]/, 'Vergleich über Math.round(… * 100)'],
  [/Number\.EPSILON/, 'Number.EPSILON'],
];

function dateien(pfad: string): string[] {
  if (statSync(pfad).isFile()) return [pfad];
  return readdirSync(pfad).flatMap((n) => dateien(join(pfad, n)));
}

describe('Geld wird an genau einer Stelle gerundet', () => {
  const quellen = BEREICHE.flatMap(dateien)
    .filter((d) => /\.(ts|tsx)$/.test(d) && !AUSGENOMMEN.has(d));

  it('findet die Geldstellen überhaupt', () => {
    // Sonst prüfte die Liste unten still nichts, etwa nach einem Umzug.
    expect(quellen).toContain('src/features/invoices/totals.ts');
    expect(quellen).toContain('src/features/invoices/skonto.ts');
    expect(quellen).toContain('src/features/costing/nachkalkulation.ts');
    expect(quellen.length).toBeGreaterThan(40);
  });

  it('keine Geldstelle rundet selbst', () => {
    const funde: string[] = [];
    for (const d of quellen) {
      readFileSync(d, 'utf8').split('\n').forEach((zeile, i) => {
        for (const [muster, name] of MUSTER) {
          if (muster.test(zeile)) funde.push(`${d}:${i + 1} (${name}): ${zeile.trim()}`);
        }
      });
    }
    expect(funde).toEqual([]);
  });

  it('kein Modul definiert sich ein eigenes `cent` oder `runde`', () => {
    const funde = quellen.filter((d) =>
      /\b(?:const|function)\s+(?:cent|runde)\b(?!\s+as)/.test(readFileSync(d, 'utf8')));
    expect(funde).toEqual([]);
  });
});
