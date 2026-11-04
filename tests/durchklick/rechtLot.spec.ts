import { test, expect, type Page } from '@playwright/test';

/**
 * IMPRESSUM UND DATENSCHUTZ IN DER LINIE „LOT“ (Auftrag 04.11.2026: „die
 * Seiten für die Rechtstexte sind noch nicht in der neuen Designlinie“).
 *
 * Im echten Browser, ohne Anmeldung — so, wie jemand ohne Konto sie öffnet:
 * - das Raster der App liegt unter der Seite, der Text auf EINEM Blatt, und
 *   jede Kante des Blatts auf einer Rasterlinie; am Handy, am Tablet und am
 *   Schreibtisch, ohne seitliches Rollen;
 * - kein dunkles Band mehr, keine gerundete Ecke, Überschriften in 400/500;
 * - „Entwurf“, „Zur App“ und die Wege zur anderen Seite bleiben da.
 *
 * Gegenprobe: mit dem Rahmen davor (dunkles Band, kein Raster, kein Blatt)
 * schlägt jede dieser Prüfungen fehl.
 */

const BREITEN = [
  { name: 'Handy', width: 390, height: 844 },
  { name: 'Tablet', width: 834, height: 1112 },
  { name: 'Schreibtisch', width: 1440, height: 900 },
];

/** Wie weit liegt jede Kante des Blatts neben der nächsten Rasterlinie (in px)? */
async function blattKanten(page: Page) {
  await page.evaluate(() => new Promise((fertig) => requestAnimationFrame(() => requestAnimationFrame(fertig))));
  return page.evaluate(() => {
    const flaeche = document.querySelector<HTMLElement>('.hauptflaeche');
    const blaetter = [...document.querySelectorAll<HTMLElement>('.inhalt .karte')];
    if (!flaeche || blaetter.length !== 1) return { blaetter: blaetter.length, raster: !!flaeche, daneben: [] as string[] };
    const r = flaeche.getBoundingClientRect();
    const [px, py] = getComputedStyle(flaeche).backgroundPosition.split(' ').map(parseFloat);
    const q = blaetter[0].getBoundingClientRect();
    const rest = (wert: number, ursprung: number) => ((Math.round(wert - ursprung) % 24) + 24) % 24;
    const daneben = (
      [['oben', q.top, r.top + py], ['unten', q.bottom, r.top + py], ['links', q.left, r.left + px], ['rechts', q.right, r.left + px]] as const
    ).filter(([, wert, ursprung]) => rest(wert, ursprung) !== 0).map(([kante]) => kante);
    return { blaetter: 1, raster: getComputedStyle(flaeche).backgroundImage.includes('linear-gradient'), daneben };
  });
}

for (const seite of [
  { pfad: '/impressum', titel: 'Impressum', andere: 'Datenschutz' },
  { pfad: '/datenschutz', titel: 'Datenschutzerklärung', andere: 'Impressum' },
]) {
  test(`${seite.titel}: Raster, ein Blatt auf den Linien, Linie „Lot“ — in drei Breiten`, async ({ page }) => {
    for (const breite of BREITEN) {
      await page.setViewportSize(breite);
      await page.goto(seite.pfad);
      await expect(page.getByRole('heading', { level: 1, name: seite.titel })).toBeVisible();

      const kanten = await blattKanten(page);
      expect(kanten, `${breite.name}: Raster und genau ein Blatt`).toMatchObject({ blaetter: 1, raster: true });
      expect(kanten.daneben, `${breite.name}: Kanten neben dem Raster`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${breite.name}: seitlich`).toBe(0);

      const stil = await page.evaluate(() => ({
        dunklesBand: !!document.querySelector('.panel-dark'),
        ecke: getComputedStyle(document.querySelector('.inhalt .karte')!).borderTopLeftRadius,
        gewichte: [...document.querySelectorAll('h1, h2')].map((h) => getComputedStyle(h).fontWeight),
      }));
      expect(stil.dunklesBand, `${breite.name}: dunkles Band`).toBe(false);
      expect(stil.ecke, `${breite.name}: Ecke des Blatts`).toBe('0px');
      expect(stil.gewichte.every((g) => g === '400' || g === '500'), `${breite.name}: ${stil.gewichte.join(', ')}`).toBe(true);
    }

    await expect(page.getByRole('note')).toContainText('Entwurf');
    await expect(page.getByRole('link', { name: 'Zur App' })).toHaveAttribute('href', '/');
    await page.getByRole('link', { name: seite.andere, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(seite.titel);
  });
}
