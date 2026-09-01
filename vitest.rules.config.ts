import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Tests, die einen echten Firestore brauchen (Emulator).
 *
 * Zwei Dateien, zwei Fragen:
 *
 *  - `firestore.rules.test.ts` fragt: darf diese Rolle dieses DOKUMENT?
 *  - `abfragen.smoke.test.ts` fragt: läuft die ABFRAGE, die die App
 *    tatsächlich absetzt — mit ihren Filtern, Sortierungen und Grenzen?
 *
 * Die zweite Frage beantwortet kein Komponententest, weil dort jeder
 * Datenbankzugriff ersetzt ist. Genau in dieser Lücke lagen die Fehler, die
 * aus dem Betrieb gemeldet wurden.
 *
 * Der Alias muss hier stehen, weil der Smoketest die ECHTEN Module aus
 * `src/lib/db` verwendet — nachgebaute wären wertlos.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    include: ['tests/firestore.rules.test.ts', 'tests/abfragen.smoke.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
