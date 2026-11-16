import { test as basis, expect, type Browser, type BrowserContext } from '@playwright/test';

/**
 * EIGENE BROWSERFENSTER WERDEN NACH JEDEM WEG GESCHLOSSEN (16.11.2026).
 *
 * Wege mit mehreren Personen (Monteur, Büro, Geschäftsführung) öffnen je
 * Person ein Fenster mit `browser.newContext()`. Playwright schließt nur das
 * eigene Fenster eines Wegs; die selbst geöffneten blieben bis zum Ende des
 * ganzen Laufs offen — mit laufender App, Echtzeitkanal und Taktgebern. In
 * langen Läufen waren es Dutzende, und gegen Ende brachen einzelne Wege mit
 * `net::ERR_INSUFFICIENT_RESOURCES` oder „Seite geschlossen“ ab, die allein
 * grün liefen.
 *
 * Geschlossen wird erst nach dem Weg: die Bilder bei Rot nimmt Playwright
 * vorher auf, aus allen Fenstern. Wer `browser.newContext()` nutzt, holt
 * `test` von hier (Wächter: `tests/unit/durchklickFenster.test.ts`).
 */
export const test = basis.extend<{ eigeneFensterSchliessen: void }>({
  eigeneFensterSchliessen: [async ({ browser }, use) => {
    const geoeffnet: BrowserContext[] = [];
    const original = browser.newContext.bind(browser) as Browser['newContext'];
    browser.newContext = (async (...args: Parameters<Browser['newContext']>) => {
      const k = await original(...args);
      geoeffnet.push(k);
      return k;
    }) as Browser['newContext'];
    try {
      await use();
    } finally {
      browser.newContext = original;
      for (const k of geoeffnet) await k.close().catch(() => undefined);
    }
  }, { auto: true }],
});

export { expect };
