import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Die Vorschau für die Bestandsaufnahme (Umbau „Lot“, Phase A).
 *
 * Dieselbe Umleitung wie `vite.vorschau.config.ts` — echte Ansichten,
 * gestubbte Datenschicht —, nur mit einem Anmelde-Ersatz, der auch Freigaben,
 * Lehrling, globalen Admin und Supportmodus kennt
 * (`tests/ui-umbau/vorschau/AuthStubBestand.tsx`).
 *
 * EIN EIGENER PORT (4319), damit die Aufnahme neben einer laufenden Vorschau
 * oder Linkprüfung (5199) stehen kann.
 *
 * Reihenfolge der Muster wie dort: die spezifischen VOR dem allgemeinen `@`.
 */
const STUB = path.resolve(__dirname, 'tests/ui-umbau/vorschau/AuthStubBestand.tsx');

export default defineConfig({
  plugins: [
    react(),
    {
      // Relative Bezeichner erfasst `resolve.alias` nicht — siehe vite.vorschau.config.ts.
      name: 'bestand-auth-relativ',
      enforce: 'pre',
      resolveId(quelle: string, von?: string) {
        if (quelle === './AuthContext' && von?.includes('/src/app/')) return STUB;
        return null;
      },
    },
  ],
  define: { __FASSUNG__: JSON.stringify('vorschau') },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: [
      { find: /^@\/app\/AuthContext$/, replacement: STUB },
      { find: /^@\/lib\/auth\/sitzung$/, replacement: path.resolve(__dirname, 'tools/vorschau/sitzung.ts') },
      { find: /^@\/lib\/auth\/provisionUser$/, replacement: path.resolve(__dirname, 'tools/vorschau/provisionUser.ts') },
      // Plattform und Supportmodus brauchen Daten, die die erzeugten Stubs nicht haben.
      {
        find: /^@\/lib\/db\/(plattform|support|fehlerprotokoll)$/,
        replacement: path.resolve(__dirname, 'tests/ui-umbau/vorschau/db') + '/$1.js',
      },
      { find: /^@\/lib\/db\/(.*)$/,replacement: path.resolve(__dirname, 'tools/vorschau/db') + '/$1' },
      { find: /^@\/lib\/(firebase|supabase|push)$/, replacement: path.resolve(__dirname, 'tools/vorschau/leer.ts') },
      { find: '@shared', replacement: path.resolve(__dirname, './shared') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: { port: 4319, strictPort: true },
});
