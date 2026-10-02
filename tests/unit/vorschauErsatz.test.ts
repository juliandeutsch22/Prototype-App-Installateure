import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Die handgeschriebenen Ersatzmodule der Vorschau tragen jeden Export ihres
 * Vorbilds.
 *
 * Am 02.10.2026 fehlte `kontoUmstellen` in `tools/vorschau/sitzung.ts`. Vite
 * brach darauf die Abhängigkeitssuche ab, die Vorschau lud sich beim ersten
 * Aufruf neu, und die Linkprüfung in der CI scheiterte an einer
 * abgebrochenen Navigation — eine Rolle von sechs, je nach Reihenfolge. Die
 * Datenschicht erzeugt `stubs-erzeugen.mjs` aus den Quellen; diese beiden
 * nicht, darum hier.
 */

function exporte(pfad: string): string[] {
  const text = readFileSync(pfad, 'utf8');
  return [...text.matchAll(/^export (?:async )?(?:function|const|class) ([A-Za-z0-9_]+)|^export \{ ([A-Za-z0-9_, ]+) \}/gm)]
    .flatMap((m) => (m[1] ? [m[1]] : m[2].split(',').map((t) => t.trim())))
    .sort();
}

describe('Ersatzmodule der Vorschau', () => {
  for (const [vorbild, ersatz] of [
    ['src/lib/auth/sitzung.ts', 'tools/vorschau/sitzung.ts'],
    ['src/lib/auth/provisionUser.ts', 'tools/vorschau/provisionUser.ts'],
  ]) {
    it(`${ersatz} trägt jeden Export von ${vorbild}`, () => {
      const fehlt = exporte(vorbild).filter((x) => !exporte(ersatz).includes(x));
      expect(fehlt).toEqual([]);
    });
  }

  it('Gegenprobe: die Suche findet die Exporte überhaupt', () => {
    expect(exporte('src/lib/auth/sitzung.ts')).toEqual(expect.arrayContaining(['anmelden', 'kontoUmstellen', 'InactiveUserError']));
  });
});
