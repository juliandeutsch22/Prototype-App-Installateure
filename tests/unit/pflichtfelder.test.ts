import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Der Abgleich zwischen „Pflicht" und „als Pflicht gekennzeichnet".
 *
 * AUS DEM BETRIEB: „bei allen Eingaben sollten Pflichtfelder gekennzeichnet
 * werden." Umgesetzt ist das mit einem Stern am Label (`pflicht`), und die
 * Felder, die es betrifft, tragen bereits `required`.
 *
 * WARUM DAS EIN TEST SEIN MUSS UND KEINE ABSPRACHE. Beide Angaben stehen
 * nebeneinander an demselben Element, und man kann die eine ohne die andere
 * setzen — beim nächsten neuen Formular ist genau das die naheliegende
 * Nachlässigkeit. Das Ergebnis wäre ein Feld, das man ausfüllen MUSS, ohne
 * dass es jemand vorher wüsste: der Zustand, den die Kennzeichnung gerade
 * beseitigt hat.
 *
 * Geprüft wird die eine Richtung, die den Schaden trägt:
 *
 *   `required`  ==>  `pflicht`
 *
 * Umgekehrt gilt sie NICHT, und das ist Absicht. Manche Formulare prüfen im
 * Code statt über den Browser, weil sie eigene Meldungen zeigen wollen (die
 * Wartungen etwa). Ihre Felder tragen `pflicht` ohne `required` — richtig
 * gekennzeichnet, nur anders durchgesetzt.
 */

const FEATURES = join(__dirname, '../../src/features');

/** Alle .tsx unter src/features, rekursiv. */
function dateien(verzeichnis: string): string[] {
  const raus: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) raus.push(...dateien(pfad));
    else if (eintrag.endsWith('.tsx')) raus.push(pfad);
  }
  return raus;
}

/**
 * Die Felder einer Datei, grob zerlegt.
 *
 * Bewusst textuell und nicht über einen Parser: der Test soll eine vergessene
 * Kennzeichnung melden, nicht JSX verstehen. Ein Element beginnt mit
 * `<InputField` oder `<SelectField` und endet am ersten `/>` oder `>`, das
 * nicht in einer geschweiften Klammer steckt.
 */
interface Feld {
  datei: string;
  zeile: number;
  quelltext: string;
}

function felder(pfad: string): Feld[] {
  const text = readFileSync(pfad, 'utf8');
  const raus: Feld[] = [];
  const start = /<(InputField|SelectField)\b/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(text)) !== null) {
    let tiefe = 0;
    let ende = m.index;
    for (let i = m.index; i < text.length; i++) {
      const c = text[i];
      if (c === '{') tiefe++;
      else if (c === '}') tiefe--;
      else if (c === '>' && tiefe === 0) {
        ende = i + 1;
        break;
      }
    }
    raus.push({
      datei: pfad,
      zeile: text.slice(0, m.index).split('\n').length,
      quelltext: text.slice(m.index, ende),
    });
  }
  return raus;
}

const hat = (quelltext: string, wort: string) =>
  new RegExp(`(?<![\\w-])${wort}(?![\\w-])`).test(quelltext);

const alle = dateien(FEATURES).flatMap(felder);

describe('Pflichtfelder sind gekennzeichnet', () => {
  it('findet überhaupt Felder — sonst prüft der Test nichts', () => {
    // Ohne diese Zusicherung ginge der Test auch dann durch, wenn die
    // Zerlegung nichts mehr findet, weil sich die Schreibweise geändert hat.
    expect(alle.length).toBeGreaterThan(50);
  });

  it('trägt an jedem Muss-Feld auch den Stern', () => {
    const ohne = alle
      .filter((f) => hat(f.quelltext, 'required') && !hat(f.quelltext, 'pflicht'))
      .map((f) => `${f.datei.split('/src/')[1]}:${f.zeile}`);

    expect(
      ohne,
      'Diese Felder MUSS man ausfüllen, sagen es aber nicht.\n' +
        'Ergänze `pflicht` am Element — oder nimm `required` weg, wenn es keins ist:\n' +
        ohne.join('\n'),
    ).toEqual([]);
  });

  it('kennzeichnet mindestens die bekannten Muss-Felder', () => {
    // Eine Untergrenze, damit ein Umbau die Kennzeichnung nicht stillschweigend
    // aus allen Formularen entfernt — dann fiele der Test oben nicht auf, weil
    // er nur Widersprüche findet, nicht Abwesenheit.
    const markiert = alle.filter((f) => hat(f.quelltext, 'pflicht'));
    expect(markiert.length).toBeGreaterThanOrEqual(20);
  });
});
