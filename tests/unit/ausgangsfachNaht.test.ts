/**
 * Bleibt das Ausgangsfach angeschlossen?
 *
 * DIESE DATEI GIBT ES WEGEN EINES FEHLERS, DER SECHS STUFEN LANG UNBEMERKT
 * BLIEB. Das Ausgangsfach war gebaut, hatte eine eigene Prüfung gegen die
 * echte Datenbank und tat genau, was es sollte — nur rief es niemand auf. Die
 * Ansichten schrieben weiter unmittelbar, und im Funkloch war die Buchung weg,
 * während auf dem Bildschirm „wird automatisch gesendet" stand.
 *
 * `tests/supabase/ohneEmpfang.test.ts` beweist, dass der Weg trägt. Es geht
 * dafür durch die Weiche — und merkt deshalb NICHT, wenn eine Ansicht sich
 * morgen wieder an ihr vorbeischreibt. Genau diese Lücke schliesst diese
 * Datei: sie liest den Quelltext, nicht das Verhalten.
 *
 * Eine Textprüfung ist ein schwaches Werkzeug, und sie steht hier trotzdem:
 * die Alternative wäre, die Ansichten mit gestelltem Netz zu fahren, und das
 * prüft dann die Attrappe. Der Fehler, der wirklich passiert ist, war ein
 * fehlender Aufruf — und den sieht man im Text.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const lies = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * Die Ansichten, in denen ein Monteur im Feld schreibt.
 *
 * Nicht jede Ansicht gehört hierher: die Buchhaltung sitzt am Schreibtisch,
 * und ein stillschweigend vorgemerkter Rechnungslauf wäre schlimmer als eine
 * Fehlermeldung. Diese beiden sind die, die auf der Baustelle bedient werden.
 */
const IM_FELD = [
  'src/features/time/TimeForm.tsx',
  'src/features/orders/OrderView.tsx',
];

describe('Das Ausgangsfach hängt am Schreibweg', () => {
  it('die Ansichten im Feld schreiben über das Ausgangsfach', () => {
    const vorbei = IM_FELD.filter((d) => !/OhneEmpfang\(/.test(lies(d)));
    expect(vorbei).toEqual([]);
  });

  it('keine Ansicht verspricht mehr über den Firestore-Weg', () => {
    /*
      `writeWithOfflineNotice` ist nicht falsch — unter Firestore hält das SDK
      die Zusage. Falsch ist es NEBEN Postgres: dort sagt derselbe Satz etwas
      zu, was niemand einlöst. Der Helfer darf deshalb nur noch im
      Firestore-Zweig stehen, wo er hingehört, und fällt mit Stufe 9 weg.
    */
    const zweig = /^src\/lib\/(db\/fs\/|offlineWrite\.ts)/;
    const treffer = quelldateien('src')
      .filter((d) => !zweig.test(d))
      .filter((d) => /writeWithOfflineNotice|queuedMessage/.test(lies(d)));
    expect(treffer).toEqual([]);
  });

  it('der Nachsender ist eingehängt', () => {
    /*
      OHNE DIESE ZEILE WÄRE DAS FACH EIN GRAB. Vormerken allein bringt die
      Buchung nicht an; unter Postgres muss jemand anstossen. Fehlt der
      Einhängepunkt, läuft alles andere weiter wie gehabt — und die Buchung
      liegt im Gerät, bis es getauscht wird.
    */
    const haupt = lies('src/main.tsx');
    expect(haupt).toMatch(/import Nachsender from/);
    expect(haupt).toMatch(/<Nachsender\s*\/>/);
  });

  it('ein endgültig verlorener Vorgang erreicht den Bildschirm', () => {
    // Beide Quellen: der Firestore-Weg und das Ausgangsfach. Hört die Anzeige
    // nur auf eine, verschwindet die andere Meldung lautlos.
    const anzeige = lies('src/components/VerloreneBuchung.tsx');
    expect(anzeige).toMatch(/beiVorgemerktemFehlschlag/);
    expect(anzeige).toMatch(/beiVormerkungFehlgeschlagen/);
  });
});

/** Alle .ts/.tsx unter einem Verzeichnis, als Pfade ab dem Projektstamm. */
function quelldateien(ordner: string): string[] {
  return readdirSync(resolve(process.cwd(), ordner), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory()
      ? quelldateien(join(ordner, e.name))
      : /\.tsx?$/.test(e.name) ? [join(ordner, e.name)] : []));
}
