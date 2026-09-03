// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { darfStillUebernehmen } from '@/lib/sw';

/**
 * Die Bedingung, unter der die App eine neue Fassung OHNE Rueckfrage
 * uebernimmt — und damit von selbst neu laedt.
 *
 * WARUM DAS GEPRUEFT GEHOERT. Ein selbsttaetiges Neuladen ist der einzige
 * Weg, auf dem die App einem Monteur mitten in der Arbeit etwas wegnehmen
 * kann: die halb erfasste Zeit, die gerade geleistete Unterschrift. Und faellt
 * der Schleifenschutz aus, laedt das Telefon in Dauerschleife neu und ist
 * unbenutzbar. Beide Ausgaenge waeren auf einer Baustelle nicht zu erklaeren.
 *
 * Deshalb steht hier genau eine Frage: WANN darf es passieren.
 */

const JETZT = Date.now;

beforeEach(() => {
  sessionStorage.clear();
});

describe('still uebernehmen', () => {
  it('darf beim Kaltstart, wenn niemand etwas angefasst hat', () => {
    expect(darfStillUebernehmen(JETZT(), false)).toBe(true);
  });

  it('darf NICHT, sobald jemand getippt hat', () => {
    // Der wichtigste Fall: wer schon in einem Formular steht, verliert seine
    // Eingabe. Auch in der ersten Sekunde nicht.
    expect(darfStillUebernehmen(JETZT(), true)).toBe(false);
  });

  it('darf NICHT mehr, wenn die App laengst laeuft', () => {
    // Dann ist es kein Kaltstart mehr, sondern ein Fortsetzen — dort wird
    // gefragt, weil eine begonnene Arbeit auf dem Spiel stehen kann.
    expect(darfStillUebernehmen(JETZT() - 60_000, false)).toBe(false);
  });

  it('darf pro Sitzung nur EINMAL', () => {
    /**
     * DER SCHWERWIEGENDE FALL. Uebernaehme die App still und faende danach
     * denselben Unterschied erneut, liefe das Telefon in eine Schleife aus
     * Neuladen und Neuladen. Der Merker ueberlebt das Neuladen (Sitzung),
     * die Uhr nicht — er ist also der einzige wirksame Schutz.
     */
    expect(darfStillUebernehmen(JETZT(), false)).toBe(true);
    expect(darfStillUebernehmen(JETZT(), false)).toBe(false);
  });

  it('darf NICHT, wenn die Sitzung nichts merken kann', () => {
    // Privates Fenster, abgeschaltete Website-Daten: ohne Merker gibt es
    // keinen Schleifenschutz — dann lieber fragen.
    const echt = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('gesperrt');
      },
    });
    try {
      expect(darfStillUebernehmen(JETZT(), false)).toBe(false);
    } finally {
      if (echt) Object.defineProperty(window, 'sessionStorage', echt);
    }
  });
});
