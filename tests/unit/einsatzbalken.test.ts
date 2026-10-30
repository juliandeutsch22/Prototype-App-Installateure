import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  DER EINSATZBALKEN MIT ENDMARKEN (Planlinie, B11; 30.10.2026): in Woche und
  Monat eine helle Fläche mit 2 px Petrol am Anfang und am Ende, Text in
  Petrol — statt des dunkel gefüllten Blocks. Abwesenheit ist schraffiert
  (`.schraffur` aus der Planlinie), nicht grau. Was bleibt: Bernstein für
  „eingeteilt, aber abwesend“.
*/

const planung = readFileSync('src/styles/lot-planung.css', 'utf8');
const monat = readFileSync('src/styles/lot-monat.css', 'utf8');

/**
 * Die Rümpfe aller Regeln, deren Selektorliste genau `selektor` ist, aneinander —
 * ab 1.200 px setzt eine zweite Regel nur die Innenabstände.
 */
function regel(css: string, selektor: string): string {
  const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const treffer = [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(treffer.length, `eine Regel für ${selektor}`).toBeGreaterThan(0);
  return treffer.map((t) => t[1]).join(' ');
}

const ENDMARKEN = [
  /background: var\(--petrol-hell\)/,
  /color: var\(--accent-deep\)/,
  /border-left: 2px solid var\(--accent-deep\)/,
  /border-right: 2px solid var\(--accent-deep\)/,
];

describe('Einsatzbalken mit Endmarken', () => {
  it('Woche: helle Fläche, Endmarken links und rechts, eckig — nicht mehr dunkel gefüllt', () => {
    const r = regel(planung, '.eintrag');
    for (const m of ENDMARKEN) expect(r).toMatch(m);
    expect(r).toMatch(/border-radius: 0/);
    expect(r).not.toMatch(/background: var\(--petrol\)|#ffffff/);
  });

  it('Monat: derselbe Balken, auch gewählt', () => {
    const r = regel(monat, '.mo-balken, .mo-balken-gewaehlt');
    for (const m of ENDMARKEN) expect(r).toMatch(m);
    expect(monat).not.toMatch(/\.mo-balken \{ background: var\(--petrol\)/);
  });

  it('abwesend trägt keine eigene Fläche mehr — die Schraffur kommt aus `.schraffur`', () => {
    expect(regel(planung, '.eintrag-weg')).not.toMatch(/background/);
    expect(monat).not.toMatch(/\.mo-balken-weg \{/);
    const schraffur = regel(readFileSync('src/styles/lot-planlinie.css', 'utf8'), '.schraffur');
    expect(schraffur).toMatch(/repeating-linear-gradient\(135deg/);
  });

  it('gleich geblieben: eingeteilt, aber abwesend in Bernstein', () => {
    expect(regel(planung, '.eintrag-konflikt')).toMatch(/background: var\(--warning-bg\); color: var\(--warning\); border: 2px solid var\(--warning\)/);
    expect(monat).toMatch(/\.mo-balken-konflikt \{ background: var\(--warning-bg\); color: var\(--warning\)/);
  });
});
