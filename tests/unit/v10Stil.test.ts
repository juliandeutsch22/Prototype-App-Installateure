import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
  DIE DESIGNLINIE V10 „WARMES PAPIER, KLARE ARBEIT“ (13.11.2026), soweit sie
  im Stil steht. Grundlage: style.md und der Implementierungsauftrag
  (docs/ui-umbau/entscheidungen.md, E92). Die Module ergänzen eigene Blöcke.
*/
const stil = (datei: string) => readFileSync(join('src/styles', datei), 'utf8');
const INDEX = readFileSync('src/index.css', 'utf8');
const LOT = stil('lot.css');
const ALLE_STILE = [INDEX, ...readdirSync('src/styles').filter((d) => d.endsWith('.css')).map(stil)].join('\n');
const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '');

function satz(name: 'hell' | 'dunkel'): string {
  if (name === 'hell') return INDEX.slice(INDEX.indexOf('\n:root {\n'), INDEX.indexOf('\n}\n', INDEX.indexOf('\n:root {\n')));
  const a = INDEX.indexOf("  :root[data-theme='dark'] {");
  return INDEX.slice(a, INDEX.indexOf('\n  }\n', a));
}
const wert = (s: string, name: string) => new RegExp(`\\n\\s*${name}:\\s*([^;]+);`).exec(s)?.[1]?.replace(' !important', '').trim();

describe('V10 Grundwerte', () => {
  it('Terrakotta ist die Primärfarbe, warmes Papier der Grund, das Blatt hell', () => {
    const hell = satz('hell');
    expect(wert(hell, '--brand')).toBe('#a85439');
    expect(wert(hell, '--bg')).toBe('#f4f0e8');
    expect(wert(hell, '--surface')).toBe('#fffdf8');
    expect(wert(hell, '--navi')).toBe('#292722');
    expect(wert(hell, '--auswahl')).toBe('#f3e4d8');
  });

  it('der dunkle Satz ist eine eigene warme Welt, keine Inversion — die Primäraktion bleibt Terrakotta', () => {
    const dunkel = satz('dunkel');
    expect(wert(dunkel, '--bg')).toBe('#211f1c');
    expect(wert(dunkel, '--surface')).toBe('#25221f');
    expect(wert(dunkel, '--brand')).toBe('#a85439');
    expect(wert(dunkel, '--accent-deep')).toBe('#d08a68');
    expect(wert(dunkel, '--chat-eigen')).toBe('#43362f');
  });

  it('Warnung und Fehler färben keine Flächen — ihre Hintergründe sind neutral', () => {
    const hell = satz('hell');
    for (const t of ['--warning-bg', '--danger-bg', '--info-bg', '--success-bg']) expect(wert(hell, t), t).toBe(wert(hell, '--surface'));
  });

  it('keine farbige Statuskante: kein Inset- oder Randstrich in Warn- oder Fehlerfarbe', () => {
    const funde = ohneKommentare(ALLE_STILE).split('\n').filter((z) =>
      /inset \d+px 0 0 var\(--(warning|danger|achtung|fehler)\)|border-left:[^;]*var\(--(warning|danger|achtung|fehler)\)/.test(z));
    expect(funde).toEqual([]);
  });

  it('Gegenprobe: eine Warnkante fiele auf', () => {
    expect(/inset \d+px 0 0 var\(--(warning|danger|achtung|fehler)\)/.test('.x { box-shadow: inset 3px 0 0 var(--warning); }')).toBe(true);
  });

  it('Radien nach Rolle: Zeile 8, Feld/Knopf 12, Blatt 16, Sheet/Insel 24 px', () => {
    const hell = satz('hell');
    expect(wert(hell, '--radius-sm')).toBe('0.5rem');
    expect(wert(hell, '--radius')).toBe('0.75rem');
    expect(wert(hell, '--radius-lg')).toBe('1rem');
    expect(wert(hell, '--radius-xl')).toBe('1.5rem');
  });

  it('Schriften: DM Sans, Source Serif 4 für Titel, Plex Mono für Gemessenes — alle lokal', () => {
    expect(INDEX).toContain("--schrift-text: 'DM Sans'");
    expect(INDEX).toContain("--schrift-titel: 'Source Serif 4'");
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain("@fontsource/dm-sans/latin-400.css");
    expect(main).toContain("@fontsource/source-serif-4/latin-400.css");
    expect(main).not.toMatch(/fonts\.googleapis|poppins/i);
  });
});

describe('V10 App-Hülle', () => {
  it('Kopf- und Fußleiste am Handy sind Inseln mit demselben Radius und Schatten', () => {
    const kopf = /\.kopfzeile \{[^}]*\}/.exec(LOT)![0];
    const fuss = /\.unten \{[^}]*\}/.exec(LOT)![0];
    for (const r of [kopf, fuss]) {
      expect(r).toContain('border-radius: var(--radius-xl)');
      expect(r).toContain('box-shadow: var(--shadow-insel)');
      expect(r).toContain('border: 1px solid var(--insel-kontur)');
    }
  });

  it('die Hauptaktion am Handy steht kompakt rechts, ohne Balkenfläche', () => {
    expect(LOT).toMatch(/\.daumen \{ display: flex; justify-content: flex-end;[^}]*background: none; border: 0;/);
    expect(LOT).toContain('.daumen > * { flex: none;');
  });

  it('die Meldung trägt keine rote Kante', () => {
    expect(/\.meldung-fehler \{[^}]*\}/.exec(LOT)![0]).not.toMatch(/border-left/);
  });
});
