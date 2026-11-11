import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/*
  HEUTE TRÄGT DAS LOT (Planlinie, B4; 30.10.2026) — in der Woche und am
  Handy weiter so; im Monat seit E77 als Spalte (siehe unten). Bis dahin trug die Spalte
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

/*
  E77 (11.11.2026): IM MONAT IST HEUTE DIE SPALTE. Die eine Linie links (B4)
  las sich wie die Grenze zwischen zwei Tagen („die Markierung für den
  aktuellen Tag noch nicht gut gelöst“). Jetzt Variante A: die ganze Spalte
  Petrol-hell, im Kopf die Zahl im Petrol-Kästchen, das Senkblei darüber.
  Gegenprobe: mit dem Stand vor E77 (Fläche `--surface`, Linie `::before`)
  ist jede dieser Prüfungen rot.
*/
describe('Monatsplan: heute als Spalte (E77)', () => {
  it('die Spalte ist Petrol-hell, ohne Linie und ohne Rahmen um die einzelnen Zellen', () => {
    expect(regel(monat, '.mo-hg-heute')).toBe(' background: var(--petrol-hell); ');
    expect(monat).not.toMatch(/\.mo-(hg|kopf)-heute::before/);
  });

  it('keine Regel zeichnet einen Rahmen um die Zellen von heute — außer der Maus darüber', () => {
    for (const datei of readdirSync('src/styles').filter((d) => d.endsWith('.css'))) {
      const css = readFileSync(`src/styles/${datei}`, 'utf8');
      for (const [, sel, rumpf] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (!/\.mo-hg-heute\b/.test(sel) || /:hover/.test(sel)) continue;
        // Die gemeinsame Grundregel setzt `border: 0` und die Trennlinie in der
        // Farbe des Grunds — die gilt für jeden Tag gleich und bleibt.
        const ohneGrundregel = rumpf.replace(/border: 0;|border-right: 1px solid var\(--bg\);/g, '');
        expect(ohneGrundregel, `${datei}: ${sel.trim()}`).not.toMatch(/box-shadow|border|outline/);
      }
    }
  });

  it('der Kopf von heute: Petrol-hell, die Zahl im Petrol-Kästchen — auch am gewählten Tag (`data-heute`)', () => {
    const r = regel(monat, '.mo-kopf-heute');
    expect(r).toMatch(/background: var\(--petrol-hell\)/);
    expect(r).toMatch(/color: var\(--accent-deep\)/);
    expect(r).not.toMatch(/box-shadow/);
    expect(regel(monat, '[data-heute] > .mo-nr')).toMatch(/background: var\(--petrol\); color: var\(--auf-petrol\)/);
    const ansicht = readFileSync('src/features/assignments/MonatsAnsicht.tsx', 'utf8');
    expect(ansicht).toContain("data-heute={t === heute ? '' : undefined}");
  });

  it('das Senkblei hängt weiter über dem Tag', () => {
    const ansicht = readFileSync('src/features/assignments/MonatsAnsicht.tsx', 'utf8');
    expect(ansicht).toContain('{t === heute && <span className="spalten-lot" aria-hidden="true" />}');
  });

  it('Darüberfahren rahmt die Zelle (1 px) statt sie zu tönen — in der Spalte von heute wäre eine Fläche unsichtbar', () => {
    expect(monat).toContain('.mo-hg:hover, .mo-hg-we:hover, .mo-hg-heute:hover { box-shadow: inset 0 0 0 1px var(--petrol); }');
    expect(monat).toContain('.mo-kopf:hover, .mo-kopf-we:hover, .mo-kopf-heute:hover { color: var(--accent-deep); box-shadow: inset 0 0 0 1px var(--petrol); }');
    expect(monat).not.toMatch(/:hover[^{]*\{[^}]*background: var\(--petrol-hell\)/);
  });

  it('die Legende zeigt dieselbe Fläche wie die Spalte', () => {
    expect(regel(monat, '.mo-legende-heute::before')).toMatch(/background: var\(--petrol-hell\)/);
  });
});

describe('Monatsplan: was gleich bleibt', () => {
  it('der gewählte Tag behält seinen Rahmen (2 px), in der Spalte wie im Kopf', () => {
    expect(regel(monat, '.mo-hg-gewaehlt')).toMatch(/background: var\(--petrol-hell\); box-shadow: inset 0 0 0 2px var\(--petrol\)/);
    expect(regel(monat, '.mo-kopf-gewaehlt')).toMatch(/box-shadow: inset 0 0 0 2px var\(--petrol\)/);
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
