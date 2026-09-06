import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests ohne Emulator: reine Logik und Komponenten.
//
// Zwei Umgebungen in einer Config: die Logik-Tests laufen in Node (schnell),
// die Komponenten-Tests brauchen ein DOM. Eine gemeinsame jsdom-Umgebung wäre
// bequemer, würde aber jeden Rechen-Test durch einen nachgebauten Browser
// schicken, ohne dass er etwas davon hat.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
      /*
        Die Cloud Functions testbar machen, OHNE eine Zeile an ihnen zu ändern.

        `firebase-admin` und `firebase-functions` liegen nur unter
        `functions/node_modules`; aus dem Wurzelprojekt sind sie nicht
        auflösbar. Genau daran hing es, dass bisher nur die ausgelagerte reine
        Logik geprüft war und alles, was mit der Datenbank spricht, gar nicht.

        Die Alternative wäre gewesen, beides als Entwicklungsabhängigkeit
        aufzunehmen — rund 60 MB und ein zweiter Firebase-Baum im Projekt, nur
        damit ein Import auflöst. Stattdessen wird hier ein Ersatz
        untergeschoben. Der ECHTE Handler läuft, nur die Aussenwelt ist
        nachgebaut.

        Die Reihenfolge zählt: die spezifischen Pfade müssen VOR den kurzen
        stehen, sonst schluckt `firebase-functions` auch
        `firebase-functions/v2/https`.
      */
      'firebase-functions/v2/https': path.resolve(__dirname, './tests/functions/ersatz/funktionen.ts'),
      'firebase-functions/v2/firestore': path.resolve(__dirname, './tests/functions/ersatz/funktionen.ts'),
      'firebase-functions/v2/scheduler': path.resolve(__dirname, './tests/functions/ersatz/funktionen.ts'),
      'firebase-functions/params': path.resolve(__dirname, './tests/functions/ersatz/funktionen.ts'),
      'firebase-functions': path.resolve(__dirname, './tests/functions/ersatz/funktionen.ts'),
      'firebase-admin/firestore': path.resolve(__dirname, './tests/functions/ersatz/firestore.ts'),
      'firebase-admin/auth': path.resolve(__dirname, './tests/functions/ersatz/auth.ts'),
      'firebase-admin/storage': path.resolve(__dirname, './tests/functions/ersatz/storage.ts'),
      'firebase-admin/messaging': path.resolve(__dirname, './tests/functions/ersatz/messaging.ts'),
    },
  },
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/components/**/*.test.tsx',
      'tests/functions/**/*.test.ts',
    ],
    environment: 'node',
    environmentMatchGlobs: [['tests/components/**', 'jsdom']],
    setupFiles: ['tests/components/setup.ts'],
  },
});
