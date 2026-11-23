import { test, expect, type Page } from '@playwright/test';

/*
  E100 (23.11.2026) — DAS ZEICHEN DES BETRIEBS IN VOLLER GRÖSSE. Auftrag:
  „der Firmenname bzw. auch das hinterlegte Logo im Header erscheinen zu
  klein“, gemeldet mit einem Bildschirmfoto vom iPhone.

  Gemessen vorher am Handy: Name 11 px (0,4 × Logohöhe), kleiner als der
  Seitentitel (16 px), der beim Rollen an seine Stelle tritt; Logo 28 px hoch
  und dazu im Briefkopf-Format (400 × 188 px) eingepasst — ein
  quadratisches Zeichen stand darin mit über 100 px leerem Rand je Seite.

  Gegenprobe:
    - mit dem Stand vor E100 (Prop `height`, Schrift inline gerechnet) ist
      der Name 11 px und das Logo 28 px hoch;
    - ohne Zuschnitt (`kannZuschneiden()` immer falsch) hat das Logo im Kopf,
      in der Seitenleiste und in der Vorschau der Firmendaten das Format des
      Briefkopfs (2,1 : 1) statt seines eigenen (1 : 1).
*/

/** Ein quadratisches Zeichen, eingepasst ins Briefkopf-Format — so, wie `logoAufbereiten` es ablegt. */
async function logoImBriefkopf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 188;
    const g = c.getContext('2d')!;
    g.fillStyle = '#005c66';
    g.fillRect(106, 0, 188, 188);
    return c.toDataURL('image/png');
  });
}

async function kopfMessen(page: Page) {
  return page.evaluate(() => {
    const kopf = document.querySelector('.kopfzeile')!;
    // Nach Lage, nicht nach Klasse: so misst dieselbe Prüfung auch den Stand vor E100 (Gegenprobe).
    const marke = kopf.firstElementChild!;
    const bild = marke instanceof HTMLImageElement ? marke : marke.querySelector('img');
    const text = document.createTreeWalker(marke, NodeFilter.SHOW_TEXT).nextNode();
    const name = text?.parentElement ?? null;
    // Der Seitentitel, der beim Rollen an diese Stelle tritt — zum Vergleich an derselben Stelle gezeichnet.
    const titel = document.createElement('span');
    titel.className = 'kopfzeile-titel';
    titel.textContent = 'Titel';
    kopf.appendChild(titel);
    const titelGroesse = getComputedStyle(titel).fontSize;
    titel.remove();
    return {
      insel: Math.round(kopf.getBoundingClientRect().height),
      marke: Math.round(marke.getBoundingClientRect().height),
      name: name ? getComputedStyle(name).fontSize : null,
      titel: titelGroesse,
      bild: bild ? { b: bild.getBoundingClientRect().width, h: bild.getBoundingClientRect().height } : null,
    };
  });
}

test.describe('Kopf am Handy', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('der Name steht so groß wie der Seitentitel, die Insel bleibt so hoch wie bisher', async ({ page }) => {
    await page.goto('./?pfad=%2F&rolle=Administrator');
    await expect(page.locator('.kopfzeile > :first-child')).toContainText('Perl');
    const m = await kopfMessen(page);
    expect(m.name).toBe('16px');
    expect(m.name).toBe(m.titel);
    expect(m.marke).toBe(36);
    // Gleich bleiben muss: die Insel wächst nicht — Suche und Initialen stehen, wo sie standen.
    expect(m.insel).toBe(54);
  });

  test('ein Logo füllt die Höhe des Kopfs — ohne den Rand aus dem Briefkopf-Format', async ({ page }) => {
    await page.goto('./?pfad=%2F&rolle=Administrator');
    const logo = await logoImBriefkopf(page);
    await page.goto(`./?pfad=%2F&rolle=Administrator&logo=${encodeURIComponent(logo)}`);
    await expect(page.locator('.kopfzeile img')).toBeVisible();
    const m = await kopfMessen(page);
    expect(m.bild!.h).toBe(36);
    // Das Zeichen ist quadratisch — mit dem Rand des Briefkopfs wäre es 2,1-mal so breit wie hoch.
    expect(m.bild!.b / m.bild!.h).toBeCloseTo(1, 1);
    expect(m.insel).toBe(54);
  });
});

test.describe('Seitenleiste am Schreibtisch', () => {
  // Im WebKit-Lauf ist das Gerät ein iPhone — dort gibt es keine Seitenleiste.
  test.skip(({ isMobile }) => isMobile, 'nur am Schreibtisch');

  test('Name in 16 px, Logo 40 px hoch und ohne Rand', async ({ page }) => {
    await page.goto('./?pfad=%2F&rolle=Administrator');
    const name = page.locator('.navi-betrieb').getByText(/Perl/);
    await expect(name).toBeVisible();
    expect(await name.evaluate((e) => getComputedStyle(e).fontSize)).toBe('16px');
    // Weiß auf dem dunklen Grund der Leiste — die Farbe erbt sie von `.navi-betrieb`.
    expect(await name.evaluate((e) => getComputedStyle(e).color)).toBe(
      await page.locator('.navi-betrieb').evaluate((e) => getComputedStyle(e).color),
    );

    const logo = await logoImBriefkopf(page);
    await page.goto(`./?pfad=%2F&rolle=Administrator&logo=${encodeURIComponent(logo)}`);
    const bild = page.locator('.navi-betrieb img');
    await expect(bild).toBeVisible();
    const r = (await bild.boundingBox())!;
    expect(r.height).toBe(40);
    expect(r.width / r.height).toBeCloseTo(1, 1);
  });
});

test.describe('Firmendaten', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('die Vorschau zeigt das gewählte Logo so, wie es im Kopf stehen wird', async ({ page }) => {
    await page.goto('./?pfad=%2Fsettings%2Ffirma&rolle=Administrator');
    const vorschau = page.getByTestId('vorschau-kopf');
    // Ohne Logo: der Name aus dem Formular, in der Größe des Kopfs.
    await expect(vorschau.locator('.marke-name')).toHaveText(/Perl/);
    expect(await vorschau.locator('.marke-name').evaluate((e) => getComputedStyle(e).fontSize)).toBe('16px');

    // Ein quadratisches Zeichen mit durchsichtigem Rand, wie ein Betrieb es hochladen könnte.
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 300;
      const g = c.getContext('2d')!;
      g.fillStyle = '#005c66';
      g.fillRect(40, 40, 220, 220);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#fd-logo').setInputFiles({ name: 'zeichen.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });

    const imKopf = vorschau.locator('img');
    await expect(imKopf).toBeVisible();
    const k = (await imKopf.boundingBox())!;
    expect(k.height).toBe(36);
    expect(k.width / k.height).toBeCloseTo(1, 1);
    // Der Beleg behält das Briefkopf-Format — dort gehört der Rand dazu.
    const beleg = (await page.getByRole('img', { name: 'Logo des Betriebs' }).boundingBox())!;
    expect(beleg.width / beleg.height).toBeCloseTo(400 / 188, 1);
  });
});
