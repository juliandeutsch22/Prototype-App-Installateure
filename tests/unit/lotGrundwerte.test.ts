/**
 * Die Grundwerte der Linie „Lot“ — hell und dunkel lesbar.
 *
 * Geprüft wird, was eine Farbe auf ihrer Fläche leisten muss (WCAG 2.1 AA,
 * Protokoll Abschnitt 4.3), und zwar in BEIDEN Sätzen: der dunkle wird nur
 * auf Wahl gezeigt und fiele sonst niemandem auf, bis ihn jemand einschaltet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { kontrast, AA_NORMAL } from '@/lib/kontrast';

const css = readFileSync('src/index.css', 'utf8');
/** Alle Bausteine: lot.css und die Seitenbausteine je Paket (lot-*.css). */
const lot = readdirSync('src/styles')
  .filter((n) => /^lot(-[a-z]+)?\.css$/.test(n))
  .map((n) => readFileSync(`src/styles/${n}`, 'utf8'))
  .join('\n');

function block(start: string): string {
  const i = css.indexOf(start);
  if (i < 0) throw new Error(`${start} fehlt in index.css`);
  return css.slice(i, css.indexOf('}', i));
}

const HELL = block(':root {');
const DUNKEL = block(":root[data-theme='dark'] {");

function wert(satz: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(satz);
  if (!m) throw new Error(`${name} fehlt`);
  return m[1];
}

