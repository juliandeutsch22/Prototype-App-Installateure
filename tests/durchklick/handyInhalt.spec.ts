import { test, expect, type Page } from '@playwright/test';
import { admin, BAUSTELLE, BETRIEB, CHEFIN, MONTEUR } from './aufbau';
import { anmelden, keineFehlermeldung } from './helfer';

/**
 * HANDY: INHALT ZUERST (Paket 6, E86) — im echten Browser bei 390 × 844:
 *
 *   1. Baustellenliste: kein Schriftfeld aus Nullen, die erste Baustelle
 *      steht im ersten Drittel; am Tablet bleibt das Schriftfeld.
 *   2. Baustellenakte: die Angaben als Blatt in der Übersicht, der Stand
 *      neben der Nummer, vier Reiter gleich breit; ab dem Tablet nicht.
 *   3. Beim Rollen steht der Titel in der Kopfzeile, die Suche ist eine Lupe.
 *   4. Der Titel endet auf einer Rasterlinie.
 *   5. Einstellungen: die Reiterleiste blendet am ersten angeschnittenen
 *      Reiter aus, nicht mitten im Wort.
 *   6. Läuft der Arbeitstag, rückt die Hauptaktion in den Seitenkopf: unten
 *      steht nur eine Leiste über der Navigation.
 */
const HANDY = { width: 390, height: 844 };

async function seite(page: Page, pfad: string) {
  await page.goto(pfad);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
}

test('Baustellenliste am Handy: keine Nullen im Kopf, die Liste beginnt oben', async ({ page }) => {
  await page.setViewportSize(HANDY);
  await anmelden(page, CHEFIN.email);
  await seite(page, '/admin-projects');
  const zeile = page.getByRole('link', { name: new RegExp(BAUSTELLE.kunde) }).first();
  await expect(zeile).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.seitenkopf-stand')).toBeHidden();
  await expect(page.locator('.lineal')).toBeHidden();
  // Der beschreibende Untertitel steht in der Hilfe, nicht auf der Seite.
  await expect(page.getByText('Anlegen und suchen — geändert wird in der Akte')).toBeHidden();
  expect((await zeile.boundingBox())!.y).toBeLessThan(844 / 2);
  await keineFehlermeldung(page);
});

test('Gegenprobe: am Tablet steht das Schriftfeld wie bisher', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await anmelden(page, CHEFIN.email);
  await seite(page, '/admin-projects');
  await expect(page.locator('.seitenkopf-stand')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Anlegen und suchen — geändert wird in der Akte')).toBeVisible();
});

test('Baustellenakte am Handy: Angaben als Blatt, Stand neben der Nummer, Titel in der Kopfzeile', async ({ page }) => {
  await page.setViewportSize(HANDY);
  await anmelden(page, CHEFIN.email);
  await seite(page, '/admin-projects');
  await page.getByRole('link', { name: new RegExp(BAUSTELLE.kunde) }).first().click();
  const titel = page.getByRole('heading', { level: 1, name: BAUSTELLE.kunde });
  await expect(titel).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('.akten-kopf .schriftfeld')).toBeHidden();
  await expect(page.locator('.plankopf-zusatz')).toHaveText('Aktiv');
  const angaben = page.locator('.akten-angaben-handy');
  await expect(angaben).toBeVisible();
  await expect(angaben.getByText('Abrechnung')).toBeVisible();
  // Zeilen von 48 px, Bezeichnung links, Wert rechts.
  const zeile = (await angaben.locator('.lage-eintrag').first().boundingBox())!;
  expect(zeile.height).toBeGreaterThanOrEqual(48);

  // Vier Reiter, gleich breit in einer Zeile.
  const reiter = page.getByRole('tab');
  await expect(reiter).toHaveCount(4);
  const breiten = await reiter.evaluateAll((r) => r.map((e) => Math.round(e.getBoundingClientRect().width)));
  const hoehen = await reiter.evaluateAll((r) => r.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(breiten).size).toBe(1);
  expect(new Set(hoehen).size).toBe(1);

  // Der Titel endet auf einer Rasterlinie (24 px): einzeilig 48 px.
  const h = (await titel.boundingBox())!.height;
  expect(Math.round(h) % 24).toBe(0);

  // Beim Rollen steht der Name in der Kopfzeile; vorher der Betrieb.
  const kopf = page.locator('header.kopfzeile');
  await expect(kopf.locator('.kopfzeile-titel')).toHaveCount(0);
  await page.mouse.wheel(0, 600);
  await expect(kopf.locator('.kopfzeile-titel')).toHaveText(BAUSTELLE.kunde, { timeout: 5_000 });
  expect((await kopf.boundingBox())!.y).toBe(0);
  await page.mouse.wheel(0, -2000);
  await expect(kopf.locator('.kopfzeile-titel')).toHaveCount(0, { timeout: 5_000 });

  // Die Suche ist eine Lupe und öffnet die Suche.
  await kopf.getByRole('button', { name: 'Suchen' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await keineFehlermeldung(page);
});

test('Gegenprobe: ab dem Tablet trägt der Kopf der Akte die Eckdaten, kein Blatt „Angaben“', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await anmelden(page, CHEFIN.email);
  await seite(page, '/admin-projects');
  await page.getByRole('link', { name: new RegExp(BAUSTELLE.kunde) }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: BAUSTELLE.kunde })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.akten-kopf .schriftfeld')).toBeVisible();
  await expect(page.locator('.akten-angaben-handy')).toBeHidden();
  await expect(page.locator('.plankopf-zusatz')).toBeHidden();
});

