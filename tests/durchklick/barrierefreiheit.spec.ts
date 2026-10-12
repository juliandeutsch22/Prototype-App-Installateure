import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BUERO, CHEFIN, MONTEUR } from './aufbau';
import { anmelden } from './helfer';

/**
 * Barrierefreiheit nach WCAG 2.1 A/AA — axe über jede Seite des eigenen
 * Menüs, für drei Rollen, hell und dunkel (Stand 18, K2, 12.10.2026).
 *
 * WARUM HIER UND NICHT NUR EINMAL VON HAND. Der erste Lauf über alle Rollen
 * und Breiten fand genau eine Stelle — blasse Schrift im Monatskalender
 * (2,8 : 1) —, und die stand dort seit Wochen, weil sie niemand gemessen
 * hat. Eine Prüfung, die nur einmal läuft, findet die nächste nicht.
 *
 * WAS SIE NICHT KANN: axe misst, was sich messen lässt — Kontrast, Namen von
 * Knöpfen und Feldern, Rollen, Sprache. Ob eine Seite verständlich ist,
 * misst es nicht.
 *
 * Gegenprobe: mit `text-ink-muted/70` im Monatskalender (der Stand vor K2)
 * ist sie auf „Urlaub“ der Chefin und „Mein Einsatzplan“ rot.
 */

const REGELN = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function befunde(page: Page, wo: string): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(REGELN).analyze();
  return r.violations.map(
    (v) => `${wo}: ${v.id} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`,
  );
}

/** Die Seiten, die das Menü dieser Rolle anbietet — dazu die Einstellungen. */
async function seitenDesMenues(page: Page): Promise<string[]> {
  const ziele = await page
    .locator('aside a[href^="/"]')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  return [...new Set([...ziele, '/settings'])];
}

async function laden(page: Page, pfad: string): Promise<void> {
  await page.goto(pfad);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  // Gemessen wird der fertige Stand, nicht der Platzhalter davor.
  await page.waitForLoadState('networkidle');
}

async function alleSeiten(page: Page, email: string): Promise<string[]> {
  await anmelden(page, email);
  const funde: string[] = [];
  for (const pfad of await seitenDesMenues(page)) {
    await laden(page, pfad);
    funde.push(...(await befunde(page, pfad)));
  }
  return funde;
}

test.describe('Barrierefreiheit (axe, WCAG 2.1 AA)', () => {
  // Jede Seite des Menüs einmal: das dauert länger als ein einzelner Weg.
  test.describe.configure({ timeout: 300_000 });

  test('die Anmeldung', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
    expect(await befunde(page, '/ (Anmeldung)')).toEqual([]);
  });

  test('jede Seite der Geschäftsführung', async ({ page }) => {
    expect(await alleSeiten(page, CHEFIN.email)).toEqual([]);
  });

  test('jede Seite der Buchhaltung', async ({ page }) => {
    expect(await alleSeiten(page, BUERO.email)).toEqual([]);
  });

  test('jede Seite des Monteurs', async ({ page }) => {
    expect(await alleSeiten(page, MONTEUR.email)).toEqual([]);
  });

  /*
    DUNKEL NUR AUF WAHL: die App folgt der Systemeinstellung bewusst nicht
    (`lib/darstellung.ts`). Gemessen wird deshalb mit der eigenen Wahl, nicht
    mit `colorScheme` — der erste Lauf mit `colorScheme: 'dark'` hatte in
    Wahrheit hell gemessen.
  */
  test('dunkel: jede Seite der Geschäftsführung', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('senklot.darstellung', 'dunkel'));
    const funde = await alleSeiten(page, CHEFIN.email);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(funde).toEqual([]);
  });

  /*
    AUCH WAS SICH ÖFFNET: axe sieht nur, was gerade im Dokument steht. Hier
    die Hilfe zu einer Seite (dort fand der erste Lauf den nicht erreichbaren
    Fensterinhalt) und die Suche (Strg+K). Seitenfenster, Formulare und
    ⋯-Menüs aller Rollen hat die Durchsicht vom 12.10.2026 einmal über den
    Testbestand geprüft — ohne weiteren Befund.
  */
  test('Hilfe und Suche', async ({ page }) => {
    await anmelden(page, CHEFIN.email);
    const funde: string[] = [];

    await laden(page, '/vacations');
    await page.getByRole('button', { name: 'Hilfe zu dieser Seite' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    funde.push(...(await befunde(page, '/vacations Hilfe')));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();
    funde.push(...(await befunde(page, 'Suche')));
    await page.keyboard.press('Escape');

    expect(funde).toEqual([]);
  });
});
