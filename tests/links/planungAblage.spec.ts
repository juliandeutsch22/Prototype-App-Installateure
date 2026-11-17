import { test, expect, type Page } from '@playwright/test';

/*
  E96 (17.11.2026) — EINSATZPLANUNG AM SCHREIBTISCH, im echten Browser gegen
  die Vorschau. Jsdom rechnet kein Layout und rollt nicht; ob die Ablage so
  hoch wie das Raster ist und ob das Raster beim Ziehen mitrollt, sieht nur
  ein Browser.

  Gegenprobe (am Stand vor E96): die Ablage war so hoch wie ihre Liste
  (bei 3.195 Baustellen über 1.300 px statt der Höhe des Rasters), und
  beim Ziehen an den Rand rollte nichts — beide Prüfungen sind dort rot.
*/

const pfad = (route: string, extra = '') => `./?pfad=${encodeURIComponent(route)}&rolle=Administrator${extra}`;

test.use({ viewport: { width: 1440, height: 900 } });

const masse = (page: Page) => page.evaluate(() => {
  const ablage = document.querySelector('.planung-ablage')!.getBoundingClientRect();
  const raster = document.querySelector('.planung-mit-ablage > :first-child')!.getBoundingClientRect();
  const liste = document.querySelector<HTMLElement>('.planung-ablage-liste');
  const huelle = document.querySelector<HTMLElement>('.wp-huelle')!;
  return {
    ablageOben: Math.round(ablage.top), ablageHoehe: Math.round(ablage.height),
    rasterOben: Math.round(raster.top), rasterHoehe: Math.round(raster.height),
    listeRollt: liste ? liste.scrollHeight > liste.clientHeight : false,
    rasterBreite: huelle.clientWidth, rasterInhalt: huelle.scrollWidth,
  };
});

test.describe('E96 Noch einzuplanen als Schublade', () => {
  test.afterEach(async ({ page }) => page.evaluate(() => window.localStorage.clear()).catch(() => undefined));

  test('viele Baustellen: so hoch wie das Raster, die Liste rollt in sich; eingeklappt hat das Raster die ganze Woche', async ({ page }) => {
    // Der gewachsene Bestand (L11): mehrere tausend Baustellen ohne Einsatz in dieser Woche.
    await page.goto(pfad('/assignments', '&bestand=gewachsen'));
    await expect(page.locator('.ablage-baustelle').first()).toBeVisible({ timeout: 60_000 });
    const offen = await masse(page);
    expect(offen.ablageOben).toBe(offen.rasterOben);
    expect(Math.abs(offen.ablageHoehe - offen.rasterHoehe)).toBeLessThanOrEqual(1);
    expect(offen.ablageHoehe).toBeLessThan(900);
    expect(offen.listeRollt).toBe(true);
    // „weitere anzeigen“ steht in der Liste, nicht unter der Ablage.
    await expect(page.locator('.planung-ablage-liste .mehr-laden')).toHaveCount(1);

    await page.getByRole('button', { name: 'Noch einzuplanen einklappen' }).click();
    const zu = await masse(page);
    expect(zu.rasterBreite).toBeGreaterThan(offen.rasterBreite);
    expect(zu.rasterInhalt).toBeLessThanOrEqual(zu.rasterBreite + 1);
    // Gemerkt: neu geladen bleibt sie eingeklappt.
    await page.reload();
    await expect(page.getByRole('button', { name: /Noch einzuplanen \(\d+\) aufklappen/ })).toBeVisible({ timeout: 60_000 });
  });

  test('gleich geblieben: ohne Baustelle ohne Einsatz keine Ablage, das Raster hat die volle Breite', async ({ page }) => {
    await page.goto(pfad('/assignments'));
    await expect(page.locator('.wp-huelle')).toBeVisible();
    await expect(page.locator('.planung-ablage')).toHaveCount(0);
  });
});