test('Einstellungen am Handy: die Kante beginnt am ersten angeschnittenen Reiter', async ({ page }) => {
  await page.setViewportSize(HANDY);
  await anmelden(page, CHEFIN.email);
  await seite(page, '/settings');
  const leiste = page.locator('.reiterleiste').first();
  await expect(leiste).toHaveAttribute('data-mehr-rechts', '', { timeout: 15_000 });
  const lage = await leiste.evaluate((el) => {
    const l = el.getBoundingClientRect();
    const ab = parseFloat(getComputedStyle(el).getPropertyValue('--mehr-ab')) / 100 * l.width + l.left;
    const angeschnitten = [...el.querySelectorAll('a')].find((a) => a.getBoundingClientRect().right > l.right + 1)!;
    const davor = [...el.querySelectorAll('a')].filter((a) => a.getBoundingClientRect().right <= l.right + 1);
    return { ab, start: angeschnitten.getBoundingClientRect().left, ganzEnde: Math.max(...davor.map((a) => a.getBoundingClientRect().right)) };
  });
  // Was satt steht, steht ganz da: die Kante beginnt am angeschnittenen, nach dem letzten ganzen Reiter.
  expect(Math.abs(lage.ab - lage.start)).toBeLessThanOrEqual(4);
  expect(lage.ab).toBeGreaterThanOrEqual(lage.ganzEnde - 1);
});

test.describe('Läuft der Arbeitstag', () => {
  test.beforeEach(async () => {
    await admin.from('zeitsitzungen').delete().eq('company_id', BETRIEB);
    await admin.from('companies').update({ modules: { 'zeiterfassung.timer': true } }).eq('id', BETRIEB);
  });
  test.afterEach(async () => {
    await admin.from('zeitsitzungen').delete().eq('company_id', BETRIEB);
    await admin.from('companies').update({ modules: {} }).eq('id', BETRIEB);
  });

  test('rückt die Hauptaktion in den Seitenkopf — unten steht nur die Leiste des Timers', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(HANDY);
    await anmelden(page, MONTEUR.email);
    await seite(page, '/worksheets');
    // Ohne laufenden Arbeitstag: die Hauptaktion unten im Daumenbereich.
    const knopf = page.getByRole('link', { name: 'Neuer Schein' }).first();
    await expect(knopf).toBeVisible({ timeout: 15_000 });
    const ohne = (await knopf.boundingBox())!;
    expect(ohne.y).toBeGreaterThan(844 / 2);

    await seite(page, '/');
    const karte = page.getByRole('region', { name: 'Arbeitstag' });
    await karte.getByRole('button', { name: 'Arbeitstag starten', exact: true }).click();
    await expect(karte.getByText(/^Läuft seit \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });

    await seite(page, '/worksheets');
    await expect(page.getByRole('region', { name: 'Laufender Arbeitstag' }).locator('visible=true')).toBeVisible({ timeout: 15_000 });
    const mit = (await page.getByRole('link', { name: 'Neuer Schein' }).first().boundingBox())!;
    expect(mit.y).toBeLessThan(844 / 3);
    // Über der Navigation steht nur noch eine Leiste: kein fester Daumenbereich mehr.
    const fest = await page.locator('.daumen').evaluateAll((d) => d.filter((e) => getComputedStyle(e).display !== 'contents' && getComputedStyle(e).position === 'fixed').map((e) => e.outerHTML.slice(0, 120)));
    expect(fest).toEqual([]);
    // Der Titel bricht nicht für den Knopf: er steht ganz in einer Zeile.
    const titel = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    expect(Math.round(titel.height)).toBe(48);
    await keineFehlermeldung(page);
  });
});

/*
  „MEINE EINTRÄGE“ NEBEN DEM FORMULAR (D12): ab dem Schreibtisch (1.200 px)
  nebeneinander; am Tablet eine Spalte wie bisher.
*/
for (const [breite, nebeneinander] of [[1200, true], [834, false]] as const) {
  test(`Zeiterfassung bei ${breite} px: „Meine Einträge“ ${nebeneinander ? 'neben' : 'unter'} dem Formular`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await anmelden(page, MONTEUR.email);
    await seite(page, '/time');
    const formular = page.locator('.zeit-formularkarte');
    const liste = page.locator('#meine-eintraege');
    await expect(liste).toBeVisible({ timeout: 15_000 });
    const f = (await formular.boundingBox())!;
    const l = (await liste.boundingBox())!;
    if (nebeneinander) {
      // Rechts daneben, auf gleicher Höhe — der Taktgeber setzt jedes Blatt auf seine Rasterlinie, auf eine Zelle genau.
      expect(l.x).toBeGreaterThan(f.x + f.width);
      expect(Math.abs(l.y - f.y)).toBeLessThanOrEqual(24);
    } else {
      expect(l.y).toBeGreaterThan(f.y + f.height - 1);
    }
  });
}
