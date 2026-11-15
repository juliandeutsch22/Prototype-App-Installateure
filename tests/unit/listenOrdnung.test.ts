import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LISTEN IN FESTER ORDNUNG (Durchsicht 15.11.2026, U11–U13).
 *
 * jsdom rechnet kein Layout; geprüft werden die Regeln selbst, wie in
 * `tests/components/UebersichtRunde6.test.tsx`. Jede Prüfung läuft als
 * Funktion über den Stiltext, damit die Gegenprobe den alten Stand als Text
 * hineingeben kann.
 */
const lies = (pfad: string) => readFileSync(pfad, 'utf8');

/** Der Rumpf der ersten Regel mit genau diesem Selektor, ab `ab` (etwa einer Medienabfrage). */
function regel(css: string, selektor: string, ab = 0): string | undefined {
  const i = css.indexOf(`${selektor} {`, ab);
  if (i < 0) return undefined;
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
}
const wert = (rumpf: string | undefined, eigenschaft: string) =>
  rumpf === undefined ? undefined : new RegExp(`(?:^|;)\\s*${eigenschaft}:\\s*([^;]+)`).exec(rumpf)?.[1].trim();

/** Wo die Medienabfrage beginnt — die Regel danach gilt nur in ihr. */
const medien = (css: string, abfrage: string) => css.indexOf(`@media (${abfrage}) {\n    .`);

describe('U11 · Baustellenliste: Zustand und Budget in fester Anordnung', () => {
  function festeOrdnung(css: string): boolean {
    const handy = medien(css, 'max-width: 1199px');
    if (handy < 0) return false;
    const stand = regel(css, '.baustellen-gruppe .zeile-gestapelt > .zeile-stand', handy);
    const budget = regel(css, '.baustellen-gruppe .zeile-gestapelt > .zeile-stand > .zeile-wert', handy);
    const zustaende = regel(css, '.baustellen-gruppe .zeile-gestapelt > .zeile-stand .zeile-zustand');
    return wert(stand, 'display') === 'grid'
      && wert(stand, 'grid-template-columns') === 'minmax(0, 1fr) auto'
      && wert(budget, 'grid-column') === '2'
      && wert(budget, 'text-align') === 'right'
      && wert(zustaende, 'flex-direction') === 'column';
  }

  it('die Zustände untereinander links, das Budget immer rechts', () => {
    expect(festeOrdnung(lies('src/styles/lot-auftraege.css'))).toBe(true);
    // Die Regel greift nur, wenn die Liste ihre Gruppen so nennt.
    expect(lies('src/features/projects/AdminProjectsView.tsx')).toContain('<section key={status} aria-label={status} className="baustellen-gruppe">');
  });

  it('Gegenprobe: der alte Stand (Zustand und Wert im Fluss) fiele auf', () => {
    const alt = `.zeile-gestapelt > .zeile-stand { grid-area: stand; display: flex; flex-wrap: wrap; }
  .zeile-gestapelt .zeile-stand .zeile-wert { text-align: left; }`;
    expect(festeOrdnung(alt)).toBe(false);
  });

  it('bleibt gleich: Lager und Rechnungen behalten ihre gestapelten Zeilen (Maßlinie unter dem Zustand)', () => {
    const allgemein = lies('src/index.css');
    expect(wert(regel(allgemein, '.zeile-gestapelt .zeile-stand .zeile-wert'), 'text-align')).toBe('left');
    // Keine allgemeine Regel, die den Wert neben den Zustand zwingt.
    expect(allgemein).not.toMatch(/\.zeile-gestapelt > \.zeile-stand[^{]*\{[^}]*display:\s*grid/);
    expect(allgemein).not.toContain('.zeile-gestapelt .zeile-stand .zeile-zustand { flex-direction: column');
  });
});
