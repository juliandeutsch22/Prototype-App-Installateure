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
    },
  },
  test: {
    // Welche Dateien zu welcher Umgebung gehören, steht unten bei `projects`.
    /*
      ZUR ZEITZONE: sie steht im `test`-Skript in package.json, nicht hier.

      `test.env` kommt zu spät — Node liest die Zonendatenbank beim Start des
      Arbeitsprozesses und merkt sich das Ergebnis; eine später gesetzte
      Umgebungsvariable erreicht `Intl` nicht mehr. Deshalb `TZ=Europe/Vienna`
      vor dem Aufruf.

      WARUM ÜBERHAUPT. Der Bauserver steht auf UTC, und UTC kennt keine
      Sommerzeit. Jeder Test, der eine Zeitumstellung prüft, ginge dort durch,
      ohne etwas zu prüfen. Die App läuft in Österreich; die Tests auch.
      `wartungsplan.test.ts` stellt fest, dass die Einstellung wirkt — sonst
      verschwände sie still und die Sommerzeit-Tests würden grün, ohne etwas
      zu bedeuten.
    */
    environment: 'node',
    setupFiles: ['tests/components/setup.ts'],
    /*
      Die Ansichtsprüfungen brauchen einen nachgebauten Browser, die übrigen
      nicht. Früher `environmentMatchGlobs`; Vitest 4 kennt nur noch Projekte.
    */
    projects: [
      { extends: true, test: { name: 'rechnung', include: ['tests/unit/**/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'ansicht', include: ['tests/components/**/*.test.tsx'], environment: 'jsdom' },
      },
    ],
  },
});
