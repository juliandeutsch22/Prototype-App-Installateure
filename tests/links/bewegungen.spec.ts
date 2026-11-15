import { test, expect, type Page } from '@playwright/test';

/*
  BEWEGUNGEN UND GESTEN (Plan 15.11.2026, Abschnitt 4 B1–B12, F15) im echten
  Browser — gegen die Vorschau, ohne Datenbank. Jsdom rechnet weder Layout
  noch Animationen; ob ein Blatt von unten kommt oder eine Zeile zusammenklappt,
  sieht nur ein Browser.

  JEDE BEWEGUNG ZWEIMAL: einmal mit Bewegung (es gibt einen Weg), einmal mit
  „Bewegung reduzieren“ (derselbe Endzustand, sofort, ohne Weg).

  Gemessen wird je Bild (`requestAnimationFrame`), nicht mit festen Pausen:
  eine Pause trifft je nach Rechner einen anderen Augenblick der Bewegung.
*/

const pfad = (route: string, rolle = 'Administrator') => `./?pfad=${encodeURIComponent(route)}&rolle=${rolle}`;

/**
 * Je Bild einen Wert aufzeichnen — ab dem Bild, in dem das Element (wieder)
 * da ist, `ms` lang; verschwindet es, endet die Spur mit „—“.
 */
async function aufzeichnen(page: Page, sel: string, eigenschaft: 'transform' | 'opacity', ms = 420) {
  await page.evaluate(([sel, eigenschaft, ms]) => {
    const w = window as unknown as { spur: Array<[number, string]>; spurFertig: boolean };
    w.spur = [];
    w.spurFertig = false;
    let t0 = -1;
    const bild = () => {
      const el = document.querySelector(sel as string);
      if (el && t0 < 0) t0 = performance.now();
      if (t0 >= 0) w.spur.push([performance.now() - t0, el ? getComputedStyle(el)[eigenschaft as 'transform'] : '—']);
      if (t0 < 0 || (performance.now() - t0 < (ms as number) && el)) requestAnimationFrame(bild);
      else w.spurFertig = true;
    };
    requestAnimationFrame(bild);
  }, [sel, eigenschaft, ms] as const);
}
async function spur(page: Page): Promise<Array<[number, string]>> {
  await page.waitForFunction(() => (window as unknown as { spurFertig: boolean }).spurFertig);
  return page.evaluate(() => (window as unknown as { spur: Array<[number, string]> }).spur);
}
/** Verschiebung aus einer Matrix: [x, y]. `none` und `—` zählen als 0. */
function versatz(m: string): [number, number] {
  const z = /matrix\(([^)]+)\)/.exec(m)?.[1].split(',').map(Number);
  return z ? [z[4], z[5]] : [0, 0];
}

test.describe('B1 Blatt von unten', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('fährt von unten herein und steht am Ende ohne Versatz', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/'));
    await expect(page.locator('.unten button').filter({ hasText: 'Mehr' })).toBeVisible();
    await aufzeichnen(page, '.blatt', 'transform');
    await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m)[1]);
    expect(Math.max(...s)).toBeGreaterThan(100);
    expect(s[s.length - 1]).toBe(0);
    // Von unten herauf: der Versatz nimmt nur ab.
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThanOrEqual(s[i - 1] + 0.5);
  });

  test('schließt nach unten und gibt erst danach den Platz frei', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/'));
    await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
    const dialog = page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(400);
    await aufzeichnen(page, '.blatt', 'transform', 300);
    await page.keyboard.press('Escape');
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m)[1]);
    expect(Math.max(...s)).toBeGreaterThan(100);
    await expect(dialog).toHaveCount(0);
  });

  test('weggezogen fährt es aus der Lage des Fingers weiter, ohne zurückzuspringen', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/'));
    await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
    await page.waitForTimeout(400);
    const griff = (await page.locator('.blatt-griff').boundingBox())!;
    await page.mouse.move(griff.x + griff.width / 2, griff.y + 8);
    await page.mouse.down();
    await page.mouse.move(griff.x + griff.width / 2, griff.y + 168, { steps: 10 });
    await aufzeichnen(page, '.blatt', 'transform', 300);
    await page.mouse.up();
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m)[1]);
    expect(s[0]).toBeGreaterThan(140);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1] - 0.5);
    await expect(page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true })).toHaveCount(0);
  });

  test('mit reduzierter Bewegung steht es sofort da — dasselbe Endbild', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(pfad('/'));
    await expect(page.locator('.unten button').filter({ hasText: 'Mehr' })).toBeVisible();
    await aufzeichnen(page, '.blatt', 'transform');
    await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m)[1]);
    expect(s.length).toBeGreaterThan(0);
    expect(Math.max(...s)).toBe(0);
  });
});

test.describe('B1 Seitenfenster ab dem Tablet', () => {
  test.use({ viewport: { width: 834, height: 1112 }, hasTouch: true });
  test('kommt von rechts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(pfad('/invoices'));
    await expect(page.getByRole('button', { name: 'Hilfe zu dieser Seite' }).first()).toBeVisible();
    await aufzeichnen(page, '.fenster', 'transform');
    await page.getByRole('button', { name: 'Hilfe zu dieser Seite' }).first().click();
    const s = (await spur(page)).filter(([, m]) => m !== '—').map(([, m]) => versatz(m));
    expect(Math.max(...s.map(([x]) => x))).toBeGreaterThan(100);
    expect(Math.max(...s.map(([, y]) => Math.abs(y)))).toBe(0);
    expect(s[s.length - 1]).toEqual([0, 0]);
  });
});
