import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mitarbeiterübersicht, Testbericht Runde 6 — was die Stilregeln festlegen.
 *
 * G13: kommende Tage (`.st-zukunft`) sahen aus wie „frei“ (weiß mit Rand).
 * G8: am Tablet liefen „Saldo Monat“ und „Gesamtsaldo“ über ihre Spalte und
 * standen dadurch links über den rechtsbündigen Zahlen.
 *
 * jsdom rechnet keine Stile; geprüft werden die Regeln selbst.
 */
const css = readFileSync(join(process.cwd(), 'src/styles/lot-uebersicht.css'), 'utf8');

/** Der Rumpf der ersten Regel mit genau diesem Selektor. */
function regel(selektor: string, ab = 0): string {
  const i = css.indexOf(`${selektor} {`, ab);
  expect(i, selektor).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
}
const wert = (rumpf: string, eigenschaft: string) =>
  new RegExp(`(?:^|;)\\s*${eigenschaft}:\\s*([^;]+)`).exec(rumpf)?.[1].trim();

describe('G13 — kommende Tage im Streifen', () => {
  it('haben einen eigenen Ton, anders als „frei“ und als „gebucht“', () => {
    const zukunft = wert(regel('.st-zukunft'), 'background');
    expect(zukunft).toBe('var(--petrol-hell)');
    expect(zukunft).not.toBe(wert(regel('.st-frei'), 'background'));
    expect(zukunft).not.toBe(wert(regel('.st-ok'), 'background'));
    // Die Legende zeigt dieselbe Farbe.
    expect(wert(regel('.leg-zukunft'), 'background')).toBe(zukunft);
  });

  it('nur Grundwerte: keine halbtransparente Fläche, keine Strichelung', () => {
    for (const r of [regel('.st-zukunft'), regel('.leg-zukunft')]) {
      expect(r).not.toMatch(/rgba|hsla|transparent|opacity|dashed|dotted|#[0-9a-f]{3,8}\b/i);
    }
  });
});

describe('G8 — die Köpfe der Zahlen', () => {
  it('brechen ab dem Tablet am Leerzeichen oder an der weichen Trennstelle um, statt überzulaufen', () => {
    const ab = css.indexOf('@media (min-width: 760px) {\n    .ue-kopf-person');
    expect(ab).toBeGreaterThan(0);
    const kopf = regel('.ue-kopf-zahl', ab);
    expect(wert(kopf, 'white-space')).toBe('normal');
    expect(wert(kopf, 'overflow-wrap')).toBe('normal');
    expect(wert(kopf, 'hyphens')).toBe('manual');
    expect(wert(kopf, 'display')).toBe('block');
  });

  it('Gegenprobe: rechtsbündig über den Zahlen bleiben sie', () => {
    expect(wert(regel('.ue-kopf-zahl'), 'text-align')).toBe('right');
  });
});
