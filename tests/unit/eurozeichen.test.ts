import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { euro, euroBetrag, euroGerundet, euroPreis } from '@/lib/betrag';

/**
 * „€ 22 104,60 €" — das Zeichen stand zweimal da.
 *
 * GESEHEN AUF EINEM TELEFON, NICHT IM QUELLTEXT. Auf der Mahnlauf-Karte stand
 * „€ 22 104,60 € offen"; sechs Stellen in `InvoicesView` hängten ein zweites
 * Eurozeichen an einen Betrag, der es schon trug.
 *
 * DER GRUND WAR DER NAME. `fmtEUR` gab es in elf Dateien, mal mit
 * vorangestelltem Zeichen, mal ohne. Seit dem 28.09.2026 (offene Punkte B9)
 * steht der Formatierer an EINER Stelle, `src/lib/betrag.ts`, und jede Form
 * hat ihren eigenen Namen: `euro` (mit Zeichen), `euroBetrag` (nur die Zahl),
 * `euroGerundet` (mit Zeichen, ganze Euro), `euroPreis` (mit Zeichen, bis vier
 * Nachkommastellen). Diese Prüfung hält beides fest:
 * dass keine Kopie zurückkommt, und dass kein Aufruf ein zweites Zeichen setzt.
 */

function quellen(): string[] {
  const roh = execSync('grep -rl "" --include=*.ts --include=*.tsx src/', { encoding: 'utf8' });
  return roh.split('\n').filter(Boolean);
}

describe('Die vier Formen', () => {
  it('euro stellt das Zeichen voran', () => {
    expect(euro(22104.6)).toMatch(/^€ 22.104,60$/);
  });
  it('euroBetrag ist nur die Zahl', () => {
    expect(euroBetrag(60)).toBe('60,00');
  });
  it('euroGerundet rundet auf ganze Euro', () => {
    expect(euroGerundet(1234.56)).toMatch(/^€ 1.235$/);
  });
  it('euroPreis zeigt bis zu vier Nachkommastellen, mindestens zwei', () => {
    expect(euroPreis(0.4375)).toBe('€ 0,4375');
    expect(euroPreis(12.5)).toBe('€ 12,50');
  });
});

describe('Das Eurozeichen steht genau einmal da', () => {
  const dateien = quellen();

  it('es gibt keine eigene Kopie des Formatierers mehr', () => {
    // Unter altem Namen, unter kurzem Namen und als Währungsformat von Hand.
    const kopie = /(const|function)\s+(fmtEUR|eur)\b|currency:\s*'EUR'/;
    const kopien = dateien.filter((p) => p !== 'src/lib/betrag.ts' && kopie.test(readFileSync(p, 'utf8')));
    expect(kopien).toEqual([]);
  });

  it('die Prüfung hat etwas zu prüfen — sonst meldete sie grün ins Leere', () => {
    const mitAufruf = dateien.filter((p) => /\beuro(Gerundet|Preis)?\(/.test(readFileSync(p, 'utf8')));
    expect(mitAufruf.length).toBeGreaterThanOrEqual(5);
  });

  it.each(quellen().filter((p) => p !== 'src/lib/betrag.ts'))(
    'in %s setzt kein Aufruf ein zweites Zeichen',
    (pfad) => {
      const quelle = readFileSync(pfad, 'utf8');
      /*
        Dahinter — in JSX (`{euro(x)} €`) wie im Textbaustein (`${euro(x)} €`),
        beides kam vor — und davor (`€ ${euro(x)}`).
      */
      const dahinter = [...quelle.matchAll(/\beuro(?:Gerundet|Preis)?\([^)]*\)[}`]?\s*€/g)].map((m) => m[0]);
      const davor = [...quelle.matchAll(/€\s*[{$]*\{?\s*euro(?:Gerundet|Preis)?\(/g)].map((m) => m[0]);
      expect([...dahinter, ...davor], `„${dahinter[0] ?? davor[0]}“ in ${pfad}`).toEqual([]);
    },
  );
});
