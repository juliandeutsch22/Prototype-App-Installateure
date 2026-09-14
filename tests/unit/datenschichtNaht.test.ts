/**
 * Greift ein Modul am Kern vorbei?
 *
 * Beim ersten umgestellten Modul ist mir genau das passiert: zwei Funktionen
 * holten sich den Client direkt aus `lib/supabase`, statt ihn über den Kern zu
 * nehmen. Im Betrieb wäre das nicht aufgefallen — es funktioniert ja. Auffallen
 * würde es erst dort, wo jemand einen anderen Client einreicht: in Tests, und
 * später beim Wechsel des angemeldeten Kontos.
 *
 * Dieser Wächter fängt den Fehler sofort, statt nach einer halben Stunde
 * Suche.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PG = resolve(process.cwd(), 'src/lib/db/pg');

function dateien(): string[] {
  return readdirSync(PG).filter((d) => d.endsWith('.ts'));
}

describe('Die Naht der Datenschicht', () => {
  it('nur der Kern kennt den Client unmittelbar', () => {
    const vorbei = dateien()
      .filter((d) => d !== 'kern.ts')
      .filter((d) => /from '@\/lib\/supabase'/.test(readFileSync(resolve(PG, d), 'utf8')));
    expect(vorbei).toEqual([]);
  });

  it('kein Modul spricht Firestore an', () => {
    // Ein pg-Modul, das noch irgendwo Firestore berührt, wäre der Anfang des
    // Parallelbetriebs, den der Fahrplan ausdrücklich ausschliesst.
    const gemischt = dateien()
      .filter((d) => /from 'firebase\/|from '@\/lib\/firebase'/.test(readFileSync(resolve(PG, d), 'utf8')));
    expect(gemischt).toEqual([]);
  });

  it('die Mitte kennt keine der beiden Datenbanken', () => {
    /*
      WAS „DIE MITTE" IST: die Dateien unmittelbar in `src/lib/db/`, die keine
      Weiche sind — `core.ts` mit der Kennung, `quelle.ts` mit dem Schalter,
      und die Module mit den Vorgaben des Betriebs.

      `core.ts` trug bis zum 12.09.2026 die Firestore-Helfer. Damit zog jede
      der zwanzig Ansichten, die von dort nur `WithId` holte, das
      Firestore-SDK in ihren Typgraphen — und der Rückbau in Stufe 7 hätte an
      zwanzig Stellen angefangen statt an einer. Die Helfer liegen jetzt in
      `fs/core.ts`; damit das so bleibt, steht es hier.
    */
    const WURZEL = resolve(process.cwd(), 'src/lib/db');
    const mitte = readdirSync(WURZEL)
      .filter((d) => d.endsWith('.ts'))
      .filter((d) => !/from '\.\/pg\//.test(readFileSync(resolve(WURZEL, d), 'utf8')));

    /*
      DIE AUSNAHME IST MIT STUFE 6 GEFALLEN.

      `scheinFotos.ts` stand hier, weil es Bilder nach Firebase Storage lud —
      das ist nicht die Datenbank, und der Umzug kam später. Seit die Fotos
      im Supabase-Speicher liegen, ist die Datei eine Weiche wie jede andere
      und gehört gar nicht mehr zur Mitte. Ausnahmslos heisst jetzt
      ausnahmslos.
    */
    const verunreinigt = mitte.filter((d) =>
      /from 'firebase\/|from '@\/lib\/firebase'|from '@\/lib\/supabase'/
        .test(readFileSync(resolve(WURZEL, d), 'utf8')));
    expect(verunreinigt).toEqual([]);

    // Und der Wächter über den Wächter: findet er die Mitte überhaupt?
    expect(mitte).toContain('core.ts');
    expect(mitte).toContain('quelle.ts');
    expect(mitte).not.toContain('scheinFotos.ts');
  });

  it('und die Weiche entscheidet, statt selbst zu arbeiten', () => {
    // Eine Weiche mit eigener Logik ist ein drittes Inneres, das niemand prüft.
    const weichen = readdirSync(resolve(process.cwd(), 'src/lib/db'))
      .filter((d) => d.endsWith('.ts'))
      .filter((d) => {
        const inhalt = readFileSync(resolve(process.cwd(), 'src/lib/db', d), 'utf8');
        return /from '\.\/pg\//.test(inhalt);
      });
    for (const w of weichen) {
      const inhalt = readFileSync(resolve(process.cwd(), 'src/lib/db', w), 'utf8');
      expect({ weiche: w, firestore: /from 'firebase\//.test(inhalt) })
        .toEqual({ weiche: w, firestore: false });
    }
  });

  it('und die Anmeldung hält dieselbe Grenze', () => {
    /*
      SEIT DEM 14.09.2026 GILT DIE REGEL AUCH FÜR `lib/auth/`.

      `AuthContext` sprach bis dahin direkt mit Firebase Auth und Firestore.
      Damit liess sich der Umzug gar nicht umschalten: die Datenschicht hätte
      mit Postgres geredet, das Token wäre weiter von Firebase gekommen, und
      keine einzige Zeilenregel hätte gegriffen. Es war der letzte Block, der
      quer lag.

      Geprüft wird dieselbe Aussage wie oben, nur für das andere Verzeichnis:
      die Mitte kennt keine der beiden Anmeldungen. Fiele das zurück, fiele es
      hier auf — und nicht erst beim Umschalten.
    */
    const WURZEL = resolve(process.cwd(), 'src/lib/auth');
    const mitte = readdirSync(WURZEL)
      .filter((d) => d.endsWith('.ts'))
      .filter((d) => !/from '\.\/pg\//.test(readFileSync(resolve(WURZEL, d), 'utf8')));

    const verunreinigt = mitte.filter((d) =>
      /from 'firebase\/|from '@\/lib\/firebase'|from '@\/lib\/supabase'|@supabase\/supabase-js/
        .test(readFileSync(resolve(WURZEL, d), 'utf8')));
    expect(verunreinigt).toEqual([]);

    // Der Wächter über den Wächter: findet er die Mitte überhaupt?
    expect(mitte).toContain('kern.ts');
    expect(mitte).toContain('provisionUser.ts');
    expect(mitte).not.toContain('sitzung.ts');
  });

  it('auch die Ansicht, die die Anmeldung benutzt', () => {
    // `AuthContext` ist keine Weiche, sondern ihr Aufrufer — und darf deshalb
    // erst recht kein SDK kennen.
    const inhalt = readFileSync(resolve(process.cwd(), 'src/app/AuthContext.tsx'), 'utf8');
    expect(
      /from 'firebase\/|from '@\/lib\/firebase'|from '@\/lib\/supabase'/.test(inhalt),
    ).toBe(false);
  });
});
