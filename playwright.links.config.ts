import { defineConfig, devices } from '@playwright/test';

/**
 * Die Linkprüfung (offene Punkte C1): jede Rolle, jeder Link, gegen die
 * Vorschau mit Beispieldaten — ohne Datenbank. Siehe `tests/links/links.spec.ts`.
 *
 * GETRENNT VOM DURCHKLICK, weil der gegen den örtlichen Stapel läuft und
 * drei Konten kennt; hier braucht es alle sechs Rollen und Daten in jeder
 * Ansicht, und beides hat die Vorschau.
 */
const ORT = 'http://localhost:5199/tools/vorschau/';

export default defineConfig({
  testDir: './tests/links',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: ORT,
    viewport: { width: 1440, height: 1000 },
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        // Wie im Durchklick: ein fertiger Browser, wenn einer angegeben ist.
        launchOptions: process.env.CHROMIUM_PFAD
          ? { executablePath: process.env.CHROMIUM_PFAD }
          : {},
      },
    },
  ],
  webServer: {
    command: 'npm run vorschau',
    url: ORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
