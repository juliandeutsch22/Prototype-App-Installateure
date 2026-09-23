/**
 * Die Reihenfolge der Auslieferung: erst das Schema, dann die App.
 *
 * ZWEIMAL FALSCH, UND BEIDE MALE SAH MAN ES DER DATEI NICHT AN.
 *
 * 1. Bis zum 20.09.2026 starteten Migrationen und App gemeinsam auf
 *    `push: main`. Die App war nach drei Minuten draussen, das Schema nach
 *    sieben — vier Minuten neue Oberfläche gegen alte Datenbank.
 * 2. Danach hing die App per `workflow_run` hinter den Migrationen. Beim
 *    ersten echten Merge sprang das nie an: GitHub liest `workflow_run` nur
 *    aus der Fassung auf dem STANDARDBRANCH, und der war nicht `main`.
 *    Schema und Functions gingen live, die App nicht. Kein Pull Request kann
 *    das zeigen, weil er `workflow_run` gar nicht auslöst.
 *
 * Deshalb steht die Kette hier fest: die Migrationen rufen die Auslieferung
 * als eigenen Auftrag auf, nach dem Einspielen, aus demselben Commit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORDNER = resolve(process.cwd(), '.github/workflows');
const lies = (datei: string) => readFileSync(resolve(ORDNER, datei), 'utf8');

/** Der `on:`-Block ohne Kommentare — nur die Auslöser, die wirklich gelten. */
function ausloeser(inhalt: string): string {
  const von = inhalt.search(/^on:\s*$/m);
  expect(von, 'Kein `on:`-Block gefunden').toBeGreaterThanOrEqual(0);
  const rest = inhalt.slice(von + 3);
  const bis = rest.search(/^\S/m);
  return rest
    .slice(0, bis < 0 ? undefined : bis)
    .split('\n')
    .filter((z) => !z.trim().startsWith('#'))
    .join('\n');
}

/** Ein Auftrag der Migrationen, von seinem Namen bis zum nächsten. */
function auftrag(inhalt: string, name: string): string {
  const von = inhalt.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  expect(von, `Auftrag \`${name}\` fehlt`).toBeGreaterThanOrEqual(0);
  const rest = inhalt.slice(von + name.length + 3);
  const bis = rest.search(/^ {2}[a-z_-]+:\s*$/m);
  return rest.slice(0, bis < 0 ? undefined : bis);
}

describe('Die Auslieferung', () => {
  it('startet die App nicht selbst auf einem Push', () => {
    // Sonst liefen App und Schema wieder nebeneinander los.
    expect(ausloeser(lies('deploy.yml'))).not.toMatch(/^\s+push:/m);
  });

  it('hängt nicht an `workflow_run`, das nur der Standardbranch kennt', () => {
    expect(ausloeser(lies('deploy.yml'))).not.toMatch(/workflow_run/);
  });

  it('lässt sich aus den Migrationen aufrufen', () => {
    expect(ausloeser(lies('deploy.yml'))).toMatch(/^\s+workflow_call:/m);
  });

  it('ruft die App erst nach dem Einspielen auf, mit den Geheimnissen', () => {
    const app = auftrag(lies('supabase-migrationen.yml'), 'app');
    expect(app).toMatch(/^\s+uses: \.\/\.github\/workflows\/deploy\.yml\s*$/m);
    expect(app).toMatch(/^\s+needs: einspielen\s*$/m);
    // Ohne sie baut der Aufruf eine App ohne Supabase-Zugang, und der Deploy
    // hat keinen Firebase-Schlüssel.
    expect(app).toMatch(/^\s+secrets: inherit\s*$/m);
  });

  it('liefert nur auf main aus, nie aus einem Pull Request', () => {
    const bedingung = /^\s+if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'\s*$/m;
    expect(auftrag(lies('supabase-migrationen.yml'), 'app')).toMatch(bedingung);
    expect(auftrag(lies('deploy.yml'), 'deploy')).toMatch(bedingung);
  });
});
