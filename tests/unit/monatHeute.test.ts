import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/*
  HEUTE (Geschichte): das Lot der Planlinie B4 (30.10.2026), im Monat seit
  E77 als Spalte, seit V10 in Woche und Monat dunkler Kopf über warmer
  Spalte (siehe unten); am Handy hängt das Lot weiter über dem Tag. Bis dahin trug die Spalte
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
  V10 (13.11.2026, style.md „Einsatzplanung · E88“, Auftrag 11.2): HEUTE IST
  EIN DUNKLER TAGESKOPF ÜBER EINER WARM VERTIEFTEN SPALTE — in Woche und
  Monat gleich. Der gewählte bzw. aus dem Monat markierte Tag liegt auf der
  warmen Auswahlfläche mit feiner Kontur. Gegenprobe: mit dem Stand vor V10
  (Petrol-hell, Lotlinie links, 2-px-Petrolring) ist jede Prüfung rot.
*/
describe('Monatsplan: heute als Spalte (E77, V10)', () => {
  it('die Spalte ist warm vertieft, ohne Linie und ohne Rahmen um die einzelnen Zellen', () => {
    expect(regel(monat, '.mo-hg-heute')).toBe(' background: var(--heute); ');
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

  it('der Kopf von heute ist dunkel, die Schrift hell — auch am gewählten Tag bleibt `data-heute`', () => {
    const r = regel(monat, '.mo-kopf-heute');
    expect(r).toMatch(/background: var\(--dunkel-flaeche\)/);
    expect(r).toMatch(/color: var\(--auf-dunkel\)/);
    // Nur die Terrakotta-Linie oben, kein Rahmen rundum.
    expect(r).toMatch(/box-shadow: inset 0 2px 0 var\(--petrol\);/);
    expect(r).not.toMatch(/inset 0 0 0/);
    const ansicht = readFileSync('src/features/assignments/MonatsAnsicht.tsx', 'utf8');
    expect(ansicht).toContain("data-heute={t === heute ? '' : undefined}");
  });

  it('das Senkblei hängt weiter über dem Tag', () => {
    const ansicht = readFileSync('src/features/assignments/MonatsAnsicht.tsx', 'utf8');
    expect(ansicht).toContain('{t === heute && <span className="spalten-lot" aria-hidden="true" />}');
  });

  it('Darüberfahren rahmt die Zelle fein (1 px) statt sie zu tönen', () => {
    expect(monat).toContain('.mo-hg:hover, .mo-hg-we:hover, .mo-hg-heute:hover { box-shadow: inset 0 0 0 1px var(--auswahl-kontur); }');
    expect(monat).toContain('.mo-kopf:hover, .mo-kopf-we:hover { color: var(--accent-deep); box-shadow: inset 0 0 0 1px var(--auswahl-kontur); }');
    expect(monat).not.toMatch(/:hover[^{]*\{[^}]*background: var\(--(petrol-hell|auswahl)\)/);
  });

  it('die Legende zeigt dieselbe Fläche wie die Spalte und den dunklen Kopf', () => {
    const r = regel(monat, '.mo-legende-heute::before');
    expect(r).toMatch(/background: var\(--heute\)/);
    expect(r).toMatch(/var\(--dunkel-flaeche\)/);
  });
});

describe('Monatsplan: der gewählte Tag', () => {
  it('liegt auf der Auswahlfläche mit feiner Kontur, in der Spalte wie im Kopf', () => {
    expect(regel(monat, '.mo-hg-gewaehlt')).toBe(' background: var(--auswahl); box-shadow: inset 0 0 0 1px var(--auswahl-kontur); ');
    expect(regel(monat, '.mo-kopf-gewaehlt')).toMatch(/background: var\(--auswahl\);[^}]*box-shadow: inset 0 0 0 1px var\(--auswahl-kontur\)/);
  });
});

describe('Woche: heute als dunkler Kopf und warme Spalte (V10)', () => {
  it('Zelle und Kopf von heute — auch an einem schmalen Tag; keine Lotlinie links mehr', () => {
    expect(regel(planung, '.wp-zelle-heute')).toBe(' background: var(--heute); ');
    expect(regel(planung, '.wp-zelle-schmal-heute')).toBe(' background: var(--heute); ');
    expect(regel(planung, '.wp-kopf-heute, .wp-kopf-schmal-heute')).toBe(' background: var(--dunkel-flaeche); color: var(--auf-dunkel); box-shadow: inset 0 2px 0 var(--petrol); ');
    expect(planung).not.toMatch(/-heute \{[^}]*border-left-color: var\(--accent-deep\)/);
  });

  it('Tag, Termine und Warnung im dunklen Kopf in heller Schrift', () => {
    expect(regel(planung, '.wp-kopf-heute :is(.kopf-tag, .kopf-warnung, .kopf-termine), .wp-kopf-schmal-heute .kopf-tag')).toMatch(/color: var\(--auf-dunkel\)/);
  });

  it('das Senkblei im Kopf: Faden und Raute, ohne Klickfläche — im dunklen Kopf in der leisen hellen Schrift', () => {
    expect(regel(planung, '.spalten-lot')).toMatch(/pointer-events: none/);
    expect(regel(planung, '.spalten-lot::before')).toMatch(/width: 1px;.*background: var\(--accent-deep\)/);
    expect(regel(planung, '.spalten-lot::after')).toMatch(/clip-path: polygon\(50% 0, 100% 40%, 50% 100%, 0 40%\)/);
    expect(planung).toMatch(/:is\(\.wp-kopf-heute, \.wp-kopf-schmal-heute, \.mo-kopf-heute\) \.spalten-lot::after \{ background: var\(--auf-dunkel-leise\); \}/);
  });

  it('der aus dem Monat markierte Tag liegt auf der Auswahlfläche', () => {
    expect(regel(planung, '.wp-kopf-markiert')).toBe(' background: var(--auswahl); box-shadow: inset 0 0 0 1px var(--auswahl-kontur), inset 0 -2px 0 var(--petrol); ');
  });

  it('die Tagesleiste am Handy: heute ohne eigene Fläche, der gewählte Tag auf der Auswahl und unterstrichen', () => {
    expect(planung).not.toMatch(/\.tagwahl-tag-heute/);
    const an = regel(planung, '.tagwahl-tag-an');
    expect(an).toMatch(/background: var\(--auswahl\)/);
    expect(an).toMatch(/box-shadow: inset 0 -2px 0 var\(--petrol\)/);
    expect(an).not.toMatch(/background: var\(--(petrol|brand)\)/);
  });
});

describe('Handy-Kalender: heute als Lot', () => {
  it('die Kachel von heute trägt keinen Rahmen und keine Fläche mehr — das Lot hängt über der Zahl', () => {
    const r = regel(monat, '.kal-tag-heute');
    expect(r).not.toMatch(/box-shadow|background/);
    expect(r).toMatch(/color: var\(--accent-deep\)/);
  });

  it('der gewählte Tag auf der Auswahlfläche, ohne festen Hexwert', () => {
    expect(regel(monat, '.kal-tag-gewaehlt')).toMatch(/background: var\(--auswahl\)/);
    expect(monat).not.toMatch(/#ffffff/i);
  });
});
