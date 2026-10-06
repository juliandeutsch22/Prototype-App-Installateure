import { test, expect, type Locator } from '@playwright/test';
import { MONTEUR } from './aufbau';
import { anmelden } from './helfer';

/**
 * ZEITERFASSUNG AM HANDY: DER KNOPF LIEGT BEIM ÖFFNEN ÜBER KEINEM FELD
 * (Testbericht Runde 3, G22).
 *
 * Gesehen bei 390 px: der klebende Knopf „Zeit buchen“ lag beim Öffnen über
 * dem Datumsfeld. Jetzt steht die Leiste beim Öffnen unter dem Formular und
 * klebt erst, wenn man ins Formular gerollt ist — dann bleibt sie, wie
 * gewollt, im Blick.
 *
 * Läuft bei 390 px (Chromium mit eigener Breite, WebKit als iPhone 13 —
 * `MONTEUR_WEGE` in playwright.config.ts) und auf dem Tablet bei 834 px.
 */
test.use({ viewport: { width: 390, height: 664 }, hasTouch: true });

type Kasten = { x: number; y: number; width: number; height: number };

function ueberlappt(a: Kasten, b: Kasten): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function kasten(l: Locator): Promise<Kasten> {
  const k = await l.boundingBox();
  expect(k, 'nicht auf dem Bildschirm').not.toBeNull();
  return k!;
}

test('Zeit buchen: beim Öffnen deckt die Leiste kein Feld zu, nach dem Rollen klebt sie', async ({ page }) => {
  await anmelden(page, MONTEUR.email);
  await page.goto('/time');
  const formular = page.locator('#zeit-formular');
  const datum = formular.getByLabel('Datum', { exact: true });
  await expect(datum).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState('networkidle');

  const leiste = formular.locator('.aktionsleiste');
  const hoehe = page.viewportSize()!.height;

  // 1. Beim Öffnen: kein sichtbares Feld unter der Leiste.
  const leisteKasten = await leiste.boundingBox();
  if (leisteKasten && leisteKasten.y < hoehe) {
    const felder = formular.locator('input:visible, select:visible, textarea:visible');
    const anzahl = await felder.count();
    for (let i = 0; i < anzahl; i += 1) {
      const k = await felder.nth(i).boundingBox();
      if (!k || k.y >= hoehe || k.y + k.height <= 0) continue;
      const name = (await felder.nth(i).getAttribute('id')) ?? `Feld ${i}`;
      expect(ueberlappt(k, leisteKasten), `„${name}“ liegt unter der Leiste`).toBe(false);
    }
  }
  // Und ausdrücklich das Feld aus dem Bericht.
  if (leisteKasten) expect(ueberlappt(await kasten(datum), leisteKasten)).toBe(false);

  // 2. Ins Formular gerollt: der Knopf klebt unten und bleibt im Blick.
  await formular.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const knopf = formular.getByRole('button', { name: 'Zeit buchen' });
  await expect(async () => {
    const k = await kasten(knopf);
    expect(k.y + k.height).toBeLessThanOrEqual(hoehe + 1);
    expect(k.y).toBeGreaterThanOrEqual(0);
  }).toPass({ timeout: 5_000 });
  // Das Datumsfeld steht dann oben, frei.
  expect(ueberlappt(await kasten(datum), await kasten(leiste))).toBe(false);
});
