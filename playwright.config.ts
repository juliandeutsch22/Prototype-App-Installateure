import { defineConfig, devices } from '@playwright/test';

/**
 * Der Durchklick: die App im echten Browser, gegen den örtlichen Stapel.
 *
 * WAS DIESE PRÜFUNGEN KÖNNEN, WAS DIE ANDEREN NICHT KÖNNEN. `npm test` prüft
 * Bausteine mit nachgebauter Umgebung, `npm run supabase:test` die
 * Datenschicht gegen die echte Datenbank. Beide sind blind für die Naht
 * dazwischen: eine Ansicht, die eine Funktion ruft, die es nicht mehr gibt;
 * ein Knopf, der nach dem Umbau ins Leere zeigt; ein Weg, der in der Mitte
 * abbricht. Genau diese Sorte hat der Rauchtest des Betriebs gefunden — drei
 * Stück an einem Nachmittag, keinen davon hat eine Prüfung vorher gesehen.
 *
 * WARUM NUR FÜNF WEGE. Ein Durchklick durch jede Ansicht kostet Stunden
 * Rechenzeit und flattert: eine Prüfung, die mal fällt und mal nicht, wird
 * nach zwei Wochen ignoriert, und dann ist sie schlimmer als keine. Hier
 * stehen die Wege, bei denen ein Fehler Geld oder Arbeitszeit kostet:
 * Zeit buchen, Material anfordern, Schein unterschreiben, Rechnung stellen.
 * Die Anmeldung steht nicht daneben — jeder beginnt damit.
 *
 * DER FÜNFTE IST DER KATALOGIMPORT, und er steht hier aus demselben Grund
 * wie die anderen vier, nicht aus Gewohnheit: ein verrutschtes Feld in einer
 * DATANORM-Datei setzt zehntausend falsche Einkaufspreise auf einmal, und
 * ab da rechnet jede Baustelle falsch. Gefunden hat dieser Weg schon bei
 * seinem ersten Lauf etwas, das keine der anderen Prüfungen sah.
 *
 * KEIN ZWEITER LAUF NACH EINEM FEHLSCHLAG (`retries: 0`), auch nicht in der
 * CI. Ein Wiederholungslauf versteckt genau das Flattern, das man sehen will;
 * lieber steht eine unzuverlässige Prüfung rot da, bis sie zuverlässig ist.
 */
const ORT = 'http://127.0.0.1:5173';

const STAPEL = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  /*
    KEINE FIREBASE-WERTE. Die App braucht sie nur für Push, und `lib/firebase.ts`
    lädt seit Stufe 9 erst dann, wenn sie da sind. Ohne sie meldet sich das
    Gerät nicht für Meldungen an — alles andere läuft. Genau das ist hier der
    gewollte Zustand: der Durchklick prüft die App, nicht die Push-Zustellung.
  */
};

export default defineConfig({
  testDir: './tests/durchklick',
  globalSetup: './tests/durchklick/aufbau.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: ORT,
    // Bei einem Fehlschlag das Bild und die Spur behalten: ein „Knopf nicht
    // gefunden" ohne Bild ist eine halbe Stunde Raten.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /*
          EIN FERTIGER BROWSER STATT EINES HERUNTERGELADENEN, wenn
          `CHROMIUM_PFAD` gesetzt ist. In der Entwicklungsumgebung liegt
          Chromium schon da, aber unter einer anderen Baunummer, als dieses
          Playwright erwartet — ohne diese Zeile lädt jeder Lauf ein paar
          hundert Megabyte nach, oder er bricht ab. In der CI ist die Variable
          nicht gesetzt, dort installiert der Auftrag den passenden selbst.
        */
        launchOptions: process.env.CHROMIUM_PFAD
          ? { executablePath: process.env.CHROMIUM_PFAD }
          : {},
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: ORT,
    // Einen schon laufenden Entwicklungsserver mitbenutzen: sonst scheitert
    // jeder Lauf auf einem Rechner, an dem gerade entwickelt wird.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: STAPEL,
  },
});
