/**
 * Ist beim Portieren etwas unter den Tisch gefallen?
 *
 * Die Vorgabe für den Umzug lautet: keine bestehende Funktion darf fehlen.
 * Für das Prüfnetz heisst das, dass jede der 155 Regelprüfungen aus Firestore
 * eine Entsprechung haben muss.
 *
 * Diese Datei prüft das MASCHINELL, statt sich darauf zu verlassen, dass
 * jemand beim Abhaken aufmerksam war.
 *
 * DIE GEGENSEITE IST SEIT DEM 19.09.2026 EINE TEXTFASSUNG. Bis dahin las
 * dieser Test die Titel unmittelbar aus `tests/firestore.rules.test.ts`.
 * Diese Datei ist mit Firestore gefallen — und hätte sie den Beweis
 * mitgenommen, wäre ausgerechnet die Zusicherung verschwunden, dass beim
 * Umzug nichts verlorenging.
 *
 * `regelnAusFirestore.txt` hält die 155 Titel deshalb wörtlich fest. Sie sind
 * eine TATSACHE über den Umzug und keine Eigenschaft von Firestore: was
 * damals galt, muss weiter gelten, auch wenn die Datenbank, für die es
 * geschrieben wurde, nicht mehr läuft. Die Liste ändert sich nie wieder —
 * wer sie anfasst, verschiebt die Messlatte und muss das begründen.
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

/** Die festgehaltenen Titel der Firestore-Regelprüfungen. */
function ausFirestore(): string[] {
  return readFileSync(resolve(process.cwd(), 'tests/supabase/regelnAusFirestore.txt'), 'utf8')
    .trim()
    .split('\n');
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
    const firestore = ausFirestore();
    const postgres = new Set(titel('tests/supabase/regeln.test.ts'));

    const fehlend = firestore
      .filter((t) => !postgres.has(t))
      .filter((t) => !(t in ANDERS_GELOEST));

    expect(fehlend).toEqual([]);
  });

  it('und es sind wirklich 155', () => {
    // Der Wächter über den Wächter: wird die Liste gekürzt, sinkt die
    // Messlatte still. Diese Zahl steht der Kürzung im Weg.
    expect(ausFirestore()).toHaveLength(155);
  });

  it('jede erklärte Ausnahme trägt auch eine Erklärung', () => {
    const ohneGrund = Object.entries(ANDERS_GELOEST)
      .filter(([, grund]) => grund.trim().length < 20)
      .map(([t]) => t);
    expect(ohneGrund).toEqual([]);
  });
});
