import { test, expect, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * TESTBERICHT RUNDE 5 IM BROWSER — was nur mit echtem Layout zu sehen ist:
 *  G1  Schleier und Seitenfenster beginnen am Fensterrand, auch in einem
 *      `space-y-*`-Behälter; darüber ist nichts von der Seite antippbar.
 *  G4  Eine Uhrzeit bricht am Tablet nicht um („13:00–/16:00“).
 *  G5  Am Handy steht über der Mitarbeiterübersicht die Tageszeile, genau
 *      über den Kästchen.
 *  G9  „Woche | Monat | Tag“ steht in allen drei Ansichten an derselben
 *      Stelle, und „Tag“ ist so breit wie Woche und Monat.
 */
const heute = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

async function rechteck(page: Page, selektor: string) {
  return page.locator(selektor).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
}

test('G1: das Seitenfenster beginnt am Rand — oben ist nichts von der Seite antippbar', async ({ page }) => {
  test.setTimeout(120_000);
  await anmelden(page, CHEFIN.email);
  for (const breite of [1440, 834, 390]) {
    await page.setViewportSize({ width: breite, height: 900 });
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Neuer Kunde' }).last().click({ timeout: 20_000 });
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await rechteck(page, '.schleier')).y, `Schleier bei ${breite}`).toBe(0);
    // Was ganz oben liegt, gehört zum Schleier oder zum Fenster — nicht zur Seite.
    const oben = await page.evaluate(() => {
      const el = document.elementFromPoint(10, 3);
      return !!el?.closest('.schleier');
    });
    expect(oben, `oben links bei ${breite}`).toBe(true);
    if (breite >= 760) expect((await rechteck(page, '[role="dialog"]')).y, `Fenster bei ${breite}`).toBe(0);
    await page.keyboard.press('Escape');
  }
  await keineFehlermeldung(page);
});

test.describe('Einsatzplanung', () => {
  async function abraeumen() {
    await admin.from('termine').delete().eq('company_id', BETRIEB);
  }
  test.beforeEach(abraeumen);
  test.afterEach(abraeumen);

  test('G4: am Tablet bricht die Uhrzeit eines Termins nicht um', async ({ page }) => {
    test.setTimeout(120_000);
    const { data } = await admin.from('users').select('id').eq('email', MONTEUR.email).single();
    const { error } = await admin.from('termine').insert({
      company_id: BETRIEB, art: 'Kundentermin', datum: heute(), zeit_von: '13:00', zeit_bis: '16:00',
      project_number: BAUSTELLE.nummer, teilnehmer: [data!.id],
    });
    expect(error).toBeNull();

    await page.setViewportSize({ width: 834, height: 1112 });
    await anmelden(page, CHEFIN.email);
    await page.goto('/assignments/woche');
    const zeit = page.locator('.eintrag-termin .e-zeit').first();
    await expect(zeit).toHaveText('13:00–16:00', { timeout: 20_000 });
    // Eine Zeile: so hoch wie eine Zeile Text, nicht zwei.
    const { hoehe, zeile } = await zeit.evaluate((el) => ({
      hoehe: el.getBoundingClientRect().height,
      zeile: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(hoehe).toBeLessThan(zeile * 1.5);
    await keineFehlermeldung(page);
  });

  test('G9: der Umschalter steht in Woche, Monat und Tag an derselben Stelle, „Tag“ in voller Breite', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await anmelden(page, CHEFIN.email);
    const lage: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const breite: Record<string, number> = {};
    for (const [name, pfad] of [['Woche', '/assignments/woche'], ['Monat', '/assignments/woche?ansicht=monat'], ['Tag', '/assignments/tag']]) {
      await page.goto(pfad);
      const wahl = page.getByRole('group', { name: 'Zeitraum' });
      await expect(wahl).toBeVisible({ timeout: 20_000 });
      // Die rechte Kante: das gedrückte Segment ist halbfett und je nach Ansicht ein paar Pixel breiter.
      const r = await wahl.evaluate((el) => {
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.right), y: Math.round(b.y), w: Math.round(b.width), h: 0 };
      });
      lage[name] = r;
      breite[name] = (await rechteck(page, '.inhalt')).w;
    }
    expect(Math.abs(lage.Monat.x - lage.Woche.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(lage.Tag.x - lage.Woche.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(lage.Tag.y - lage.Woche.y)).toBeLessThanOrEqual(2);
    expect(breite.Tag).toBe(breite.Woche);
    await keineFehlermeldung(page);
  });
});

test('G5: am Handy steht die Tageszeile über den Kästchen der Mitarbeiterübersicht', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 400, height: 860 });
  await anmelden(page, CHEFIN.email);
  await page.goto('/accounting');
  // Monat: die Kopfzeile ist sichtbar, ihr Streifen so breit und so weit links wie der der ersten Person.
  const kopf = page.locator('.ue-kopfzeile .streifen');
  await expect(kopf).toBeVisible({ timeout: 20_000 });
  const zeile = page.locator('.ue-zeile .streifen').first();
  await expect(zeile).toBeVisible();
  const [k, z] = [await kopf.boundingBox(), await zeile.boundingBox()];
  expect(Math.abs(k!.x - z!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(k!.width - z!.width)).toBeLessThanOrEqual(1);
  // „Person“ und die Zahlen trägt am Handy die Zeile selbst.
  await expect(page.locator('.ue-kopf-person')).toBeHidden();

  // Woche: Mo bis So, jede Spalte über ihrem Kästchen.
  await page.goto('/accounting?ansicht=woche');
  const tage = page.locator('.mw-kopfzeile .mw-tage > span');
  await expect(tage).toHaveCount(7, { timeout: 20_000 });
  await expect(tage.first()).toContainText('Mo');
  await expect(tage.last()).toContainText('So');
  const erste = page.locator('.mw-zeile .mw-tage').first().locator(':scope > *');
  for (const i of [0, 6]) {
    const [a, b] = [await tage.nth(i).boundingBox(), await erste.nth(i).boundingBox()];
    expect(Math.abs(a!.x - b!.x), `Spalte ${i}`).toBeLessThanOrEqual(1);
  }
  await keineFehlermeldung(page);
});
