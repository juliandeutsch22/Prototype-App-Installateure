import { defineConfig, devices } from '@playwright/test';

/**
 * Der Rundgang unter der durchgesetzten Inhaltsregel (Testbericht Runde 6,
 * Abschnitt 8 und Hinweis 13; 27.10.2026). Siehe `tests/csp/rundgang.spec.ts`.
 *
 * GEGEN DEN FERTIGEN BAU, nicht gegen den Entwicklungsserver. Der Durchklick
 * (`playwright.config.ts`) läuft gegen `vite` (dev): der spielt eigene Skripte
 * und Stile in die Seite und schickt bewusst KEINE Inhaltsregel. Ob die
 * durchgesetzte Regel etwas sperrt, das die App braucht, zeigt nur der Bau,
 * ausgeliefert von `vite preview` mit denselben Kopfzeilen wie Firebase
 * Hosting (`vite.config.ts`, `vorschauKopfzeilen`). Eine Regel, die die
 * eigene App sperrt, wäre live eine weiße Seite — hier fällt sie vorher auf.
 *
 * Am Schreibtisch und am Telefon in Chromium, dazu am iPhone in WebKit.
 *
 * Gegen den örtlichen Stapel und mit den Konten des Durchklicks
 * (`tests/durchklick/aufbau.ts`): Monteur, Buchhaltung, Geschäftsführung.
 */
const ORT = 'http://127.0.0.1:4173';
const CHROMIUM_START = process.env.CHROMIUM_PFAD ? { executablePath: process.env.CHROMIUM_PFAD } : {};

const STAPEL = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
};

export default defineConfig({
  testDir: './tests/csp',
  globalSetup: './tests/durchklick/aufbau.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: ORT,
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'schreibtisch',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 }, launchOptions: CHROMIUM_START },
    },
    {
      // Am Telefon laufen andere Teile: Leiste unten, Blätter von unten, Handy-Woche.
      name: 'telefon',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 400, height: 860 },
        hasTouch: true,
        isMobile: true,
        launchOptions: CHROMIUM_START,
      },
    },
    {
      // Safari setzt die Regel selbst durch, nicht Chromium: am iPhone der
      // Monteure läuft WebKit. Örtlich fehlt WebKit oft; in der CI ist es da.
      name: 'iphone',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: ORT,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    env: STAPEL,
  },
});
