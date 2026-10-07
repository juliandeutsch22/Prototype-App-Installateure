/**
 * Die Grundwerte der Linie „Lot“ — hell und dunkel lesbar.
 *
 * Geprüft wird, was eine Farbe auf ihrer Fläche leisten muss (WCAG 2.1 AA,
 * Protokoll Abschnitt 4.3), und zwar in BEIDEN Sätzen: der dunkle wird nur
 * auf Wahl gezeigt und fiele sonst niemandem auf, bis ihn jemand einschaltet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kontrast, AA_NORMAL } from '@/lib/kontrast';

const css = readFileSync('src/index.css', 'utf8');
const lot = readFileSync('src/styles/lot.css', 'utf8');

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
    const transparent = ohneKommentare.match(/#[0-9a-fA-F]{8}\b|rgba\(/g) ?? [];
    expect(transparent).toEqual(['#00000059', '#00000059']);
  });
});
