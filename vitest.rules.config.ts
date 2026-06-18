import { defineConfig } from 'vitest/config';

// Separate Config für Security-Rules-Tests (laufen gegen den Firestore-Emulator).
export default defineConfig({
  test: {
    include: ['tests/firestore.rules.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
