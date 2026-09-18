import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vorschau: echte Ansichten, gestubbte Datenschicht. Siehe
 * `tools/vorschau/README.md`.
 *
 * DIE UMLEITUNG LAEUFT UEBER `resolve.alias` UND NICHT UEBER EIN PLUGIN.
 * Vites eigene Alias-Aufloesung kommt auch einem `enforce: 'pre'` zuvor:
 * `@/lib/db/x` war laengst zu `/src/lib/db/x.ts` geworden, bevor ein Plugin
 * ueberhaupt gefragt wurde. Die Stubs sahen damit aus, als waeren sie da —
 * die Listen blieben aber leer, weil in Wirklichkeit die echten Module liefen.
 *
 * Reihenfolge zaehlt: die spezifischen Muster VOR dem allgemeinen `@`.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      /*
        Nur fuer `./AuthContext`: relative Bezeichner erfasst `resolve.alias`
        nicht (dort steht kein Muster, das darauf passt), also kommt hier ein
        Plugin zum Zug — anders als bei `@/...`, wo der Alias schneller ist.
      */
      name: 'vorschau-auth-relativ',
      enforce: 'pre',
      resolveId(quelle: string, von?: string) {
        if (quelle === './AuthContext' && von?.includes('/src/app/')) {
          return path.resolve(__dirname, 'tools/vorschau/AuthStub.tsx');
        }
        return null;
      },
    },
  ],
  define: { __FASSUNG__: JSON.stringify('vorschau') },
  resolve: {
    alias: [
      { find: /^@\/app\/AuthContext$/, replacement: path.resolve(__dirname, 'tools/vorschau/AuthStub.tsx') },
      { find: /^@\/lib\/db\/(.*)$/, replacement: path.resolve(__dirname, 'tools/vorschau/db') + '/$1' },
      { find: /^@\/lib\/(firebase|supabase|push)$/, replacement: path.resolve(__dirname, 'tools/vorschau/leer.ts') },
      { find: '@shared', replacement: path.resolve(__dirname, './shared') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: { port: 5199 },
});
