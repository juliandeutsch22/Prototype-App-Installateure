import { test, expect, type Page } from '@playwright/test';
import { CHEFIN } from './aufbau';
import { anmelden } from './helfer';

/**
 * DAS LOT AM SEIL (Auftrag 03.11.2026, E38): „der Senklot neben dem
 * jeweiligen Menüpunkt sollte sich immer von oben mit dem Seil zu dem
 * jeweiligen Menüpunkt runter bzw. rauf lassen … smooth, nicht ruckelig“.
 *
 * Gemessen im echten Browser, Bild für Bild:
 * - beim Laden steht das Lot ohne Fahrt am aktiven Punkt;
 * - herab sinkt es stetig, federt höchstens 3 px nach und hängt dann mittig
 *   neben dem Punkt; das Seil reicht vom Haken bis an das Blei;
 * - der Haken sitzt auf der Höhe von „Start“: dort hängt das Blei ohne Seil
 *   (E39, 03.11.2026);
 * - herauf wird es stetig eingeholt, ohne Überschwingen;
 * - ein zweiter Klick mitten in der Fahrt führt ohne Sprung zum neuen Ziel;
 * - ohne aktiven Punkt ist das Seil eingeholt und das Blei ausgeblendet —
 *   am Haken neben „Start“ sähe „Start“ sonst aktiv aus;
 * - mit „Bewegung reduzieren“ gibt es keine Fahrt.
 * Gemessen wird gegen die Aufhängung: die Leiste rollt, wenn ein Punkt
 * außerhalb des Bilds angetippt wird, und Aufhängung und Blei rollen mit.
 * Am Handy bleibt das Lot über dem aktiven Symbol wie bisher.
 */

const ENDE = 1500;

/** Die Oberkante des Bleis in jedem Bild, bis keine Animation mehr läuft. */
/** Die Lage des Bleis unter der Aufhängung in jedem Bild, mit der Zeit des Bilds. */
interface Fahrt { werte: number[]; zeiten: number[] }

async function fahrtAufzeichnen(page: Page, klick: () => Promise<void>): Promise<Fahrt> {
  const aufnahme = page.evaluate((ende) => new Promise<Fahrt>((fertig) => {
    const el = document.querySelector<HTMLElement>('.navi-blei')!;
    const aufh = document.querySelector<HTMLElement>('.navi-aufhaengung')!;
    const werte: number[] = [];
    const zeiten: number[] = [];
    const t0 = performance.now();
    let gestartet = false;
    // Die Zeit des Bilds (Zeitstempel von requestAnimationFrame), nicht die der Messung: nach der stehen Animationen.
    const bild = (zeit: number) => {
      werte.push(el.getBoundingClientRect().top - aufh.getBoundingClientRect().top);
      zeiten.push(zeit);
      const laeuft = el.getAnimations().length > 0;
      if (laeuft) gestartet = true;
      if ((gestartet && !laeuft) || performance.now() - t0 > ende) fertig({ werte, zeiten });
      else requestAnimationFrame(bild);
    };
    requestAnimationFrame(bild);
  }), ENDE);
  await klick();
  return aufnahme;
}

async function lage(page: Page) {
  return page.evaluate(() => {
    const r = (s: string) => document.querySelector<HTMLElement>(s)?.getBoundingClientRect() ?? null;
    const blei = r('.navi-blei')!;
    const seil = r('.navi-seil')!;
    const aufh = r('.navi-aufhaengung')!;
    const punkt = r('aside .navi-punkt-aktiv');
    return {
      bleiMitte: (blei.top + blei.bottom) / 2,
      // Gegen die Aufhängung, wie die Aufzeichnung der Fahrt.
      bleiOben: blei.top - aufh.top,
      bleiObenImBild: blei.top,
      seilOben: seil.top,
      seilUnten: seil.bottom,
      seilLaenge: seil.height,
      // Der Haken liegt direkt über dem Anfang des Seils.
      aufhaengung: aufh.bottom,
      bleiSichtbar: getComputedStyle(document.querySelector('.navi-blei')!).opacity,
      punktMitte: punkt ? (punkt.top + punkt.bottom) / 2 : null,
      laeuft: document.querySelector('.navi-blei')!.getAnimations().length,
    };
  });
}

function haengtRichtig(l: Awaited<ReturnType<typeof lage>>) {
  expect(l.laeuft).toBe(0);
  expect(Math.abs(l.bleiMitte - l.punktMitte!), 'Blei mittig neben dem Punkt').toBeLessThan(1);
  expect(Math.abs(l.seilOben - l.aufhaengung), 'Seil beginnt am Haken').toBeLessThan(1);
  expect(Math.abs(l.seilUnten - l.bleiObenImBild), 'Seil endet am Blei').toBeLessThan(1);
}

