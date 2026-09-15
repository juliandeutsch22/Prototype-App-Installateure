import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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

/*
  KEINE FREMDE DATEI STILLSCHWEIGEND LÖSCHEN.

  Dieses Skript räumt `_shared/` bei jedem Lauf ab. Legt jemand dort eine
  eigene Datei hinein — weil der Name so einladend ist —, ist sie beim
  nächsten `npm test` weg. Beim Deploy fiele das nicht auf: der lädt hoch,
  was da ist, und die Function stürzte erst beim ersten Aufruf über einen
  Import ins Leere.

  Genau das ist am 15.09.2026 passiert, und der Lauf danach meldete nur
  „Failed to load url …". Eine Minute Suchen für etwas, das das Skript
  selbst weiss. Jetzt sagt es, was es vorhat, statt es zu tun.

  Von Hand gepflegtes Handwerkszeug der Edge Functions gehört nach
  `supabase/functions/_eigen/` — eingecheckt und von hier unberührt.
*/
try {
  const fremde = readdirSync(ziel).filter((f) => !existsSync(resolve(quelle, f)));
  if (fremde.length > 0) {
    console.error(
      `\nsupabase/functions/_shared/ ist ERZEUGT und wird gleich überschrieben.\n` +
      `Diese Dateien haben dort keine Quelle in shared/ und gingen verloren:\n` +
      fremde.map((f) => `  - ${f}`).join('\n') +
      `\n\nVon Hand gepflegtes gehört nach supabase/functions/_eigen/.\n`,
    );
    process.exit(1);
  }
} catch (e) {
  // Das Verzeichnis gibt es beim ersten Lauf noch nicht — kein Befund.
  if (e?.code !== 'ENOENT') throw e;
}

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
