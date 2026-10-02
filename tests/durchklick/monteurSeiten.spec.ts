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
