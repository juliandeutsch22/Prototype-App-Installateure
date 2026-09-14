import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Kopiert die gemeinsamen Regeln aus `shared/` zu den Edge Functions.
 *
 * WARUM EINE KOPIE. `supabase functions deploy` lädt ausschliesslich das
 * Verzeichnis `supabase/functions/` hoch; eine Datei daneben wäre zur
 * Laufzeit nicht vorhanden — die Function stürzte beim ersten Aufruf ab, und
 * zwar erst im Betrieb. Dasselbe Problem, dieselbe Antwort wie bei den Cloud
 * Functions (`functions/scripts/shared-uebernehmen.mjs`).
 *
 * WARUM DAS KEINE DOPPLUNG IST. Die Kopie ist nicht eingecheckt und wird bei
 * jedem Lauf neu geschrieben. Sie kann nicht von der Quelle abweichen —
 * anders als zwei von Hand gepflegte Fassungen derselben Prüfung. Genau das
 * wäre hier der teure Fehler: der Browser liesse eine Kennung durch, die der
 * Server abweist, oder umgekehrt.
 *
 * Deno löst Importe mit Endung auf, TypeScript hier ohne — deshalb wird `.ts`
 * beim Kopieren ergänzt.
 */
const hier = dirname(fileURLToPath(import.meta.url));
const quelle = resolve(hier, '../shared');
const ziel = resolve(hier, '../supabase/functions/_shared');

rmSync(ziel, { recursive: true, force: true });
mkdirSync(ziel, { recursive: true });

for (const datei of readdirSync(quelle).filter((f) => f.endsWith('.ts'))) {
  const inhalt = readFileSync(resolve(quelle, datei), 'utf8')
    .replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
  writeFileSync(
    resolve(ziel, datei),
    `// ERZEUGT — nicht bearbeiten. Quelle: shared/${datei}\n` +
      `// Änderungen gehören in die Quelle; diese Datei wird bei jedem Lauf neu\n` +
      `// geschrieben (scripts/edge-shared-uebernehmen.mjs).\n\n` +
      inhalt,
  );
}
console.log(`shared/ → supabase/functions/_shared (${readdirSync(ziel).length} Dateien)`);