for (const { name, width, height } of [
  { name: 'Schreibtisch', width: 1440, height: 900 },
  { name: 'Tablet', width: 834, height: 1112 },
]) {
  test(`${name}: das Lot lässt sich am Seil herab und wird eingeholt — stetig, ohne Sprung`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await anmelden(page, CHEFIN.email);
    await page.goto('/');
    await expect(page.locator('aside .navi-punkt-aktiv')).toBeVisible({ timeout: 15_000 });
    // Beim Laden: ohne Fahrt am Ziel.
    const amStart = await lage(page);
    haengtRichtig(amStart);
    // Bei „Start“ hängt das Blei ohne Seil direkt am Haken.
    expect(amStart.seilLaenge, 'bei „Start“ kein Seil').toBeLessThan(1);
    expect(amStart.bleiSichtbar).toBe('1');
    expect(await page.locator('aside .navi-punkt-aktiv svg path').getAttribute('d'), 'Start trägt den Grundriss, kein zweites Lot')
      .not.toContain('L5.6 11.4');

    // Herab zu den Handwerksscheinen.
    const start = (await lage(page)).bleiOben;
    const { werte: herab } = await fahrtAufzeichnen(page, () => page.locator('aside.navi').getByRole('link', { name: /Handwerksscheine|Scheine/ }).click());
    const unten = await lage(page);
    haengtRichtig(unten);
    expect(unten.bleiOben).toBeGreaterThan(start + 100);
    const zwischen = herab.filter((y) => y > start + 1 && y < unten.bleiOben - 1);
    expect(zwischen.length, 'Zwischenstände — eine Fahrt, kein Sprung').toBeGreaterThanOrEqual(3);
    const tiefster = Math.max(...herab);
    expect(tiefster - unten.bleiOben, 'nachfedern höchstens 3 px').toBeLessThanOrEqual(3.5);
    // Bis zum tiefsten Punkt nur abwärts.
    const bisTief = herab.slice(0, herab.indexOf(tiefster) + 1);
    bisTief.forEach((y, i) => { if (i > 0) expect(y, `Bild ${i} herab`).toBeGreaterThanOrEqual(bisTief[i - 1] - 0.5); });

    // Herauf zu den Baustellen: nur aufwärts, kein Überschwingen.
    const { werte: herauf } = await fahrtAufzeichnen(page, () => page.locator('aside.navi').getByRole('link', { name: /^Baustellen$|^Baust/ }).first().click());
    const oben = await lage(page);
    haengtRichtig(oben);
    herauf.forEach((y, i) => { if (i > 0) expect(y, `Bild ${i} herauf`).toBeLessThanOrEqual(herauf[i - 1] + 0.5); });
    expect(Math.min(...herauf), 'kein Überschwingen nach oben').toBeGreaterThanOrEqual(oben.bleiOben - 0.5);

    // Mitten in der Fahrt ein neues Ziel: weiter ohne Sprung, am Ende richtig.
    const umgelenkt = await fahrtAufzeichnen(page, async () => {
      await page.locator('aside.navi').getByRole('link', { name: /Wartungen|Wartung/ }).click();
      await page.waitForTimeout(90);
      await page.locator('aside.navi').getByRole('link', { name: /^Start$/ }).click();
    });
    haengtRichtig(await lage(page));
    /*
      KEIN SPRUNG: zwischen zwei Bildern höchstens so weit, wie die Fahrt in
      der Zeit dazwischen kommt (schnellste Stelle unter 3,5 px je ms). Ein
      Bild kann länger dauern, wenn die neue Seite sich aufbaut — dann liegt
      mehr Strecke dazwischen, aber nie eine ganze Fahrt in einem Augenblick.
    */
    umgelenkt.werte.forEach((y, i) => {
      if (i === 0) return;
      const dt = umgelenkt.zeiten[i] - umgelenkt.zeiten[i - 1];
      expect(Math.abs(y - umgelenkt.werte[i - 1]), `Bild ${i} (${Math.round(dt)} ms): kein Sprung`).toBeLessThan(3.5 * dt + 8);
    });

    // Ohne aktiven Punkt („Meine Baustellen“ steht für die Geschäftsführung nicht im Menü): eingeholt.
    await page.goto('/my-projects');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    const ohne = await lage(page);
    expect(ohne.punktMitte).toBeNull();
    expect(ohne.seilLaenge, 'Seil eingeholt').toBeLessThan(1);
    await expect.poll(async () => (await lage(page)).bleiSichtbar, { message: 'nur der Haken bleibt' }).toBe('0');

    // Wieder ein aktiver Punkt: das Blei ist wieder da.
    await page.locator('aside.navi').getByRole('link', { name: /^Start$/ }).click();
    await expect.poll(async () => (await lage(page)).bleiSichtbar).toBe('1');
  });
}

test('mit „Bewegung reduzieren“ springt das Lot ohne Fahrt', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await anmelden(page, CHEFIN.email);
  await page.goto('/');
  await expect(page.locator('aside .navi-punkt-aktiv')).toBeVisible({ timeout: 15_000 });
  const { werte: fahrt } = await fahrtAufzeichnen(page, () => page.locator('aside.navi').getByRole('link', { name: /Handwerksscheine/ }).click());
  const l = await lage(page);
  haengtRichtig(l);
  // Höchstens die Lage vor und nach dem Klick — keine Zwischenstände.
  expect(new Set(fahrt.map((y) => Math.round(y))).size).toBeLessThanOrEqual(2);
});