describe.each([
  ['hell', HELL],
  ['dunkel', DUNKEL],
])('Der %se Satz', (_name, satz) => {
  const t = (n: string) => wert(satz, n);

  it('Text und Nebentext tragen auf Fläche und Grund', () => {
    for (const text of ['--text', '--text-muted', '--ink-deep', '--accent-deep']) {
      expect(kontrast(t(text), t('--surface'))!, text).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(kontrast(t(text), t('--bg'))!, text).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('Achtung und Fehler sind auf Fläche und eigener Fläche lesbar', () => {
    for (const ton of ['--warning', '--danger']) {
      expect(kontrast(t(ton), t('--surface'))!, ton).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(kontrast(t(ton), t(`${ton}-bg`))!, ton).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('die Hauptknöpfe tragen ihre Schrift', () => {
    expect(kontrast(t('--brand'), t('--brand-fg'))!).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('die Navigation ist lesbar, auch die Gruppenüberschriften', () => {
    for (const text of ['--navi-text', '--navi-gruppe']) {
      expect(kontrast(t(text), t('--navi'))!, text).toBeGreaterThanOrEqual(AA_NORMAL);
    }
    expect(kontrast('#ffffff', t('--navi-tief'))!).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('der Platzhalter bleibt lesbar', () => {
    expect(kontrast(t('--text-placeholder'), t('--surface'))!).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('Der dunkle Satz', () => {
  it('gilt nur am Bildschirm — gedruckt wird hell', () => {
    const vor = css.slice(0, css.indexOf(":root[data-theme='dark']"));
    expect(vor.trimEnd().endsWith('@media screen {')).toBe(true);
  });

  it('schlägt die Hausfarben des Betriebs, die als Inline-Stil kommen', () => {
    // `applyBranding` setzt sie am Dokument; ohne !important blieben sie.
    for (const n of ['--brand', '--brand-fg', '--accent', '--accent-fg']) {
      expect(DUNKEL).toMatch(new RegExp(`${n}: #[0-9a-f]{6} !important;`));
    }
  });

  it('Gegenprobe: der helle Satz lässt die Hausfarben überschreiben', () => {
    expect(HELL).not.toMatch(/!important/);
  });
});

describe('Die Bausteine halten die Regeln der Linie (Protokoll 0.2)', () => {
  const ohneKommentare = lot.replace(/\/\*[\s\S]*?\*\//g, '');

  it.each([
    ['clamp()', /clamp\(/],
    ['calc()', /calc\(/],
    ['Container-Abfragen', /@container|container-type|cq[iwhb]/],
    ['Positionsselektoren', /:(nth|first|last|only)-(child|of-type)/],
    ['gestrichelte Linien', /dashed|dotted/],
    ['Abfragen ausser auf die Breite', /@media(?![^{]*width)[^{]*\{/],
  ])('kein %s', (_was, muster) => {
    expect(ohneKommentare).not.toMatch(muster);
  });

  it('halbtransparent ist nur der neutrale Schleier', () => {
    const transparent = ohneKommentare.match(/#[0-9a-fA-F]{8}\b|rgba\(|hsla\(|transparent\)/g) ?? [];
    expect(transparent.filter((t) => t !== '#00000059')).toEqual([]);
  });
});

describe('Die schmale Leiste am Tablet', () => {
  it('blendet den langen Namen nur sichtbar aus — die Vorlesehilfe hört ihn weiter', () => {
    const regel = /\.navi-text-lang \{([^}]*)\}/.exec(lot)![1];
    // Mit `display: none` hätte der Menüpunkt keinen Namen (der Kurztext ist aria-hidden).
    expect(regel).not.toMatch(/display:\s*none/);
    expect(regel).toMatch(/clip: rect\(0, 0, 0, 0\)/);
  });
});

/*
  WEISS AUF EINER FLÄCHE AUS DEN GRUNDWERTEN. Ein Ton, der im hellen Satz
  dunkel ist, kann im dunklen Satz hell sein (`--accent-deep` trägt dort
  Text auf dunklem Grund). Weisse Schrift oder ein weisser Haken darauf
  verschwindet dann — und weil der dunkle Satz nur auf Wahl gilt, fiele es
  niemandem auf. 3:1 ist die Grenze für Bedienelemente und Zeichen
  (WCAG 2.1, 1.4.11); darunter ist es unlesbar.
*/
describe('Weiss steht nur auf Flächen, die es in beiden Sätzen tragen', () => {
  const MINDESTENS = 3;
  const tsx = (function alle(ordner: string): string[] {
    return readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? alle(`${ordner}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${ordner}/${e.name}`] : [],
    );
  })('src');

  /** `bg-accent-deep` → `--accent-deep`; Tailwinds `ink` heisst in den Grundwerten `--text`. */
  const variable = (klasse: string) => `--${klasse.replace(/^ink$/, 'text').replace(/^ink-/, 'text-')}`;

  /** Je Zeichenkette mit `text-white` die Flächen (`bg-…`) daneben. */
  function flaechenMitWeiss(text: string): string[] {
    const funde: string[] = [];
    for (const [, , inhalt] of text.matchAll(/(['"`])([^'"`]*?)\1/g)) {
      if (!/(^|\s|:)text-white\b/.test(inhalt)) continue;
      for (const [, name] of inhalt.matchAll(/(?:^|\s|:)bg-([a-z][a-z0-9-]*)/g)) {
        if (!['white', 'black', 'transparent'].includes(name)) funde.push(name);
      }
    }
    return funde;
  }

  it('Gegenprobe: die Suche findet die Fläche neben weisser Schrift', () => {
    expect(flaechenMitWeiss(`x ? 'bg-accent-deep text-white' : 'text-ink'`)).toEqual(['accent-deep']);
    expect(flaechenMitWeiss(`'hover:bg-navi-tief hover:text-white'`)).toEqual(['navi-tief']);
    // Im dunklen Satz ist `--accent-deep` hell: Weiss darauf fällt durch.
    expect(kontrast('#ffffff', wert(DUNKEL, '--accent-deep'))!).toBeLessThan(MINDESTENS);
  });

  it.each([
    ['hell', HELL],
    ['dunkel', DUNKEL],
  ])('in den Seiten (%s)', (_n, satz) => {
    const zuWenig = tsx.flatMap((p) =>
      flaechenMitWeiss(readFileSync(p, 'utf8'))
        .map((name) => [p, name, kontrast('#ffffff', wert(satz, variable(name)))!] as const)
        .filter(([, , k]) => k < MINDESTENS)
        .map(([p2, name, k]) => `${p2}: bg-${name} ${k.toFixed(2)}:1`),
    );
    expect(zuWenig).toEqual([]);
  });

  it.each([
    ['hell', HELL],
    ['dunkel', DUNKEL],
  ])('das angehakte Kästchen (%s) — sein Haken ist weiss', (_n, satz) => {
    const regel = /\.checkbox:checked \{([^}]*)\}/.exec(css)![1];
    const name = /background-color: var\((--[a-z-]+)\)/.exec(regel)![1];
    expect(kontrast('#ffffff', wert(satz, name))!).toBeGreaterThanOrEqual(MINDESTENS);
  });
});
