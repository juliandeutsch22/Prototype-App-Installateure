/**
 * Wie die Dateien in `shared/` einander importieren dürfen.
 *
 * DER FEHLER, DEN DAS VERHINDERT — ich habe ihn selbst gemacht. `shared/`
 * wird an ZWEI Ziele kopiert, und beide verlangen etwas anderes:
 *
 *   supabase/functions/_shared   Deno — braucht die Endung `.ts`
 *   functions/src/generated      NodeNext — braucht die Endung `.js`
 *
 * Deshalb steht in der Quelle KEINE Endung, und jeder der beiden Generatoren
 * ergänzt seine eigene. Wer in der Quelle `./x.ts` schreibt (weil er gerade
 * an Deno denkt), bekommt das im Deno-Ziel nicht zu spüren — dort stimmt es
 * ja. Es bricht erst im ANDEREN Ziel, und das übersetzt ein eigener
 * CI-Auftrag, der nicht mitläuft, wenn man örtlich `npm test` sagt.
 *
 * Eine Minute Bauzeit für eine Regel, die hier in Millisekunden zu prüfen
 * ist.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORDNER = resolve(__dirname, '../../shared');

describe('Die Importe in shared/', () => {
  it('nennen keine Dateiendung', () => {
    const verstoesse: string[] = [];
    for (const datei of readdirSync(ORDNER).filter((f) => f.endsWith('.ts'))) {
      const inhalt = readFileSync(resolve(ORDNER, datei), 'utf8');
      for (const [, ziel] of inhalt.matchAll(/from '(\.\/[^']+)'/g)) {
        if (/\.(ts|js|mjs)$/.test(ziel)) verstoesse.push(`${datei}: ${ziel}`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it('zeigen nicht aus `shared/` hinaus', () => {
    /*
      Ein `../src/...` würde in beiden Zielen ins Leere greifen: dort steht
      die Datei allein in einem erzeugten Verzeichnis. Örtlich liefe es
      durch, und die Function stürzte beim ersten Aufruf ab.
    */
    const verstoesse: string[] = [];
    for (const datei of readdirSync(ORDNER).filter((f) => f.endsWith('.ts'))) {
      const inhalt = readFileSync(resolve(ORDNER, datei), 'utf8');
      for (const [, ziel] of inhalt.matchAll(/from '([^']+)'/g)) {
        if (ziel.startsWith('../') || ziel.startsWith('@/')) {
          verstoesse.push(`${datei}: ${ziel}`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it('findet überhaupt Importe — sonst prüft die Zeile darüber nichts', () => {
    // Der stillste Fehler dieser Prüfung: ein Muster, das nichts mehr
    // findet, und zwei Zusicherungen, die immer grün sind.
    const alle = readdirSync(ORDNER)
      .filter((f) => f.endsWith('.ts'))
      .flatMap((f) => [...readFileSync(resolve(ORDNER, f), 'utf8').matchAll(/from '(\.\/[^']+)'/g)]);
    expect(alle.length).toBeGreaterThan(0);
  });
});
