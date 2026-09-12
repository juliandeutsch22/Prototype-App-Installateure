import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Getrennt von `npm test`, aus demselben Grund wie vitest.rules.config.ts:
 * diese Prüfungen brauchen einen laufenden Stack. Wer sie in den normalen
 * Lauf mischt, macht aus einem hermetischen Test einen, der von der Umgebung
 * abhängt — und dann schaltet ihn irgendwann jemand ab.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Ohne diesen Alias scheitert jeder Test, der über die Datenschicht bis
      // in die gemeinsame Zeitrechnung reicht — mit einer Meldung, die nach
      // einer fehlenden Datei aussieht und eine fehlende Zeile hier ist.
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    include: ['tests/supabase/**/*.test.ts'],
    /*
     * PLATZHALTER FÜR FIREBASE.
     *
     * Solange der Umzug läuft, zieht die Weiche in `db/x.ts` BEIDE Seiten
     * hoch — die Firestore-Fassung genauso wie die für Postgres. `lib/firebase.ts`
     * verlangt beim Import Zugangsdaten und wirft ohne sie; ein Test, der nur
     * die Postgres-Seite meint, scheitert dann an der anderen.
     *
     * Die Werte sind bewusst offensichtlich unbrauchbar: hier wird keine
     * Verbindung aufgebaut, es geht allein darum, dass das Modul lädt.
     * Stufe 9 entfernt die Firestore-Seite und mit ihr diese Zeilen.
     */
    env: {
      VITE_FIREBASE_API_KEY: 'nur-zum-laden',
      VITE_FIREBASE_PROJECT_ID: 'nur-zum-laden',
      VITE_FIREBASE_AUTH_DOMAIN: 'nur-zum-laden',
      VITE_FIREBASE_STORAGE_BUCKET: 'nur-zum-laden',
      VITE_FIREBASE_MESSAGING_SENDER_ID: 'nur-zum-laden',
      VITE_FIREBASE_APP_ID: 'nur-zum-laden',
    },
    // Leert die lokale Datenbank vor dem Lauf — siehe tests/supabase/aufraeumen.ts.
    globalSetup: ['tests/supabase/aufraeumen.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
