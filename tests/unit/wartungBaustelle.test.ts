import { describe, it, expect } from 'vitest';
import { nummerFrei } from '@/features/maintenance/wartungBaustelle';

/**
 * Aus einer fälligen Wartung eine Baustelle machen.
 *
 * Die Wartungsliste sagte, was fällig ist, und hörte dort auf. Alles Weitere
 * lief von Hand — und die Liste kannte den Fortschritt nicht: „fällig" hiess
 * sowohl „noch nichts passiert" als auch „steht längst im Einsatzplan".
 */

describe('Die Prüfung auf eine freie Nummer', () => {
  /*
    SIE STEHT HINTER DEM ZÄHLER. Wer die vorgeschlagene Nummer überschreibt,
    geht am Zähler vorbei — und kann eine erwischen, die es schon gibt. Zwei Baustellen mit derselben Nummer wären der teuerste
    Fehler dieser Kette: Zeiten, Scheine und Rechnungen hängen an der Nummer,
    nicht an der Dokument-ID.
  */
  it('erkennt eine schon vergebene Nummer', () => {
    expect(nummerFrei('2026-014', ['2026-014'])).toBe(false);
  });

  it('lässt sich von Leerraum und Großschreibung nicht täuschen', () => {
    expect(nummerFrei(' w-2026-3 ', ['W-2026-3'])).toBe(false);
  });

  it('hält eine leere Nummer nicht für frei', () => {
    expect(nummerFrei('   ', [])).toBe(false);
  });

  it('gibt eine wirklich freie Nummer frei', () => {
    expect(nummerFrei('2026-015', ['2026-014'])).toBe(true);
  });
});
