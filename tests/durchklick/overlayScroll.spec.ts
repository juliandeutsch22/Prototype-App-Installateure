import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { CHEFIN } from './aufbau';
import { anmelden } from './helfer';

/**
 * DIE SEITE HINTER EINEM BLATT STEHT STILL (Rückmeldung 09.10.2026, iPhone):
 * im Blatt „Neuen Kunden anlegen“ scrollte teils nur die Seite dahinter.
 *
 * Gewischt wird mit echten Touch-Ereignissen über die Chromium-Schnittstelle
 * (Start, Bewegen, Ende) — wie ein Finger, nicht über `scrollTo`. Nur in
 * Chromium: WebKit hat diese Schnittstelle nicht. Die Sperre selbst prüft
 * `tests/components/hintergrundSperre.test.tsx` für alle Overlays.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function wisch(page: Page, cdp: CDPSession, x: number, y: number, dy: number) {
  const schritte = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= schritte; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / schritte }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
}

test('im Blatt wischen scrollt das Blatt, nicht die Seite dahinter', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch-Ereignisse über die Chromium-Schnittstelle');
  test.setTimeout(120_000);
  await anmelden(page, CHEFIN.email);
  await page.goto('/customers');
  await expect(page.getByRole('button', { name: 'Neuer Kunde' }).last()).toBeVisible({ timeout: 20_000 });
  // Die Seite sicher länger als das Fenster machen, damit es etwas zu verschieben gäbe.
  await page.evaluate(() => {
    const platz = document.createElement('div');
    platz.style.height = '2000px';
    document.querySelector('.inhalt')!.appendChild(platz);
    window.scrollTo(0, 300);
  });
  const cdp = await page.context().newCDPSession(page);
  const seite = () => page.evaluate(() => Math.round(window.scrollY));

  await page.getByRole('button', { name: 'Neuer Kunde' }).last().click();
  const blatt = page.getByRole('dialog', { name: 'Neuen Kunden anlegen' });
  await expect(blatt).toBeVisible();
  const start = await seite();

  for (let i = 0; i < 4; i++) await wisch(page, cdp, 195, 700, -400);
  // Das Blatt ist bis ans Ende gescrollt …
  const innen = await page.evaluate(() => {
    const e = document.querySelector('.fenster-inhalt')!;
    return { oben: e.scrollTop, max: e.scrollHeight - e.clientHeight };
  });
  expect(innen.max).toBeGreaterThan(0);
  expect(innen.oben).toBeGreaterThanOrEqual(innen.max - 2);
  // … und die Seite dahinter hat sich nicht bewegt.
  expect(await seite()).toBe(start);

  for (let i = 0; i < 4; i++) await wisch(page, cdp, 195, 400, 400);
  expect(await seite()).toBe(start);

  // Geschlossen scrollt die Seite wieder wie gewohnt.
  await page.keyboard.press('Escape');
  await expect(blatt).toHaveCount(0);
  await wisch(page, cdp, 195, 500, -200);
  expect(await seite()).toBeGreaterThan(start);
});
