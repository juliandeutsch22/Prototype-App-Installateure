import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Schreibt die Einstiegsdatei für die KI-Spracherfassung — je nach Schalter
 * mit oder ohne Export.
 *
 * Warum überhaupt generiert: `defineSecret` in extract.ts wird von Firebase
 * schon beim ANALYSIEREN des Codes aufgelöst, lange bevor `--only`
 * entscheidet, was deployt wird. Solange voiceExtract also statisch
 * exportiert ist, verlangt jeder Deploy die beiden API-Schlüssel im Secret
 * Manager — auch der Deploy von syncUserClaims, der mit der KI nichts zu tun
 * hat. Ohne diesen Trigger bekommt ein neu angelegter Benutzer keine
 * Berechtigungen; er kommt durch die Anmeldung und sieht danach kein einziges
 * Dokument. Das ist der teuerste denkbare Blocker für ein Nebenfeature, das
 * in der Oberfläche ohnehin abgeschaltet ist.
 *
 * Ein bedingter dynamischer Import wäre der naheliegende Ausweg und
 * funktioniert NICHT: der Emulator meldet dann "Functions codebase could not
 * be analyzed successfully". Die Analyse braucht statische Exporte. Also
 * entscheidet der Build, nicht die Laufzeit.
 *
 * Aufruf: node scripts/voice-entry.mjs   (ENABLE_VOICE=true schaltet ein)
 */
const an = process.env.ENABLE_VOICE === 'true';

const inhalt = an
  ? `// GENERIERT von scripts/voice-entry.mjs — nicht von Hand ändern.\nexport { voiceExtract } from './extract.js';\n`
  : `// GENERIERT von scripts/voice-entry.mjs — nicht von Hand ändern.\n//\n// Die KI-Spracherfassung ist abgeschaltet (ENABLE_VOICE ist nicht 'true'),\n// deshalb wird voiceExtract nicht exportiert. Damit verlangt der Deploy\n// auch keine API-Schlüssel im Secret Manager.\nexport {};\n`;

const ziel = resolve(dirname(fileURLToPath(import.meta.url)), '../src/voice-entry.ts');
writeFileSync(ziel, inhalt, 'utf8');
console.log(`KI-Spracherfassung: ${an ? 'EIN — voiceExtract wird deployt' : 'AUS — voiceExtract bleibt aussen vor'}`);
