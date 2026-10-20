import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/*
  HEUTE IM MONATSPLAN (20.10.2026): Die Spalte von heute trägt nur noch den
  leisen Ton `--heute`, ohne Linien. Der Kopf bleibt die eine deutliche
  Markierung, der gewählte Tag behält als einziger einen Rahmen; Woche und
  Handy-Kalender bleiben, wie sie sind.
*/

const monat = readFileSync('src/styles/lot-monat.css', 'utf8');
const planung = readFileSync('src/styles/lot-planung.css', 'utf8');

/** Der Rumpf der Regel, deren Selektorliste genau `selektor` ist. */
function regel(css: string, selektor: string): string {
  const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const treffer = [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(treffer, `genau eine Regel für ${selektor}`).toHaveLength(1);
  return treffer[0][1];
}

describe('Monatsplan: die Spalte von heute', () => {
  it('trägt nur den Ton --heute — keine Linien, kein Rahmen', () => {
    const r = regel(monat, '.mo-hg-heute');
    expect(r).toMatch(/background: var\(--heute\)/);
    expect(r).not.toMatch(/box-shadow|border|outline/);
  });

  it('auch keine andere Regel in den Stilen zeichnet Linien an die Zellen von heute', () => {
    for (const datei of readdirSync('src/styles').filter((d) => d.endsWith('.css'))) {
      const css = readFileSync(`src/styles/${datei}`, 'utf8');
      for (const [, sel, rumpf] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (!/\.mo-hg-heute\b/.test(sel)) continue;
        // Die gemeinsame Grundregel setzt `border: 0` und die Trennlinie in der
        // Farbe des Grunds — die gilt für jeden Tag gleich und bleibt.
        const ohneGrundregel = rumpf.replace(/border: 0;|border-right: 1px solid var\(--bg\);/g, '');
        expect(ohneGrundregel, `${datei}: ${sel.trim()}`).not.toMatch(/box-shadow|border|outline/);
      }
    }
  });

  it('der Ton hat hell und dunkel einen eigenen Wert, leiser als --petrol-hell', () => {
    const index = readFileSync('src/index.css', 'utf8');
    expect(index).toMatch(/--heute: #f4f8f9;/);
    expect(index).toMatch(/:root\[data-theme='dark'\] \{[^}]*--heute: #132c32;/);
  });
});

describe('Monatsplan: was gleich bleibt', () => {
  it('der Kopf von heute: heller Petrol-Grund, fette Zahl, 3-px-Strich unten', () => {
    const r = regel(monat, '.mo-kopf-heute');
    expect(r).toMatch(/background: var\(--petrol-hell\)/);
    expect(r).toMatch(/font-weight: 600/);
    expect(r).toMatch(/box-shadow: inset 0 -3px 0 var\(--petrol\)/);
  });

  it('der gewählte Tag behält seinen Rahmen, in der Spalte wie im Kopf', () => {
    expect(regel(monat, '.mo-hg-gewaehlt')).toMatch(/background: var\(--petrol-hell\); box-shadow: inset 0 0 0 2px var\(--petrol\)/);
    expect(regel(monat, '.mo-kopf-gewaehlt')).toMatch(/box-shadow: inset 0 0 0 2px var\(--petrol\)/);
  });

  it('Überfahren hebt heute weiter hervor', () => {
    expect(monat).toMatch(/\.mo-hg:hover, \.mo-hg-we:hover, \.mo-hg-heute:hover \{ background: var\(--petrol-hell\); \}/);
  });

  it('die Woche: Spalte im Ton, Kopf mit Strich — unverändert', () => {
    expect(regel(planung, '.wp-zelle-heute')).toBe(' background: var(--heute); ');
    expect(regel(planung, '.wp-kopf-heute')).toBe(' background: var(--petrol-hell); box-shadow: inset 0 -3px 0 var(--petrol); ');
  });

  it('der Handy-Kalender: Kachel von heute mit Rahmen — unverändert', () => {
    expect(regel(monat, '.kal-tag-heute')).toBe(' background: var(--petrol-hell); box-shadow: inset 0 0 0 2px var(--petrol); ');
  });
});
