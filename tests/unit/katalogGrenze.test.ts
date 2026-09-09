import { describe, it, expect } from 'vitest';
import { KATALOG_GRENZE, katalogAbgeschnitten } from '@/lib/katalogGrenze';

/**
 * Die Obergrenze des Materialkatalogs.
 *
 * Sechs Ansichten stellen dieselbe Frage — „ist der Katalog vollständig?" —
 * und eine falsche Antwort sähe an jeder Stelle anders aus: mal eine leere
 * Suche, mal eine zu niedrige Materialkostensumme. Deshalb steht sie an einem
 * Ort und wird hier einmal geprüft.
 */

describe('Wann der Katalog als abgeschnitten gilt', () => {
  it('schweigt, solange die Grenze nicht erreicht ist', () => {
    // Ein von Hand gepflegter Katalog liegt bei einigen hundert Artikeln. Ein
    // Hinweis, der dort erschiene, wäre täglicher Lärm.
    expect(katalogAbgeschnitten(new Array(400).fill(0))).toBe(false);
    expect(katalogAbgeschnitten([])).toBe(false);
  });

  it('meldet sich schon AN der Grenze, nicht erst darüber', () => {
    /*
      Genau an der Grenze weiss niemand, ob noch etwas käme — Firestore
      liefert einfach nicht mehr. Lieber einmal zu oft gefragt als einmal zu
      wenig gesagt; dieselbe Lesart wie beim Nachladen der übrigen Listen.
    */
    expect(katalogAbgeschnitten(new Array(KATALOG_GRENZE).fill(0))).toBe(true);
    expect(katalogAbgeschnitten(new Array(KATALOG_GRENZE - 1).fill(0))).toBe(false);
  });

  it('nimmt eine angehobene Grenze an', () => {
    // „Weitere laden" hebt sie an; die Frage muss sich dann auf den neuen
    // Wert beziehen, sonst bliebe der Hinweis für immer stehen.
    expect(katalogAbgeschnitten(new Array(1000).fill(0), 2000)).toBe(false);
    expect(katalogAbgeschnitten(new Array(2000).fill(0), 2000)).toBe(true);
  });

  it('steht bei tausend', () => {
    // Festgehalten, damit eine spätere Änderung eine Entscheidung ist und
    // kein Nebeneffekt.
    expect(KATALOG_GRENZE).toBe(1000);
  });
});
