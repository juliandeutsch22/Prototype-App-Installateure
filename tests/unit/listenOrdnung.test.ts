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

describe('U12 · Zeiterfassung am Schreibtisch: Liste breiter, Formular schmaler', () => {
  function listeBreiter(css: string): boolean {
    const schreibtisch = medien(css, 'min-width: 1200px');
    if (schreibtisch < 0) return false;
    const formular = wert(regel(css, '.zeit-raster-buchen > .zeit-formularkarte', schreibtisch), 'flex');
    const liste = wert(regel(css, '.zeit-raster-buchen > .zeit-liste', schreibtisch), 'flex');
    if (!formular || !liste) return false;
    const [fWachsen, , fBasis] = formular.split(/\s+/);
    const [lWachsen, , lBasis] = liste.split(/\s+/);
    return Number(fWachsen) === 0 && Number(lWachsen) > 0
      && fBasis === '30rem'
      // Nebeneinander ab 1.200 px (D12): 30 + 20 rem passen in die Seite, mehr nicht.
      && parseFloat(lBasis) <= 20;
  }

  it('das Formular wächst nicht über 30 rem, die Liste nimmt den Rest und bleibt ab 1.200 px daneben', () => {
    expect(listeBreiter(lies('src/styles/lot-zeit.css'))).toBe(true);
  });

  it('Gegenprobe: der alte Stand (Formular wächst bis 36 rem) fiele auf, ebenso eine Liste, die bei 1.200 px umbricht', () => {
    expect(listeBreiter(`@media (min-width: 1200px) {
    .zeit-raster-buchen > .zeit-formularkarte { flex: 1 1 30rem; max-width: 36rem; }
    .zeit-raster-buchen > .zeit-liste { flex: 1 1 20rem; }
  }`)).toBe(false);
    expect(listeBreiter(`@media (min-width: 1200px) {
    .zeit-raster-buchen > .zeit-formularkarte { flex: 0 1 30rem; }
    .zeit-raster-buchen > .zeit-liste { flex: 1 1 32rem; }
  }`)).toBe(false);
  });

  it('bleibt gleich: am Tablet und am Handy die alten Maße (eine Spalte)', () => {
    const css = lies('src/styles/lot-zeit.css');
    expect(wert(regel(css, '.zeit-raster-buchen > .zeit-formularkarte'), 'flex')).toBe('1 1 30rem');
    expect(wert(regel(css, '.zeit-raster-buchen > .zeit-formularkarte'), 'max-width')).toBe('36rem');
    expect(wert(regel(css, '.zeit-raster-buchen > .zeit-liste'), 'flex-basis')).toBe('20rem');
  });
});
