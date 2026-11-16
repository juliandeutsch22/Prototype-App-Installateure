import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { wortfugen } from '@/lib/wortfugen';

/*
  KEIN LOOKBEHIND IM AUSGELIEFERTEN CODE (Durchsicht 15.11.2026, Befund aus
  F13). Die App baut für safari14 (`vite.config.ts`); ein `(?<=` oder `(?<!`
  ist auf iPhones vor Safari 16.4 schon beim Laden des Bausteins ein
  Syntaxfehler — als Literal sofort, in `new RegExp` beim ersten Aufruf.
  Geprüft werden alle Quellen, die in die App gebaut werden: `src/` und
  `shared/`. Die Prüfungen selbst dürfen Lookbehind benutzen (sie laufen in
  Node).
*/

const LOOKBEHIND = /\(\?<[=!]/;

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return dateien(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

function funde(quelle: string): number[] {
  return quelle.split('\n').flatMap((zeile, i) => (LOOKBEHIND.test(zeile) ? [i + 1] : []));
}

describe('Kein Lookbehind in src/ und shared/', () => {
  const quellen = ['src', 'shared'].flatMap((o) => dateien(join(process.cwd(), o)));

  it('findet die Quellen überhaupt', () => {
    expect(quellen.length).toBeGreaterThan(300);
    expect(quellen.some((q) => q.endsWith('wortfugen.ts'))).toBe(true);
  });

  it('kein Regex-Literal und kein new RegExp mit (?<= oder (?<!', () => {
    const treffer = quellen.flatMap((q) => funde(readFileSync(q, 'utf8')).map((z) => `${relative(process.cwd(), q)}:${z}`));
    expect(treffer).toEqual([]);
  });

  it('Gegenprobe: ein Literal und ein new RegExp mit Lookbehind fielen auf', () => {
    expect(funde("const a = /(?<![A-Z])RE/;\nconst b = new RegExp(`(?<=x)y`);\nconst c = /(?:^|[^A-Z])RE/;")).toEqual([1, 2]);
  });
});

/*
  BLEIBT GLEICH: `wortfugen` ohne Lookbehind ergibt dasselbe wie vorher. Die
  alte Zahlenregel steht hier (in Node läuft das Lookbehind) und wird über
  viele Fälle mit der neuen Fassung verglichen.
*/
describe('wortfugen bleibt gleich', () => {
  const WV = '⁠';
  const NB = ' ';
  const alteZahlen = (t: string) => t.replace(/(?<![\p{L}\d-])(\d{1,4}[a-z]?)(\s*)([–-])(\s*)(\d{1,4}[a-z]?)(?![\p{L}\d-])/gu,
    (_, von: string, l1: string, strich: string, l2: string, bis: string) => `${von}${l1 ? NB : WV}${strich}${l2 ? NB : WV}${bis}`);
  const FAELLE = [
    'Hauptstraße 12–14', '12-14', 'Gasse 3a - 5', 'B-2026-0001', 'RE-2026-1001 / 12–14', 'Top 1-3, Stiege 2–4',
    '12–14–16', 'a12-14', '12-14b', 'Wohnungseigentümergemeinschaft Hauptstraße 12-14', '1-2 3-4 5-6', '-12-14', '2026-0001',
    'Nr.12–14', '(12-14)', '12 – 14', 'Mitarbeiterübersicht', '', '7',
  ];
  it.each(FAELLE)('„%s“', (t) => {
    // Die alte Fassung: erst die Wortfugen (unverändert), dann die Zahlenregel mit Lookbehind.
    const erwartet = alteZahlen(t.replace(/[\p{L}]+/gu, (w) => wortfugen(w)));
    expect(wortfugen(t)).toBe(erwartet);
  });
});
