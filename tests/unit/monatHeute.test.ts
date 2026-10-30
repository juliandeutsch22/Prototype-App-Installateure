import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/*
  HEUTE TRÄGT DAS LOT (Planlinie, B4; 30.10.2026). Bis dahin trug die Spalte
  von heute einen leisen Ton (`--heute`) und der Kopf eine getönte Fläche
  mit Strich unten (Entscheidung vom 20.10.2026: keine Linien, weil zwei
  Linien je Zelle an jeder Zeilengrenze abbrachen). Jetzt ist es EINE Linie
  links, die durch Kopf und alle Zeilen läuft, im Kopf das Senkblei daran —
  in Woche und Monat; über dem Tag in Tagesleiste und Kalender. Der
  gewählte Tag behält als einziger einen Rahmen.
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

describe('Monatsplan: heute als Lot', () => {
  it('die Spalte trägt keinen Ton mehr, sondern links eine Linie in Petrol, die über die Zeilengrenze reicht', () => {
    expect(regel(monat, '.mo-hg-heute')).toMatch(/background: var\(--surface\)/);
    const linie = regel(monat, '.mo-hg-heute::before');
    expect(linie).toMatch(/left: 0;/);
    expect(linie).toMatch(/bottom: -1px;/);
    expect(linie).toMatch(/width: 1px;/);
    expect(linie).toMatch(/background: var\(--accent-deep\)/);
    // Sie liegt über den Balken, fängt aber keinen Klick.
    expect(linie).toMatch(/pointer-events: none/);
  });

  it('keine Regel zeichnet einen Rahmen um die Zellen von heute (nur die eine Linie links)', () => {
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

  it('der Kopf von heute: keine getönte Fläche, Petrol-Schrift, dieselbe Linie links', () => {
    const r = regel(monat, '.mo-kopf-heute');
    expect(r).toMatch(/background: var\(--surface\)/);
    expect(r).toMatch(/color: var\(--accent-deep\)/);
    expect(r).not.toMatch(/petrol-hell|box-shadow/);
    expect(regel(monat, '.mo-kopf-heute::before')).toMatch(/width: 1px; background: var\(--accent-deep\)/);
  });
});

describe('Monatsplan: was gleich bleibt', () => {
  it('der gewählte Tag behält seinen Rahmen, in der Spalte wie im Kopf', () => {
    expect(regel(monat, '.mo-hg-gewaehlt')).toMatch(/background: var\(--petrol-hell\); box-shadow: inset 0 0 0 2px var\(--petrol\)/);
    expect(regel(monat, '.mo-kopf-gewaehlt')).toMatch(/box-shadow: inset 0 0 0 2px var\(--petrol\)/);
  });

  it('Überfahren hebt heute weiter hervor', () => {
    expect(monat).toMatch(/\.mo-hg:hover, \.mo-hg-we:hover, \.mo-hg-heute:hover \{ background: var\(--petrol-hell\); \}/);
  });
});

describe('Woche: heute als Lot', () => {
  it('Zelle und Kopf von heute: kein Ton, die Linie links in Petrol — auch an einem schmalen Tag', () => {
    expect(regel(planung, '.wp-zelle-heute')).toBe(' background: none; border-left-color: var(--accent-deep); ');
    expect(regel(planung, '.wp-zelle-schmal-heute')).toBe(' background: var(--surface-2); border-left-color: var(--accent-deep); ');
    expect(regel(planung, '.wp-kopf-heute')).toBe(' background: var(--surface); border-left-color: var(--accent-deep); ');
    expect(regel(planung, '.wp-kopf-schmal-heute')).toBe(' background: var(--surface-2); border-left-color: var(--accent-deep); ');
  });

  it('das Senkblei im Kopf: Faden und Raute in Petrol, ohne Klickfläche', () => {
    expect(regel(planung, '.spalten-lot')).toMatch(/pointer-events: none/);
    expect(regel(planung, '.spalten-lot::before')).toMatch(/width: 1px;.*background: var\(--accent-deep\)/);
    expect(regel(planung, '.spalten-lot::after')).toMatch(/clip-path: polygon\(50% 0, 100% 40%, 50% 100%, 0 40%\)/);
  });

  it('der aus dem Monat markierte Tag behält seinen Ring (gleich geblieben)', () => {
    expect(regel(planung, '.wp-kopf-markiert')).toBe(' background: var(--petrol-hell); box-shadow: inset 0 0 0 2px var(--petrol); ');
  });

  it('die Tagesleiste am Handy: heute ohne eigene Fläche, der gewählte Tag unterstrichen statt gefüllt', () => {
    expect(planung).not.toMatch(/\.tagwahl-tag-heute/);
    const an = regel(planung, '.tagwahl-tag-an');
    expect(an).toMatch(/background: var\(--surface\)/);
    expect(an).toMatch(/box-shadow: inset 0 -2px 0 var\(--accent-deep\)/);
    expect(an).not.toMatch(/background: var\(--petrol\)/);
  });
});

describe('Handy-Kalender: heute als Lot', () => {
  it('die Kachel von heute trägt keinen Rahmen und keine Fläche mehr — das Lot hängt über der Zahl', () => {
    const r = regel(monat, '.kal-tag-heute');
    expect(r).not.toMatch(/box-shadow|background/);
    expect(r).toMatch(/color: var\(--accent-deep\)/);
  });
});
