/**
 * Greift ein Modul am Kern vorbei?
 *
 * Beim ersten umgestellten Modul ist mir genau das passiert: zwei Funktionen
 * holten sich den Client direkt aus `lib/supabase`, statt ihn über den Kern zu
 * nehmen. Im Betrieb wäre das nicht aufgefallen — es funktioniert ja. Auffallen
 * würde es erst dort, wo jemand einen anderen Client einreicht: in Tests, und
 * später beim Wechsel des angemeldeten Kontos.
 *
 * Neunzehn Module kommen noch. Dieser Wächter fängt den Fehler beim nächsten
 * Mal sofort, statt nach einer halben Stunde Suche.
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
});
