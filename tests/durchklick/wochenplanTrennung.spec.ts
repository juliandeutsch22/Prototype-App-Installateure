import { test, expect } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden } from './helfer';

/**
 * Silbentrennung in den Tagesspalten (A16, 24.10.2026): Titel und Orte
 * eines Einsatzes trennt der Browser nach deutschen Regeln. Die Regel gilt
 * seit dem 24.09.2026 für die ganze App (`index.css`, `hyphens: auto` mit
 * `lang="de"`, Prüflauf D3) und wird in den Spalten geerbt — die Durchsicht
 * nahm an, sie fehle dort. Diese Prüfung hält fest, dass sie ankommt.
 *
 * Geprüft wird die Regel, nicht das Bild: das Chromium der Prüfung bringt kein
 * deutsches Trennwörterbuch mit (Safari, Firefox und ein installiertes Chrome
 * schon). Und nichts ragt aus seiner Spalte — abgeschnitten wird auch ohne
 * Wörterbuch nichts.
 */

const wien = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d);
let einsatzId = '';

test.beforeAll(async () => {
  const monteur = await admin.from('users').select('id, name').eq('email', MONTEUR.email).single();
  if (monteur.error) throw new Error(monteur.error.message);
  const neu = await admin.from('assignments').insert({
    company_id: BETRIEB, date: wien(new Date()), project_number: BAUSTELLE.nummer,
    user_id: (monteur.data as { id: string }).id,
  }).select('id').single();
  if (neu.error) throw new Error(neu.error.message);
  einsatzId = (neu.data as { id: string }).id;
});

test.afterAll(async () => {
  await admin.from('assignments').delete().eq('id', einsatzId);
});

test('die Tagesspalten trennen nach deutschen Regeln — und nichts ragt hinaus', async ({ page }) => {
  await anmelden(page, CHEFIN.email);
  await page.goto('/assignments/woche');
  const titel = page.locator('.e-titel').first();
  await expect(titel).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('de');
  for (const klasse of ['.e-titel', '.e-zeile']) {
    const el = page.locator(klasse).first();
    await expect(el).toBeVisible();
    expect(await el.evaluate((e) => getComputedStyle(e).hyphens), klasse).toBe('auto');
    expect(await el.evaluate((e) => e.scrollWidth - e.clientWidth), klasse).toBeLessThanOrEqual(1);
  }
});
