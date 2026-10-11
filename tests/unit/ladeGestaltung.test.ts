/**
 * Wie Laden aussieht (Analyse und Entscheidung 10.10.2026): Platzhalter erst
 * nach 200 ms, dann ein ruhiger Puls nur über die deckende Flächenfarbe —
 * kein Verlauf, keine Transparenz —, und bei „Bewegung reduzieren“ still.
 * Statt des Kreisels steht beim ersten Öffnen einer Ansicht ein Platzhalter
 * in Seitenform.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../../src/index.css'), 'utf8');
const app = readFileSync(join(__dirname, '../../src/app/App.tsx'), 'utf8');

function block(selektor: string): string {
  const start = css.indexOf(`${selektor} {`);
  expect(start, selektor).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

function keyframes(name: string): string {
  const start = css.indexOf(`@keyframes ${name} {`);
  expect(start, name).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('Platzhalter', () => {
  it('erscheinen nach 200 ms und pulsieren danach', () => {
    const b = block('.skeleton');
    expect(b).toMatch(/platzhalter-erscheinen 160ms ease-out 200ms both/);
    expect(b).toMatch(/platzhalter-puls 1\.8s ease-in-out 200ms infinite/);
  });

  it('der Puls wechselt nur die deckende Flächenfarbe — kein Verlauf, keine Deckkraft', () => {
    const puls = keyframes('platzhalter-puls');
    expect(puls).toMatch(/background-color: var\(--surface-3\)/);
    expect(puls).toMatch(/background-color: var\(--surface-2\)/);
    expect(puls).not.toMatch(/gradient|opacity|rgba|#[0-9a-f]{8}\b/i);
  });

  it('bei „Bewegung reduzieren“ steht alles still', () => {
    const regel = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(regel).toMatch(/animation-iteration-count: 1 !important/);
    expect(regel).toMatch(/animation-duration: 0\.01ms !important/);
  });

  it('der Platzhalter eines Werts bricht um wie der Wert — ein Balken je Zeile', () => {
    const b = block('.skeleton-text');
    expect(b).toMatch(/color: transparent/);
    expect(b).toMatch(/(?<!-)box-decoration-break: clone/);
    // Der Mustertext nur im Pseudo-Element — nicht in Seitentext, Suche oder Kopie.
    expect(css).toMatch(/\.skeleton-text::before \{\s*content: attr\(data-muster\);/);
  });

  it('der Ladetext erscheint ebenso erst nach 200 ms', () => {
    expect(block('.laden-verzoegert')).toMatch(/platzhalter-erscheinen 160ms ease-out 200ms both/);
    const states = readFileSync(join(__dirname, '../../src/components/States.tsx'), 'utf8');
    expect(states).toMatch(/className="laden-verzoegert /);
  });
});

describe('Beim ersten Öffnen einer Ansicht', () => {
  it('steht ein Platzhalter in Seitenform, kein Kreisel', () => {
    expect(app).toMatch(/<Suspense fallback=\{<SeitenPlatzhalter \/>\}>\s*<EinblickProtokoll>/);
  });

  it('die Ansichten sind mit ihrem Menüpfad angemeldet — sonst holt das Vorladen sie nicht', () => {
    // Ausserhalb der Navigation bleiben nur Rechtliches, Plattform und Musterseite.
    const reinLazy = [...app.matchAll(/const (\w+) = lazy\(/g)].map((m) => m[1]).sort();
    expect(reinLazy).toEqual(['DatenschutzView', 'ImpressumView', 'MusterView', 'PlattformView']);
    expect((app.match(/= ansicht\(/g) ?? []).length).toBeGreaterThanOrEqual(30);
  });
});
