import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
  DER FOKUS IST SCHLANK (E75, 10.11.2026). Ein Feld im Fokus ist eine Linie in
  Petrol — kein Hof, kein zweiter Ring außen herum; eine Zeile zeigt den Fokus
  nur mit der Tastatur, 2 px nach außen, nie über ihrem Text. Gemessen wird
  das im Browser (`fokusRahmen.spec.ts`); hier steht, dass keine Einzelstelle
  den Ring oder den Rahmen nach innen wieder einführt.
  Gegenprobe: mit dem Stand vor E75 sind alle vier Prüfungen rot.
*/
const alle = (ordner: string, endung: RegExp): string[] =>
  readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? alle(p, endung) : endung.test(p) ? [p] : [];
  });
const STILE = ['src/index.css', ...alle('src/styles', /\.css$/)].map((p) => ({ p, q: readFileSync(p, 'utf8') }));
const QUELLEN = alle('src', /\.tsx?$/).map((p) => ({ p, q: readFileSync(p, 'utf8') }));

describe('Fokus schlank (E75)', () => {
  it('ein Feld im Fokus: nur der Rand färbt sich', () => {
    const index = readFileSync('src/index.css', 'utf8');
    expect(index).toContain('input:focus,\nselect:focus,\ntextarea:focus {\n  outline: none;\n  border-color: var(--brand-fixed);\n  box-shadow: none;\n}');
  });

  it('kein Feld trägt einen Ring dazu — weder in Tailwind noch in den Stilen', () => {
    const mitRing = QUELLEN.filter(({ q }) => /focus:ring-|focus-within:ring-/.test(q)).map(({ p }) => p);
    expect(mitRing).toEqual([]);
    // Ein Ring außen um ein Feld mit Lupe oder um die Eingabe der Nachrichten.
    const aussen = STILE.filter(({ q }) => /:has\((input|\.eingabe-feld):focus-visible\)\s*\{[^}]*outline/.test(q)).map(({ p }) => p);
    expect(aussen).toEqual([]);
    // Ein Schatten als zweite Linie, wenn ein Feld den Fokus hat.
    const schatten = STILE.flatMap(({ p, q }) => q.split('\n').filter((z) => /:focus(-within)?\b[^{]*\{[^}]*box-shadow: 0 0 0/.test(z)).map((z) => `${p}: ${z.trim()}`));
    expect(schatten).toEqual([]);
  });

  it('eine Zeile zeigt den Fokus nur mit der Tastatur und nach außen', () => {
    const index = readFileSync('src/index.css', 'utf8');
    expect(index).toContain('.zeile-ganz:has(.zeile-ziel:focus-visible) { outline: 2px solid var(--accent-deep); outline-offset: 0; background: var(--petrol-hell); }');
    expect(index).not.toMatch(/\.zeile-ganz:focus-within/);
    const nachrichten = readFileSync('src/styles/lot-nachrichten.css', 'utf8');
    expect(nachrichten).toContain('.postfach-zeile:has(.postfach-titel:focus-visible) { outline: 2px solid var(--accent-deep); outline-offset: 0; }');
    expect(nachrichten).not.toMatch(/\.postfach-zeile:focus-within/);
  });

  it('keine Zeile zeichnet ihren Rahmen nach innen über den Text', () => {
    const innen = STILE.flatMap(({ p, q }) => q.split('\n')
      .filter((z) => /(zeile|start-zeile)[^{]*:(focus|has)[^{]*\{[^}]*outline-offset: -/.test(z))
      .map((z) => `${p}: ${z.trim()}`));
    expect(innen).toEqual([]);
    expect(QUELLEN.filter(({ q }) => /start-zeile[^"]*focus-visible:-outline-offset/.test(q)).map(({ p }) => p)).toEqual([]);
  });
});
