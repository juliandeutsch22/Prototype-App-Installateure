import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit-Tests für reine Logik (kein Emulator nötig).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
