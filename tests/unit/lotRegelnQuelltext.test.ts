/**
 * Die Regeln der Linie „Lot“ im Quelltext der Oberfläche (Protokoll 0.2,
 * CLAUDE.md „Oberfläche“). Die Bausteine prüft tests/unit/lotGrundwerte.test.ts;
 * hier geht es um die Klassen an den Seiten selbst.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? dateien(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}

/** Ohne Kommentare — dort dürfen alte Klassen als Begründung stehen. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const QUELLEN = dateien('src').map((p) => [p, ohneKommentare(readFileSync(p, 'utf8'))] as const);

function treffer(muster: RegExp): string[] {
  return QUELLEN.flatMap(([p, text]) => {
    const funde = text.match(new RegExp(muster.source, muster.flags.includes('g') ? muster.flags : `${muster.flags}g`)) ?? [];
    return funde.map((f) => `${p}: ${f}`);
  });
}

describe('Gestaltungsregeln im Quelltext', () => {
  it('keine halbtransparenten Farbflächen, Rahmen oder Ringe', () => {
    expect(treffer(/\b(?:bg|border(?:-[trblxy])?|ring|from|to|via|divide|outline)-[a-z][a-z-]*\/\d+\b/)).toEqual([]);
  });

  it('keine gestrichelten oder gepunkteten Linien', () => {
    expect(treffer(/\b(?:border|divide|outline)-(?:dashed|dotted)\b/)).toEqual([]);
  });

  it('zwei Schriftstärken: normal und halbfett', () => {
    expect(treffer(/\bfont-(?:thin|extralight|light|medium|bold|extrabold|black)\b/)).toEqual([]);
  });

  it('keine Farben ausserhalb der Grundwerte (Tailwind-Paletten)', () => {
    expect(
      treffer(/\b(?:bg|text|border|ring|fill|stroke)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/),
    ).toEqual([]);
  });

  it('keine Emojis', () => {
    expect(treffer(/\p{Extended_Pictographic}/u)).toEqual([]);
  });

  it('Gegenprobe: die Muster greifen', () => {
    expect('bg-brand/30').toMatch(/\b(?:bg|border(?:-[trblxy])?|ring)-[a-z][a-z-]*\/\d+\b/);
    expect('border-dashed').toMatch(/\b(?:border|divide|outline)-(?:dashed|dotted)\b/);
    expect('font-medium').toMatch(/\bfont-(?:thin|extralight|light|medium|bold|extrabold|black)\b/);
    expect('text-gray-500').toMatch(/\b(?:bg|text)-(?:gray)-\d{2,3}\b/);
    expect('✅').toMatch(/\p{Extended_Pictographic}/u);
  });
});
