/**
 * Was der ausgelieferte Bau mitbekommt — und was er NICHT mehr mitbekommt.
 *
 * ERSTE HÄLFTE: DIE ZUGANGSDATEN. Ein Build ohne `VITE_SUPABASE_URL` und
 * ohne den öffentlichen Schlüssel startet zwar, kommt aber an keine Zeile.
 * Das fällt sofort auf — aber erst produktiv, und dann steht der Betrieb.
 * Deshalb steht es hier und nicht nur im Workflow.
 *
 * ZWEITE HÄLFTE: KEIN SCHALTER MEHR. Bis zum 19.09.2026 entschied
 * `VITE_DATENQUELLE`, gegen welche Datenbank die App arbeitet — alles ausser
 * `postgres` hiess Firestore. Diese Rückfalltür ist mit Stufe 9 zugegangen:
 * die Firestore-Seite gibt es nicht mehr. Bliebe die Variable irgendwo
 * stehen, wäre sie ein Schalter, der nichts mehr schaltet — und der Nächste
 * legt ihn im Ernstfall um und wundert sich, dass nichts passiert. Ein toter
 * Schalter ist schlimmer als keiner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const WURZEL = process.cwd();
const WORKFLOW = resolve(WURZEL, '.github/workflows/deploy.yml');

/** Der Block, mit dem `npm run build` seine Umgebung bekommt. */
function bauUmgebung(): string {
  const inhalt = readFileSync(WORKFLOW, 'utf8');
  const bis = inhalt.indexOf('run: npm run build');
  expect(bis, 'Der Workflow baut nicht mehr mit `npm run build`').toBeGreaterThan(0);
  // Rückwärts bis zum Anfang des `env:`-Blocks dieses Schritts.
  const von = inhalt.lastIndexOf('env:', bis);
  expect(von, 'Der Bauschritt hat keinen env-Block mehr').toBeGreaterThan(0);
  return inhalt.slice(von, bis);
}

/** Alle Quelldateien, in denen ein Schalter wieder auftauchen könnte. */
function dateien(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    if (eintrag === 'node_modules' || eintrag.startsWith('.')) continue;
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) dateien(pfad, treffer);
    else if (/\.(ts|tsx|mjs|yml|yaml)$/.test(eintrag)) treffer.push(pfad);
  }
  return treffer;
}

describe('Der Bau der ausgelieferten App', () => {
  it('bekommt die Zugangsdaten mit', () => {
    const umgebung = bauUmgebung();
    expect(umgebung).toContain('VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}');
    expect(umgebung).toContain('VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}');
  });

  /*
    DIE AUSNAHME IST DIESE DATEI SELBST und der Kommentar im Workflow, der
    erklärt, was dort einmal stand. Eine Erklärung ist kein Schalter — aber
    eine Zuweisung wäre einer, und genau danach wird gesucht.
  */
  it('kennt keine Datenquellen-Weiche mehr', () => {
    const verdaechtig: string[] = [];
    for (const pfad of [
      ...dateien(resolve(WURZEL, 'src')),
      ...dateien(resolve(WURZEL, 'tests')),
      ...dateien(resolve(WURZEL, 'shared')),
      ...dateien(resolve(WURZEL, 'supabase')),
      resolve(WURZEL, 'playwright.config.ts'),
      resolve(WURZEL, 'vitest.config.ts'),
      resolve(WURZEL, 'vitest.supabase.config.ts'),
      WORKFLOW,
    ]) {
      if (pfad.endsWith('bauUmgebung.test.ts')) continue;
      const inhalt = readFileSync(pfad, 'utf8');
      // Eine Zuweisung oder ein Zugriff, kein Wort in einem Kommentar.
      if (/VITE_DATENQUELLE['"]?\s*[:=]|env\.VITE_DATENQUELLE/.test(inhalt)) {
        verdaechtig.push(pfad.slice(WURZEL.length + 1));
      }
    }
    expect(verdaechtig, 'Toter Schalter: VITE_DATENQUELLE schaltet nichts mehr').toEqual([]);
  });

  /*
    WARUM DAS HIER STEHT. Der Deploy prüft vorab, ob die Geheimnisse da sind,
    und bricht mit einer Liste ab, wenn nicht. Genau einmal ist diese Liste
    hinter der Wirklichkeit zurückgeblieben: `VITE_FIREBASE_PROJECT_ID` galt
    nach dem Abbau von Firestore als „nur für Push" — dabei steht sie im
    Deploy als `--project` und entscheidet, WOHIN veröffentlicht wird. Ohne
    sie läuft die Prüfung durch, der Build gelingt, und der letzte Schritt
    scheitert. Die Vorabprüfung ist nur so viel wert, wie sie vollständig ist.
  */
  it('prüft vorab jedes Geheimnis, ohne das der Deploy nicht laufen kann', () => {
    const inhalt = readFileSync(WORKFLOW, 'utf8');
    const schritte = inhalt.split(/^ {6}- (?:name|uses):/m);
    const pruefung = schritte.find((t) => t.includes('Zugangsdaten vollständig?')) ?? '';
    expect(pruefung, 'Der Schritt „Zugangsdaten vollständig?" fehlt').not.toEqual('');

    // Die Schritte, die ohne ihr Geheimnis nicht einmal anfangen können.
    const unverzichtbar = schritte.filter(
      (t) => t.includes('Dienstkonto bereitstellen') || /^ ?Deploy\n/.test(t),
    );
    expect(unverzichtbar.length, 'Deploy-Schritte nicht gefunden').toBe(2);

    const fehlend: string[] = [];
    for (const schritt of unverzichtbar) {
      for (const [, name] of schritt.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
        if (!pruefung.includes(name)) fehlend.push(name);
      }
    }
    expect(fehlend, 'Vom Deploy gebraucht, aber vorab nicht geprüft').toEqual([]);
  });
});
