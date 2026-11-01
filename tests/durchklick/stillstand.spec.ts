import { test, expect, type Page } from '@playwright/test';
import { BAUSTELLE, BUERO } from './aufbau';
import { anmelden, keineFehlermeldung, menue } from './helfer';

/**
 * „Teilweise lädt die App sehr lange bzw. gar nicht mehr — scheinbar
 * willkürlich beim Wechseln der Seiten“ (01.11.2026).
 *
 * Nachgestellt, wie es am Telefon passiert: eine Anfrage geht auf eine halb
 * tote Verbindung und kommt nie zurück — kein Fehler, keine Antwort. Hier
 * hält das Netz der Prüfung genau EINE Anfrage fest; die nächste geht durch,
 * wie über eine frische Verbindung. Ohne Stillstandsfrist (`lib/netzFrist.ts`)
 * wartet die App auf die festgehaltene für immer, und die Seite lädt nie.
 */

/** Hält die erste passende Anfrage fest, lässt alle weiteren durch; zählt mit. */
async function ersteFesthalten(page: Page, muster: RegExp): Promise<{ anzahl: () => number }> {
  let n = 0;
  await page.route(muster, async (route) => {
    n += 1;
    if (n === 1) return; // nie beantworten — die tote Verbindung
    await route.continue();
  });
  return { anzahl: () => n };
}

test('Steht die Erneuerung der Anmeldung still, geht der Seitenwechsel trotzdem weiter', async ({ page }) => {
  test.setTimeout(120_000);
  await anmelden(page, BUERO.email);

  /*
    Das Token gilt nur noch 30 s: die nächste Abfrage erneuert es zuerst —
    der Moment, in dem die App aus dem Hintergrund zurückkommt. ALLE Abfragen
    warten auf diese eine Erneuerung.
  */
  await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)!;
      if (!k.startsWith('sb-') || !k.endsWith('-auth-token')) continue;
      const s = JSON.parse(localStorage.getItem(k)!);
      s.expires_at = Math.floor(Date.now() / 1000) + 30;
      localStorage.setItem(k, JSON.stringify(s));
    }
  });
  const erneuern = await ersteFesthalten(page, /\/auth\/v1\/token\?grant_type=refresh_token/);

  const geladen = page.waitForResponse((r) => r.url().includes('/rest/v1/') && r.status() < 300, { timeout: 45_000 });
  await menue(page, 'Zeiterfassung', 'Zeit');
  await expect(page.getByRole('heading', { level: 1, name: 'Zeiterfassung' })).toBeVisible({ timeout: 45_000 });
  await geladen;
  // Die festgehaltene wurde aufgegeben und die Erneuerung wiederholt.
  expect(erneuern.anzahl()).toBeGreaterThanOrEqual(2);
  await keineFehlermeldung(page);

  // Und es bleibt dabei: die nächste Seite lädt ohne Wartezeit.
  await menue(page, 'Urlaub');
  await expect(page.getByRole('heading', { level: 1, name: 'Urlaub' })).toBeVisible({ timeout: 15_000 });
});

test('Steht ein Lesezugriff still, wird er über eine frische Verbindung wiederholt und die Liste lädt', async ({ page }) => {
  test.setTimeout(120_000);
  await anmelden(page, BUERO.email);
  /*
    JEDER Abruf der Kundenliste in den ersten 10 s steht still — auch der
    zweite, den React im Entwicklungsmodus doppelt stellt. Erst ein Abruf
    danach geht durch: die Wiederholung nach der Frist.
  */
  let gehalten = 0;
  const ab = Date.now();
  await page.route(/\/rest\/v1\/customers\?select=\*/, async (route) => {
    if (Date.now() - ab < 10_000) {
      gehalten += 1;
      return; // nie beantworten
    }
    await route.continue();
  });

  await menue(page, 'Kunden');
  await expect(page.getByRole('heading', { level: 1, name: 'Kunden' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(BAUSTELLE.kunde).first()).toBeVisible({ timeout: 60_000 });
  expect(gehalten).toBeGreaterThanOrEqual(1);
  await keineFehlermeldung(page);
});
