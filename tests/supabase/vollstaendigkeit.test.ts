/**
 * Ist beim Portieren etwas unter den Tisch gefallen?
 *
 * Die Vorgabe für den Umzug lautet: keine bestehende Funktion darf fehlen.
 * Für das Prüfnetz heisst das, dass jede der 155 Prüfungen aus
 * `tests/firestore.rules.test.ts` eine Entsprechung haben muss.
 *
 * Diese Datei prüft das MASCHINELL, statt sich darauf zu verlassen, dass
 * jemand beim Abhaken aufmerksam war. Sie liest beide Dateien, zieht die
 * Titel heraus und vergleicht. Eine Prüfung, die drüben steht und hier nicht,
 * lässt diesen Test fallen — es sei denn, sie steht unten als Ausnahme mit
 * einem Grund.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function titel(datei: string): string[] {
  const inhalt = readFileSync(resolve(process.cwd(), datei), 'utf8');
  const muster = /^\s*it\(\s*(['"`])([\s\S]*?)\1/gm;
  const raus: string[] = [];
  for (const m of inhalt.matchAll(muster)) raus.push(m[2].replace(/\s+/g, ' ').trim());
  return raus;
}

/**
 * Prüfungen, die bewusst NICHT eins zu eins portiert sind, mit Grund.
 *
 * Jeder Eintrag hier ist eine Behauptung, die jemand nachlesen können muss.
 * Eine leere Begründung wäre schlimmer als eine fehlende Prüfung, weil sie
 * so aussieht, als hätte jemand nachgedacht.
 */
const ANDERS_GELOEST: Record<string, string> = {};

describe('Das Prüfnetz ist vollständig umgezogen', () => {
  it('jede Regelprüfung aus Firestore hat eine Entsprechung', () => {
    const firestore = titel('tests/firestore.rules.test.ts');
    const postgres = new Set(titel('tests/supabase/regeln.test.ts'));

    const fehlend = firestore
      .filter((t) => !postgres.has(t))
      .filter((t) => !(t in ANDERS_GELOEST));

    expect(fehlend).toEqual([]);
  });

  it('und es sind wirklich 155', () => {
    // Fällt drüben eine Prüfung weg, soll das auffallen und nicht still
    // die Messlatte senken.
    expect(titel('tests/firestore.rules.test.ts')).toHaveLength(155);
  });

  it('jede erklärte Ausnahme trägt auch eine Erklärung', () => {
    const ohneGrund = Object.entries(ANDERS_GELOEST)
      .filter(([, grund]) => grund.trim().length < 20)
      .map(([t]) => t);
    expect(ohneGrund).toEqual([]);
  });
});
