import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
  DER TAKTGEBER LIEST, WAS ER GESCHRIEBEN HAT (S2, 15.11.2026). `lib/takt.ts`
  setzt Abstand oben und Polster unten eines Blatts und liest sie beim
  nächsten Bild als Grundwert zurück. Läuft auf diesen Eigenschaften ein
  Übergang, liefert der Browser noch den alten Wert — Blätter stießen dann
  aneinander oder bekamen eine Zelle zu viel Abstand. Ausgelöst hat das die
  Regel für „Bewegung reduzieren“: 0,01 ms machten aus dem unsichtbaren
  `all 0s` jedes Elements einen echten Übergang. Gemessen in der Vorschau:
  Startseite am Handy mit reduzierter Bewegung 12 von 12 Ladevorgängen mit
  falschem Grundwert, einer von sechs mit sichtbar zu hohem Blatt; mit 0s
  96 von 96 Messungen (16 Seiten, 2 Breiten) wie ohne reduzierte Bewegung.
*/

const STILE = ['src/index.css', ...readdirSync('src/styles').filter((f) => f.endsWith('.css')).map((f) => `src/styles/${f}`)];

/** Übergänge, die Abstand oder Polster erfassen: `all`, `margin*`, `padding*`. */
function uebergaengeAufAbstand(css: string): string[] {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const funde: string[] = [];
  for (const m of ohneKommentare.matchAll(/transition(-property)?\s*:\s*([^;}]+)/g)) {
    const wert = m[2].trim();
    if (/^none\b/.test(wert)) continue;
    // Jede Angabe der Liste beginnt mit der Eigenschaft (Kurzform) bzw. ist sie (`transition-property`).
    const eigenschaften = wert.split(',').map((t) => t.trim().split(/\s+/)[0]);
    if (eigenschaften.some((e) => e === 'all' || /^(margin|padding)/.test(e))) funde.push(m[0].trim());
  }
  return funde;
}

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? dateien(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
}

describe('Kein Übergang auf Abstand und Polster (S2)', () => {
  it('bei „Bewegung reduzieren“ dauern Übergänge 0s — nicht 0,01 ms', () => {
    // Gegenprobe: mit `0.01ms` ist das rot.
    const css = readFileSync('src/index.css', 'utf8');
    const regel = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  *,'));
    expect(regel).toMatch(/^@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{[^}]*transition-duration: 0s !important;/);
    expect(regel.slice(0, regel.indexOf('}'))).not.toContain('transition-duration: 0.01ms');
  });

  it('gleich geblieben: Animationen laufen bei reduzierter Bewegung einmal und kurz', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const regel = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  *,'));
    expect(regel).toMatch(/animation-duration: 0\.01ms !important;\s*animation-iteration-count: 1 !important;/);
  });

  it('die Prüfung erkennt einen Übergang auf `all`, auf Abstand und Polster — und lässt andere durch', () => {
    expect(uebergaengeAufAbstand('.a { transition: all 0.2s ease; }')).toHaveLength(1);
    expect(uebergaengeAufAbstand('.a { transition: opacity 160ms, margin-top 160ms; }')).toHaveLength(1);
    expect(uebergaengeAufAbstand('.a { transition-property: padding-bottom; }')).toHaveLength(1);
    expect(uebergaengeAufAbstand('.a { transition: opacity 160ms, transform 160ms; }')).toEqual([]);
    expect(uebergaengeAufAbstand('.a { transition: none !important; }')).toEqual([]);
    expect(uebergaengeAufAbstand('/* transition: all 1s */ .a { color: red; }')).toEqual([]);
  });

  it('kein Stil und keine Klasse lässt `all`, Abstand oder Polster übergehen', () => {
    const funde = STILE.flatMap((d) => uebergaengeAufAbstand(readFileSync(d, 'utf8')).map((f) => `${d}: ${f}`));
    expect(funde).toEqual([]);
    // Tailwind: `transition-all` und beliebige Werte auf Abstand/Polster/Höhe.
    const klassen = dateien('src').filter((d) => /\.tsx?$/.test(d))
      .filter((d) => /\btransition-all\b|transition-\[(margin|padding)/.test(readFileSync(d, 'utf8')));
    expect(klassen).toEqual([]);
  });
});
