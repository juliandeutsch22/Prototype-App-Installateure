import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * L10 (Plan 15.11.2026): kein weißer Blitz beim Kaltstart, Schriften vorab.
 *
 * Gemessen (Bau, langsames 4G, 390 px, je drei Läufe): erstes Bild 1,19 s →
 * 0,30 s, auf Papierfarbe; die Schriften angefragt bei 1,76 s → 0,20 s und
 * fertig bei 2,31 s → 0,79 s. Der erste Inhalt kommt 0,17 s später (die
 * 28 KB Schrift teilen sich die Leitung), dafür gleich in der richtigen
 * Schrift — vorher tauschte sie 0,55 s danach sichtbar.
 *
 * GEGENPROBE (Erwartung): ohne `startStil` in vite.config.ts und ohne die
 * Farbe am <html> sind die ersten drei Prüfungen rot.
 */
const configPfad = '../../vite.config.ts';
const vite = (await import(/* @vite-ignore */ configPfad)) as {
  default: { plugins: Plugin[] };
  startStilEinsetzen: (html: string, schriften: string[]) => string;
};
const { startStilEinsetzen } = vite;

const KOPF = '<head><title>Senklot</title>' +
  '<link rel="modulepreload" crossorigin href="/assets/react-a.js">' +
  '<link rel="stylesheet" crossorigin href="/assets/index-a.css"></head>';

describe('Start-Stil', () => {
  it('das Stylesheet sperrt das erste Bild nicht mehr: vorab geladen, eingeschaltet von der App', () => {
    const html = startStilEinsetzen(KOPF, []);
    expect(html).toContain('<link rel="preload" as="style" crossorigin href="/assets/index-a.css">');
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/index-a.css" media="print" data-hauptstil>');
    expect(html).not.toContain('<link rel="stylesheet" crossorigin href="/assets/index-a.css">');
  });

  it('DM Sans normal und mittel werden vorab geladen — andere Schriften nicht', () => {
    const html = startStilEinsetzen(KOPF, [
      'assets/dm-sans-latin-500-normal-B9H.woff2', 'assets/dm-sans-latin-400-normal-CW0.woff2',
      'assets/dm-sans-latin-400-normal-Bw.woff', 'assets/source-serif-4-latin-400-normal-DJ5.woff2', 'assets/index-a.js',
    ]);
    expect(html.match(/<link rel="preload" as="font"[^>]*>/g)).toEqual([
      '<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/dm-sans-latin-400-normal-CW0.woff2">',
      '<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/dm-sans-latin-500-normal-B9H.woff2">',
    ]);
  });

  it('hängt am Bau', () => {
    const p = vite.default.plugins.find((x) => x && (x as Plugin).name === 'start-stil') as Plugin | undefined;
    expect(p?.apply).toBe('build');
  });

  it('bleibt gleich: ohne Stylesheet und ohne Schriften ändert sich nichts', () => {
    const ohne = '<head><title>x</title><script type="module" src="/src/main.tsx"></script></head>';
    expect(startStilEinsetzen(ohne, [])).toBe(ohne);
  });
});

describe('Die Papierfarbe vor jedem Stylesheet', () => {
  const css = readFileSync(join(__dirname, '../../src/index.css'), 'utf8');
  const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');

  it('steht als Attribut am <html> — dieselbe Farbe wie der Grund der App (--bg, hell)', () => {
    const grund = css.match(/--bg:\s*(#[0-9a-fA-F]{6})\s*;/)![1];
    expect(html).toMatch(new RegExp(`<html lang="de" style="background-color:${grund}">`, 'i'));
  });

  it('als Attribut, nicht als <style>: die Inhaltsregel erlaubt Stil nur im Attribut ohne Hash', () => {
    const regel = JSON.parse(readFileSync(join(__dirname, '../../firebase.json'), 'utf8')).hosting.headers[0].headers
      .find((k: { key: string }) => k.key === 'Content-Security-Policy').value as string;
    expect(regel).toContain("style-src-attr 'unsafe-inline'");
    expect(regel).toContain("style-src-elem 'self'");
    expect(html).not.toMatch(/<style[\s>]/);
  });
});
