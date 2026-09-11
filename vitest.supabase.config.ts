import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Getrennt von `npm test`, aus demselben Grund wie vitest.rules.config.ts:
 * diese Prüfungen brauchen einen laufenden Stack. Wer sie in den normalen
 * Lauf mischt, macht aus einem hermetischen Test einen, der von der Umgebung
 * abhängt — und dann schaltet ihn irgendwann jemand ab.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    include: ['tests/supabase/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
