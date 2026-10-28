import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [390, 834, 1440]) for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Premium: Dialog und Navigation ${width}, ${reducedMotion}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion });
    await page.goto('./?pfad=%2Fsettings%2Ffirma&rolle=Administrator');
    await page.getByLabel('Firmenname', { exact: true }).fill('Offene Briefkopfänderung');
    if (width < 760) {
      await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
      await page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true }).getByRole('link', { name: 'Kunden', exact: true }).click();
    } else await page.locator('.navi').getByRole('link', { name: 'Kunden', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ungespeicherte Änderungen verwerfen?', exact: true });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
    if (reducedMotion === 'reduce') expect(await dialog.evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length)).toBe(0);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('Firmenname', { exact: true })).toHaveValue('Offene Briefkopfänderung');
    // Das mobile Mehr-Blatt bleibt absichtlich unter der abgebrochenen Rückfrage.
    if (width < 760) { await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); }
    await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
    await expect(page.getByText('Keine offenen Änderungen', { exact: true })).toBeVisible();
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test('Premium: mobiles Blatt bleibt bei schnellen Folgen und Ziehen bedienbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?pfad=%2F&rolle=Administrator');
  const mehr = page.locator('.unten button').filter({ hasText: 'Mehr' });
  for (let i = 0; i < 6; i++) {
    await mehr.click(); await expect(page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(mehr).toBeFocused();
  }
  await mehr.click();
  const griff = await page.locator('.blatt-griff').boundingBox(); expect(griff).not.toBeNull();
  await page.mouse.move(griff!.x + griff!.width / 2, griff!.y + 10); await page.mouse.down();
  await page.mouse.move(griff!.x + griff!.width / 2, griff!.y + 140, { steps: 8 }); await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
});

test('Premium: Maus über der Meldung pausiert, ohne Klicks auf die Seite zu sperren', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Die WebKit-Konfiguration emuliert Touch ohne Maus-Hover.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./?pfad=%2Fsettings%2Ffirma&rolle=Administrator');
  await page.getByLabel('Firmenname', { exact: true }).fill('Gespeicherter Teststand');
  await page.getByRole('button', { name: 'Firmendaten speichern', exact: true }).click();
  const text = page.getByText('Firmendaten gespeichert', { exact: true });
  await expect(text).toBeVisible();
  const zeile = text.locator('..');
  await expect(zeile).toHaveCSS('pointer-events', 'none');
  const box = await zeile.boundingBox(); expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(3700);
  await expect(text).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(text).toHaveCount(0, { timeout: 4500 });
});

test('Premium: ein am Tablet verborgenes Mehr-Blatt hält keinen Fokus fest', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?pfad=%2F&rolle=Administrator');
  await page.locator('.unten button').filter({ hasText: 'Mehr' }).click();
  await expect(page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 834, height: 1000 });
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
  const ziel = page.locator('.navi a').first(); await ziel.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !document.activeElement?.closest('.blatt'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Weitere Bereiche', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const [route, aktion] of [['/admin-projects', 'Neue Baustelle'], ['/quotes', 'Neues Angebot']]) {
  test(`Premium: Erstnutzung mit einer eindeutigen Hauptaktion ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.route('**/tools/vorschau/daten.ts*', async r => {
      const response = await r.fetch();
      await r.fulfill({ response, body: (await response.text()) + '\nbaustellen.length=0;angebote.length=0;' });
    });
    await page.goto(`./?pfad=${encodeURIComponent(route)}&rolle=Administrator`);
    await expect(page.locator('.lot-leerzeichnung')).toHaveCount(1);
    await expect(page.getByRole('button', { name: aktion, exact: true })).toHaveCount(1);
    if (route === '/quotes') {
      await page.locator('main input[type=search]').fill('zzzz');
      await expect(page.locator('.lot-leerzeichnung')).toHaveCount(0);
      await expect(page.getByText('Kein Angebot passt zur Suche.', { exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: aktion, exact: true }).click();
    await expect(page.getByLabel(route === '/quotes' ? 'Bezeichnung' : 'Projektnummer', { exact: true })).toBeVisible();
  });
}
