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
    include: ['tests/unit/**/*.test.ts', 'tests/components/**/*.test.tsx'],
    environment: 'node',
    environmentMatchGlobs: [['tests/components/**', 'jsdom']],
    setupFiles: ['tests/components/setup.ts'],
  },
});
