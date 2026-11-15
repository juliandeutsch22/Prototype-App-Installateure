import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  B1 (Plan 15.11.2026, Abschnitt 4): das Blatt kommt von unten und geht dorthin
  zurück; ab dem Tablet kommt das Seitenfenster von rechts. Nur `transform` —
  im Browser gemessen in `tests/links/bewegungen.spec.ts`. Hier steht fest,
  dass die Regeln da sind und an der Grundregel für „Bewegung reduzieren“
  hängen (keine eigene Dauer, die sie umginge).
*/
const css = readFileSync('src/styles/lot-bewegung.css', 'utf8');
const index = readFileSync('src/index.css', 'utf8');

describe('B1 Blatt von unten', () => {
  it('ist eingebunden', () => {
    expect(index).toContain("@import './styles/lot-bewegung.css';");
  });
  it('Blatt und Fenster fahren von unten herein und hinaus, ab dem Tablet von rechts', () => {
    expect(css).toMatch(/@keyframes blatt-herein \{ from \{ transform: translateY\(100%\); \} \}/);
    expect(css).toMatch(/@keyframes blatt-hinaus \{ to \{ transform: translateY\(100%\); \} \}/);
    expect(css).toMatch(/@keyframes fenster-herein \{ from \{ transform: translateX\(calc\(100% \+ 0\.5rem\)\); \} \}/);
    expect(css).toMatch(/\.lot-overlay > \.blatt\[data-lot-inhalt\],[\s\S]*?animation: blatt-herein var\(--motion-overlay\)/);
    expect(css).toMatch(/@media \(min-width: 760px\) \{[\s\S]*?animation-name: fenster-herein;/);
  });
  it('ein weggezogenes Blatt läuft ohne Schließanimation weiter', () => {
    expect(css).toContain('.lot-overlay[data-phase=schliesst] > [data-lot-inhalt][data-gezogen] { animation: none; }');
  });
  it('keine Bewegung dieser Datei ändert Layout: nur transform, Deckkraft und Strich (Haken)', () => {
    const bilder = [...css.matchAll(/@keyframes [\w-]+ \{([^@]*?)\}\s*(?=@keyframes|\/\*|$)/g)].map((m) => m[1]);
    expect(bilder.length).toBeGreaterThan(4);
    for (const b of bilder) for (const e of b.matchAll(/([a-z-]+)\s*:/g)) expect(['transform', 'opacity', 'stroke-dashoffset']).toContain(e[1]);
    for (const m of css.matchAll(/transition\s*:\s*([^;]+);/g)) {
      for (const teil of m[1].split(',')) expect(['transform', 'opacity', 'visibility', 'none']).toContain(teil.trim().split(/\s+/)[0]);
    }
  });
});
