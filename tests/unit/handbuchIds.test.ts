/**
 * Jede Kennung im Handbuch kommt genau einmal vor.
 *
 * Mit E48 bekam der neue Abschnitt „Die Plattform in der neuen Linie“ die
 * Kennung eines älteren Abschnitts vom 22. Oktober. Ein Sprung dorthin
 * landete beim falschen, und nichts fiel auf. Gegenprobe: mit dem Handbuch
 * von `659f7fd` ist diese Prüfung rot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Handbuch', () => {
  it('hat keine doppelte Kennung', () => {
    const html = readFileSync(resolve(process.cwd(), 'docs/handbuch/handbuch.html'), 'utf8');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const doppelt = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(doppelt).toEqual([]);
  });
});
