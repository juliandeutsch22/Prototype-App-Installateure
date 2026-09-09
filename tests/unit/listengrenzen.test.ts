import { describe, it, expect } from 'vitest';
import {
  KATALOG_GRENZE,
  KUNDEN_GRENZE,
  BAUSTELLEN_AUSWAHL_GRENZE,
  abgeschnitten,
  katalogAbgeschnitten,
  kundenAbgeschnitten,
  baustellenAuswahlAbgeschnitten,
} from '@/lib/listengrenzen';

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

/**
 * DIE ANDEREN BEIDEN LISTEN — Kunden und laufende Baustellen.
 *
 * Beide gingen durch den Wächter `abfragegrenzen`, und beide zu Unrecht:
 * `listCustomers` HAT eine Grenze, sagte sie aber nirgends, und
 * `listActiveProjects` galt über den Statusfilter als begrenzt. „Wächst nicht
 * mit der Zeit" ist aber nicht dasselbe wie „ist begrenzt": die Zahl der
 * offenen Baustellen wächst mit dem Betrieb und wird nie wieder kleiner.
 */
describe('Kunden und laufende Baustellen', () => {
  it('teilen dieselbe Rechnung, nur mit anderer Grenze', () => {
    expect(abgeschnitten(new Array(500).fill(0), 500)).toBe(true);
    expect(kundenAbgeschnitten(new Array(KUNDEN_GRENZE).fill(0))).toBe(true);
    expect(
      baustellenAuswahlAbgeschnitten(new Array(BAUSTELLEN_AUSWAHL_GRENZE).fill(0)),
    ).toBe(true);
  });

  it('schweigen bei einem gewöhnlichen Betrieb', () => {
    // Achtzig laufende Baustellen und dreihundert Kunden sind viel für einen
    // Installationsbetrieb — und weit unter beiden Grenzen.
    expect(kundenAbgeschnitten(new Array(300).fill(0))).toBe(false);
    expect(baustellenAuswahlAbgeschnitten(new Array(80).fill(0))).toBe(false);
  });

  it('stehen beide bei fünfhundert', () => {
    // Festgehalten, damit eine spätere Änderung eine Entscheidung ist.
    expect(KUNDEN_GRENZE).toBe(500);
    expect(BAUSTELLEN_AUSWAHL_GRENZE).toBe(500);
    expect(KATALOG_GRENZE).toBe(1000);
  });
});
