import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Kopiert die gemeinsamen Rechenregeln aus `shared/` in die Functions.
 *
 * WARUM EINE KOPIE. `firebase deploy` lädt ausschließlich das Verzeichnis
 * `functions/` hoch. Eine Datei daneben wäre zur Laufzeit schlicht nicht
 * vorhanden — die Function stürzte beim ersten Aufruf ab, und zwar erst in
 * der Produktion.
 *
 * WARUM DAS TROTZDEM KEINE DOPPLUNG IST. Die Kopie ist nicht eingecheckt
 * (.gitignore) und wird bei JEDEM Build neu geschrieben. Sie kann also nicht
 * von der Quelle abweichen — anders als zwei von Hand gepflegte Fassungen
 * derselben Formel. Genau das wäre hier der gefährlichste Fehler: Client und
 * Server rechneten denselben Stundensaldo unterschiedlich, und bemerkt würde
 * es auf einem Lohnzettel.
 *
 * Dasselbe Muster nutzt `voice-entry.mjs` bereits für die Einstiegsdatei.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const quellOrdner = resolve(hier, '../../shared');
const zielOrdner = resolve(hier, '../src/generated');

mkdirSync(zielOrdner, { recursive: true });

// Innerhalb von shared/ importieren die Dateien einander relativ ('./arbeitszeit').
// Unter NodeNext braucht das eine Endung — deshalb beim Kopieren ergaenzen.
const dateien = readdirSync(quellOrdner).filter((f) => f.endsWith('.ts'));
for (const datei of dateien) {
  const inhalt = readFileSync(resolve(quellOrdner, datei), 'utf8').replace(
    /from '\.\/([\w-]+)'/g,
    "from './$1.js'",
  );
  writeFileSync(
    resolve(zielOrdner, datei),
    `// ERZEUGT — nicht bearbeiten. Quelle: shared/${datei}\n` +
      `// Änderungen gehören in die Quelle; diese Datei wird bei jedem Build\n` +
      `// überschrieben (functions/scripts/shared-uebernehmen.mjs).\n\n` +
      inhalt,
  );
}

console.log(`shared/ -> functions/src/generated/ (${dateien.join(', ')})`);