test.describe('E96 Mitrollen beim Ziehen', () => {
  // Die schmalste Schreibtischbreite: dort rollt das Raster seitlich (bei 1.440 px passt die Woche ohne Ablage ganz hinein).
  test.use({ viewport: { width: 1200, height: 800 } });

  /** Einen Einsatz greifen und den Zeiger an eine Stelle der Hülle fahren; dort eine Weile stehen bleiben. */
  async function ziehenNach(page: Page, wohin: (r: { left: number; top: number; right: number; bottom: number }) => { x: number; y: number }) {
    // Ein Einsatz abseits der Ränder — wer am Rand greift, rollt schon beim Greifen (richtig so, aber hier nicht gemeint).
    const e = await page.locator('.wp-huelle').evaluate((h) => {
      const ecke = h.querySelector('.wp-ecke')!.getBoundingClientRect();
      const r = h.getBoundingClientRect();
      const frei = { links: ecke.right + 60, oben: ecke.bottom + 60, rechts: r.left + h.clientWidth - 60, unten: r.top + h.clientHeight - 60 };
      const t = [...h.querySelectorAll('.eintrag')].map((x) => x.getBoundingClientRect())
        .find((b) => b.left + b.width / 2 > frei.links && b.left + b.width / 2 < frei.rechts && b.top + b.height / 2 > frei.oben && b.top + b.height / 2 < frei.unten);
      return t ? { x: t.left, y: t.top, width: t.width, height: t.height } : null;
    });
    expect(e, 'ein Einsatz abseits der Ränder').not.toBeNull();
    await page.mouse.move(e!.x + e!.width / 2, e!.y + e!.height / 2);
    await page.mouse.down();
    await page.mouse.move(e!.x + e!.width / 2 + 10, e!.y + e!.height / 2 + 5, { steps: 4 });
    const r = await page.locator('.wp-huelle').evaluate((h) => {
      const b = h.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.left + h.clientWidth, bottom: b.top + h.clientHeight };
    });
    const ziel = wohin(r);
    await page.mouse.move(ziel.x, ziel.y, { steps: 8 });
    await page.waitForTimeout(500);
  }
  const lage = (page: Page) => page.locator('.wp-huelle').evaluate((h) => ({ x: h.scrollLeft, y: h.scrollTop, maxX: h.scrollWidth - h.clientWidth, maxY: h.scrollHeight - h.clientHeight }));
  const loslassen = async (page: Page) => {
    // Escape bricht ab: es wird nichts umgeplant.
    await page.keyboard.press('Escape');
    await page.mouse.up();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto(pfad('/assignments'));
    await expect(page.locator('.wp-huelle .eintrag').first()).toBeVisible();
    // Die Seite so, dass das ganze Raster im Bild ist; das Raster selbst in der Mitte — so kann es in jede Richtung.
    await page.locator('.wp-huelle').evaluate((h) => {
      h.scrollIntoView({ block: 'end' });
      h.scrollLeft = (h.scrollWidth - h.clientWidth) / 2;
      h.scrollTop = 0;
    });
    const r = await page.locator('.wp-huelle').boundingBox();
    expect(r!.y + r!.height, 'das Raster steht ganz im Bild').toBeLessThanOrEqual(800);
    const l = await lage(page);
    expect(l.maxX, 'das Raster rollt seitlich').toBeGreaterThan(20);
    expect(l.maxY, 'das Raster rollt senkrecht').toBeGreaterThan(20);
  });

  test('am rechten Rand rollt das Raster nach rechts, am linken (neben der Namensspalte) zurück', async ({ page }) => {
    const vorher = await lage(page);
    await ziehenNach(page, (r) => ({ x: r.right - 8, y: (r.top + r.bottom) / 2 }));
    const rechts = await lage(page);
    expect(rechts.x).toBeGreaterThan(vorher.x);
    // Über der festen Namensspalte: zurück.
    const ecke = await page.locator('.wp-huelle .wp-ecke').evaluate((e) => e.getBoundingClientRect().right);
    await page.mouse.move(ecke + 10, 600, { steps: 4 });
    await page.waitForTimeout(500);
    expect((await lage(page)).x).toBeLessThan(rechts.x);
    await loslassen(page);
  });

  test('am unteren Rand rollt das Raster nach unten', async ({ page }) => {
    const vorher = await lage(page);
    await ziehenNach(page, (r) => ({ x: (r.left + r.right) / 2 + 100, y: r.bottom - 8 }));
    expect((await lage(page)).y).toBeGreaterThan(vorher.y);
    await loslassen(page);
  });

  test('gleich geblieben: in der Mitte rollt nichts, und ohne Ziehen rollt der Rand nicht', async ({ page }) => {
    const vorher = await lage(page);
    await ziehenNach(page, (r) => ({ x: (r.left + r.right) / 2 + 60, y: (r.top + r.bottom) / 2 + 40 }));
    expect(await lage(page)).toEqual(vorher);
    await loslassen(page);
    // Nur darüberfahren, ohne gedrückte Taste.
    const r = await page.locator('.wp-huelle').boundingBox();
    await page.mouse.move(r!.x + r!.width - 8, r!.y + r!.height / 2, { steps: 4 });
    await page.waitForTimeout(400);
    expect(await lage(page)).toEqual(vorher);
  });
});
