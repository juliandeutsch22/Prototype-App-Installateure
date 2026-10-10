import { test, expect } from '@playwright/test';
import { MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * Die Seiten des Monteurs, eine nach der anderen (Nachtest 01.10.2026,
 * Paket E: „Handy zuerst“).
 *
 * Monteure arbeiten fast nur am Telefon. Dieser Weg läuft deshalb nicht nur
 * in Chromium am Schreibtisch, sondern auch in WebKit — der Maschine von
 * Safari auf jedem iPhone — bei 390 px und auf dem Tablet bei 834 px
 * (Projekte in `playwright.config.ts`). Geprüft wird, was dort zuerst kaputt
 * geht: die Seite lädt, sagt nicht „nicht geladen“, zeigt keinen Fehler und
 * ragt nicht seitlich aus dem Bild.
 */

const SEITEN: Array<[string, RegExp]> = [
  ['/', /./],
  ['/time', /Zeiterfassung/],
  ['/my-schedule', /Einsatzplan/],
  ['/my-projects', /Meine Baustellen/],
  ['/material', /Material/],
  ['/vacations', /Urlaub/],
  ['/worksheets', /Handwerksscheine/],
];

test('Die Seiten des Monteurs laden ohne Fehler und ohne seitliches Überlaufen', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  for (const [pfad, titel] of SEITEN) {
    await page.goto(pfad);
    const kopf = page.getByRole('heading', { level: 1 });
    await expect(kopf, `Überschrift auf ${pfad}`).toBeVisible({ timeout: 20_000 });
    await expect(kopf).toHaveText(titel);
    await expect(page.getByText(/Nicht geladen/), `„Nicht geladen“ auf ${pfad}`).toHaveCount(0);
    await keineFehlermeldung(page);
    const masse = await page.evaluate(() => ({
      breite: document.documentElement.scrollWidth, sicht: window.innerWidth,
    }));
    expect(masse.breite, `seitliches Überlaufen auf ${pfad}`).toBeLessThanOrEqual(masse.sicht);
  }
});

/*
  „EINSTELLUNGEN“ IN EINER ZEILE (10.10.2026). In der schmalen Leiste am
  Tablet brach es als „Einstellunge|n“ — Chromium ohne deutsches
  Trennwörterbuch bricht mitten im Wort. Gemessen wird die Zahl der Zeilen,
  auch als aktiver (fetter) Punkt.
*/
test('Am Tablet steht „Einstellungen“ in der Seitenleiste in einer Zeile', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet-834', 'nur die schmale Leiste am Tablet');
  await anmelden(page, MONTEUR.email);
  const kurz = page.locator('.navi .navi-text-kurz', { hasText: 'Einstellungen' });
  const zeilen = () =>
    kurz.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  // Und es ragt höchstens in den Innenabstand (2 px je Seite), nicht über den Punkt hinaus.
  const ueberstand = () => kurz.evaluate((el) => el.scrollWidth - el.clientWidth);
  /*
    GEMESSEN WIRD IN POPPINS, nicht in der Ersatzschrift, die bis zum Laden
    dasteht. Der aktive Kurztext bleibt am Tablet dünn (siehe `lot.css`) —
    fett lief er in der CI 8 px über.
  */
  const schriftDa = async (gewicht: number) => {
    const geladen = await page.evaluate((g) => document.fonts.load(`${g} 11px Poppins`).then((f) => f.length), gewicht);
    expect(geladen).toBeGreaterThan(0);
  };
  await schriftDa(400);
  expect(await zeilen()).toBe(1);
  expect(await ueberstand()).toBeLessThanOrEqual(2);
  await kurz.click();
  await expect(page.locator('.navi .navi-punkt-aktiv', { hasText: 'Einstellungen' })).toBeVisible();
  await schriftDa(400);
  expect(await kurz.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('400');
  expect(await zeilen()).toBe(1);
  expect(await ueberstand()).toBeLessThanOrEqual(2);
});
