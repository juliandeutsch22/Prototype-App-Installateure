import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { betrag, euro, euroGanz } from '@/lib/geld';

/**
 * „€ 22 104,60 €" — das Zeichen stand zweimal da.
 *
 * GESEHEN AUF EINEM TELEFON, NICHT IM QUELLTEXT. Auf der Mahnlauf-Karte stand
 * „€ 22 104,60 € offen"; sechs Stellen in `InvoicesView` hängten ein zweites
 * Eurozeichen an einen Betrag, der es schon trug.
 *
 * DER GRUND WAR DER NAME. `fmtEUR` gab es in elf Dateien, mal mit
 * vorangestelltem „€“, mal ohne. Seit dem 25.09.2026 gibt es EINEN Ort,
 * `src/lib/geld.ts`, und drei Namen, die sagen, was herauskommt: `betrag`
 * (ohne Zeichen), `euro` (Zeichen vorn), `euroGanz` (Zeichen vorn, ganze
 * Euro). Diese Prüfung hält beides fest: dass keine Kopie zurückkehrt, und
 * dass niemand an `euro(…)` ein zweites Zeichen hängt.
 */

function quellen(): string[] {
  return execSync('grep -rl "" --include=*.ts --include=*.tsx src/', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

describe('Beträge kommen aus einem Ort', () => {
  it('keine Datei hat mehr ein eigenes fmtEUR', () => {
    const kopien = quellen().filter((p) => /const fmtEUR\b/.test(readFileSync(p, 'utf8')));
    expect(kopien).toEqual([]);
  });

  it('die drei Namen tun, was sie sagen', () => {
    // Die Leerzeichen zwischen den Tausendern setzt Intl als geschütztes
    // Leerzeichen — verglichen wird deshalb ohne sie.
    const ohne = (s: string) => s.replace(/\s/g, ' ');
    expect(ohne(betrag(8904))).toBe('8 904,00');
    expect(ohne(euro(8904))).toBe('€ 8 904,00');
    expect(ohne(euroGanz(8904.4))).toBe('€ 8 904');
    expect(betrag(1)).not.toContain('€');
  });
});

describe('Das Eurozeichen steht genau einmal da', () => {
  it.each(quellen())('in %s hängt keine Aufrufstelle ein zweites Zeichen an', (pfad) => {
    const quelle = readFileSync(pfad, 'utf8');
    /*
      Gesucht wird `euro(...)` bzw. `euroGanz(...)` mit einem € unmittelbar
      danach — in JSX (`{euro(x)} €`) wie im Textbaustein (`${euro(x)} €`).
      Beides kam vor. Hinter `betrag(...)` GEHÖRT das Zeichen hin.
    */
    const doppelt = [...quelle.matchAll(/\beuro(?:Ganz)?\([^)]*\)[}`]?\s*€/g)].map((m) => m[0]);
    expect(doppelt, `„${doppelt[0]}" in ${pfad}`).toEqual([]);
  });
});
