import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Welche Fassung laeuft hier eigentlich?
 *
 * WARUM DAS NOETIG WURDE. „Es ist deployed" gegen „bei mir ist nichts da" —
 * und keiner von beiden konnte nachsehen. Die App hatte keine Stelle, an der
 * steht, welcher Stand gerade laeuft. Damit war jede Diagnose ein Ratespiel:
 * liegt es am Deploy, am Zwischenspeicher des Telefons, oder ist die
 * Aenderung schlicht an eine Bedingung geknuepft, die gerade nicht gilt?
 *
 * Die Kennung kommt aus dem Bau, nicht aus dem Programm: aus GitHub Actions
 * die Commit-Kennung, lokal die aus Git, und ein Zeitstempel dazu. Der
 * Zeitstempel ist der wichtigere Teil — eine Uhrzeit kann jeder vergleichen,
 * eine Pruefsumme muss man erst nachschlagen.
 */
function fassungsKennung(): string {
  let kurz = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!kurz) {
    try {
      kurz = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      // Kein Git zur Hand (z. B. ein Bau aus einem Archiv): dann genuegt die Zeit.
      kurz = 'ohne';
    }
  }
  const zeit = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  return `${kurz} · ${zeit}`;
}

// https://vitejs.dev/config/
/**
 * Die Fassungskennung zusaetzlich als eigene Datei ausliefern.
 *
 * WARUM ES DIESE DATEI BRAUCHT, obwohl der Service Worker die `index.html`
 * schon vergleicht: weil dieser Vergleich IM WORKER laeuft. Haengt der auf
 * einem alten Stand fest — und genau das war die Ausgangslage —, faellt der
 * Deploy nie auf, und die App hat keinen zweiten Weg, es zu erfahren.
 *
 * `/fassung.txt` ist dieser zweite Weg. Sie liegt nicht unter `/assets/`,
 * wird vom Worker also nicht angefasst, und die App holt sie mit
 * `cache: 'no-store'` direkt vom Server. Was dabei zurueckkommt, ist die
 * Wahrheit ueber den ausgelieferten Stand — unabhaengig davon, was der
 * Worker glaubt.
 */
function fassungsDatei(kennung: string): Plugin {
  return {
    name: 'fassung-txt',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'fassung.txt', source: kennung });
    },
  };
}

const KENNUNG = fassungsKennung();

export default defineConfig({
  plugins: [react(), fassungsDatei(KENNUNG)],
  define: {
    __FASSUNG__: JSON.stringify(KENNUNG),
  },
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
