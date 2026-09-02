import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Gemeinsame Rechenregeln fuer App und Cloud Functions.
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Fremdpakete in eigene Dateien.
         *
         * NICHT, um den ersten Aufruf kleiner zu machen — React und die
         * Firebase-SDK werden beim Start beide gebraucht, die Bytes fallen
         * so oder so an. Sondern für JEDEN WEITEREN Aufruf nach einem
         * Deploy: die Dateinamen tragen einen Inhalts-Fingerabdruck, und
         * diese beiden Pakete ändern sich fast nie. Lagen sie mit unserem
         * Code in einer Datei, lud das Telefon nach jeder noch so kleinen
         * Änderung ein knappes Megabyte neu.
         *
         * Getrennt sind es dann nur noch die paar Kilobyte, die sich
         * wirklich geändert haben.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
          if (id.includes('/react-dom/') || id.includes('/react-router')) return 'react';
        },
      },
    },
  },
});
