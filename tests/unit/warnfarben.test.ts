import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kontrast, AA_NORMAL } from '@/lib/kontrast';

/**
 * Gelb und Rot — gehören sie zu dieser App?
 *
 * SIE TATEN ES NICHT, und das war messbar. Beide Töne kamen unverändert aus
 * der Tailwind-Vorgabe: `#fef3c7` mit 96 % Sättigung und `#fee2e2` mit 93 %.
 * Jeder Strukturton dieser Oberfläche liegt dagegen im Türkis zwischen 187°
 * und 194°, und selbst das Grün ist mit 63 % in dieses Band gezogen. Die
 * beiden Warnfarben waren damit die zwei gesättigtsten Flächen der ganzen
 * App — in einer Oberfläche, deren Grundentscheidung Ruhe ist.
 *
 * ZWEI PRÜFUNGEN, UND DIE ZWEITE IST DIE WICHTIGERE:
 *
 *   1. Die Flächen bleiben im Band der übrigen Töne. Sonst holt sich jemand
 *      beim nächsten Griff in eine fremde Palette den alten Zustand zurück.
 *   2. Der Kontrast sinkt dabei NICHT. Eine Farbe, die hübscher und
 *      schlechter lesbar ist, wäre in dieser App die falsche Richtung —
 *      gearbeitet wird draussen, im Sommer mit Sonne auf dem Display.
 */

/** Der Wert, wie er wirklich in den Tokens steht — nicht abgeschrieben. */
function token(name: string): string {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const treffer = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!treffer) throw new Error(`${name} steht nicht mehr in src/index.css`);
  return treffer[1];
}

/** Sättigung in Prozent, wie sie ein Farbwähler anzeigt. */
function saettigung(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return Math.round(((max - min) / (1 - Math.abs(2 * l - 1))) * 100);
}

/** Helligkeit in Prozent. */
function helligkeit(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return Math.round(((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100);
}

describe('Die Warnflächen gehören zur Familie', () => {
  it('sind nicht gesättigter als Türkis und Grün', () => {
    /*
      DIE OBERGRENZE IST NICHT GEGRIFFEN, sondern abgelesen: `info-bg` und
      `success-bg` sind die beiden farbigen Flächen, die niemand als
      aufdringlich empfunden hat. Wer Gelb oder Rot darüber hebt, holt sich
      genau den gemeldeten Zustand zurück.
    */
    const grenze = Math.max(saettigung(token('--info-bg')), saettigung(token('--success-bg'))) + 5;

    expect(saettigung(token('--warning-bg'))).toBeLessThanOrEqual(grenze);
    expect(saettigung(token('--danger-bg'))).toBeLessThanOrEqual(grenze);
  });

  it('und Rot wiegt nicht leichter als Gelb', () => {
    /*
      DER FEHLER, DER DIE RANGFOLGE UMDREHTE. Das Gelb stand bei 89 %
      Helligkeit, das Rot bei 94 % — die harmlosere Farbe war die dunklere
      und wog damit optisch schwerer als die dringende. Wer nebeneinander
      eine Warnung und einen Ausfall sieht, soll den Ausfall zuerst sehen.
    */
    expect(helligkeit(token('--danger-bg'))).toBeLessThanOrEqual(helligkeit(token('--warning-bg')));
  });
});

describe('Ruhiger heisst nicht blasser', () => {
  it('der Text trägt auf seiner eigenen Fläche', () => {
    // Vor dem Abstimmen: 4,51 und 5,30. Danach muss es MEHR sein, nicht
    // weniger — sonst ist die schönere Farbe die schlechtere.
    expect(kontrast(token('--warning'), token('--warning-bg'))!).toBeGreaterThanOrEqual(4.6);
    expect(kontrast(token('--danger'), token('--danger-bg'))!).toBeGreaterThanOrEqual(5.4);
  });

  it('und auch auf Weiss und auf dem Grund der Seite', () => {
    /*
      Beide Töne stehen nicht nur in Pillen: sie tragen auch Fliesstext in
      Hinweiskästen und auf den weissen Karten. Eine Farbe, die nur auf
      ihrer eigenen Fläche lesbar ist, wäre hier zu wenig geprüft.
    */
    for (const name of ['--warning', '--danger'] as const) {
      expect(kontrast(token(name), '#ffffff')!).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(kontrast(token(name), token('--bg'))!).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(kontrast(token(name), token('--surface-2'))!).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});
