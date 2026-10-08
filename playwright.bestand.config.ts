import { defineConfig, devices } from '@playwright/test';

/**
 * Bestandsaufnahme und Bildschirmfotos für den Umbau „Lot“ (Phase A).
 * Siehe `tests/ui-umbau/bestand.spec.ts` und `docs/ui-umbau/protokoll.md`.
 *
 * EIGENE KONFIGURATION, damit die Aufnahme nicht in den gewöhnlichen
 * Prüfläufen mitläuft: sie dauert lange und schreibt Dateien unter
 * `docs/ui-umbau/`. Sie läuft gegen die Vorschau mit Beispieldaten auf
 * Port 4319 (`vite.bestand.config.ts`).
 *
 *   BESTAND_QUELLE=vorher|nachher npx playwright test -c playwright.bestand.config.ts --project=bestand
 *   BESTAND_QUELLE=vorher|nachher npx playwright test -c playwright.bestand.config.ts --project=fotos
 */
const ORT = 'http://localhost:4319/tools/vorschau/';
const browser = {
  ...devices['Desktop Chrome'],
  launchOptions: process.env.CHROMIUM_PFAD ? { executablePath: process.env.CHROMIUM_PFAD } : {},
};

export default defineConfig({
  testDir: './tests/ui-umbau',
  fullyParallel: true,
  workers: Number(process.env.BESTAND_ARBEITER ?? 3),
  retries: 0,
  timeout: 3 * 60 * 60 * 1000,
  reporter: [['list']],
  globalTeardown: './tests/ui-umbau/bestand/zusammenfuehren.ts',
  use: { baseURL: ORT, locale: 'de-AT', timezoneId: 'Europe/Vienna' },
  projects: [
    { name: 'bestand', testMatch: /bestand\.spec\.ts$/, use: browser },
    { name: 'fotos', testMatch: /fotos\.spec\.ts$/, use: browser },
  ],
  webServer: {
    command: 'node tools/vorschau/stubs-erzeugen.mjs && vite --config vite.bestand.config.ts',
    url: ORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
