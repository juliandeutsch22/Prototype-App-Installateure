import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Getrennt von `npm test`: diese Prüfungen brauchen einen laufenden Stack.
 * Wer sie in den normalen Lauf mischt, macht aus einem hermetischen Test
 * einen, der von der Umgebung abhängt — und dann schaltet ihn irgendwann
 * jemand ab.
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
    env: {
      /*
        Die Anmeldung spricht über `lib/supabase.ts` mit dem lokalen Stapel —
        und die liest ihre Zugangsdaten aus der Umgebung. Ohne diese beiden
        Zeilen wirft sie beim ersten Zugriff, und zwar mit einer Meldung über
        fehlende Variablen statt über die Sache.
      */
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    },
    // Leert die lokale Datenbank vor dem Lauf — siehe tests/supabase/aufraeumen.ts.
    globalSetup: ['tests/supabase/aufraeumen.ts'],
    environment: 'node',
    /*
      DIE ANMELDUNG BRAUCHT EINEN BROWSER. Sie legt die Sitzung im
      `localStorage` oder im `sessionStorage` ab — das ist keine Nebensache,
      sondern die Entscheidung „überlebt die Sitzung den Browser".
      Nachgebaute Speicher würden genau das nicht prüfen.
    */
    environmentMatchGlobs: [['tests/supabase/anmeldung.test.ts', 'jsdom']],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
