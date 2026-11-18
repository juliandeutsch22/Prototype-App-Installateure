import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/*
  E98 (18.11.2026) — DIESELBE LUFT OBEN UND UNTEN AM HANDY. Auftrag: „mobil
  auf dem iPhone schwebt die Nav unten höher über dem Rand als der Header
  oben. Die Abstände sollten einheitlich sein.“

  Der Kopf steht 8 px unter dem oberen Rand des Bilds (unter der
  Statusleiste). Die untere Insel hielt Abstand zur ganzen Sicherheitszone
  des iPhones (34 px), obwohl der Home-Balken darin nur die untersten 13 px
  belegt. Jetzt steht sie 8 px über dem Home-Balken — dieselbe Luft wie oben.

  Chromium kennt keine Sicherheitszone; die Prüfung stellt das iPhone über
  `--sicher-unten` nach (34 px hochkant), die Seite liest die Zone sonst aus
  `env(safe-area-inset-bottom)`.

  Gegenprobe: mit der Regel vor E98 (`bottom: max(0.5rem, env(…))`) steht
  die Insel im nachgestellten iPhone 8 statt 21 px über der Kante, und die
  Prüfung der Regel selbst ist rot.
*/
const HOME_BALKEN = 13; // 5 px hoch, 8 px über der Kante (alle iPhones mit Face ID, hochkant)

async function messen(page: Page) {
  return page.evaluate(() => {
    const kopf = document.querySelector('.kopfzeile')!.getBoundingClientRect();
    const unten = document.querySelector('.unten')!.getBoundingClientRect();
    return {
      oben: Math.round(kopf.top),
      unten: Math.round(window.innerHeight - unten.bottom),
      // Was das Layout als Platz der Insel meldet (Inhalt, Aktionsleiste und Timer richten sich danach).
      navi: parseFloat(getComputedStyle(document.body).getPropertyValue('--navi-hoehe')),
      platz: Math.round(window.innerHeight - unten.top),
    };
  });
}

async function oeffnen(page: Page, zone: number | null) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?pfad=%2F&rolle=Mitarbeiter');
  await expect(page.locator('.unten')).toBeVisible();
  await expect(page.locator('.kopfzeile')).toBeVisible();
  if (zone !== null) {
    /*
      Als eigene Regel, nicht am `style` von `html`: die Seite setzt dort ihre
      Farben neu. Danach misst das Layout wie bei jeder Größenänderung neu —
      am Gerät steht die Zone schon beim ersten Zeichnen fest.
    */
    await page.addStyleTag({ content: `:root { --sicher-unten: ${zone}px !important; }` });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  }
}

test('iPhone (34 px Zone): die Insel steht 8 px über dem Home-Balken — dieselbe Luft wie der Kopf oben', async ({ page }) => {
  await oeffnen(page, 34);
  const m = await messen(page);
  expect(m.oben).toBe(8);
  expect(m.unten).toBe(34 - HOME_BALKEN);
  expect(m.unten - HOME_BALKEN).toBe(m.oben);
  expect(m.navi).toBe(m.platz);
});

test('ohne Zone (Android, Browser): unten 8 px wie oben', async ({ page }) => {
  await oeffnen(page, null);
  const m = await messen(page);
  expect(m).toEqual({ oben: 8, unten: 8, navi: m.platz, platz: m.platz });
});

test('die Zone kommt aus dem Gerät, nicht aus einer festen Zahl', () => {
  const css = readFileSync('src/styles/lot.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(css).toMatch(/--sicher-unten: env\(safe-area-inset-bottom, 0px\);/);
  expect(css).toMatch(/\.unten \{[^}]*bottom: max\(0\.5rem, var\(--sicher-unten\) - 0\.8125rem\);/);
});

/*
  E99 (18.11.2026) — DIE STATUSLEISTE IST DECKEND. Gemeldet mit zwei
  Bildschirmfotos vom iPhone: unter Uhrzeit und Akku lief der Inhalt durch.
  Nachgestellt wie oben, über `--sicher-oben` (47 px, iPhone hochkant): nach
  dem Rollen trifft ein Punkt in der Zone den Grund der Seite (die Fläche
  von `.huelle`), keinen Inhalt. Ohne Zone ist die Fläche 0 hoch.
  Gegenprobe: ohne die Regel trifft derselbe Punkt eine Karte.
*/
async function inDerZone(page: Page) {
  return page.evaluate(() => {
    // Links neben der Insel des Kopfs (sie hält 8 px Abstand zum Rand): dort lag der Inhalt frei.
    const el = document.elementFromPoint(4, 20);
    const flaeche = getComputedStyle(document.querySelector('.huelle')!, '::before');
    return { trifft: el?.className ?? '', hoehe: flaeche.height, grund: flaeche.backgroundColor, seite: getComputedStyle(document.body).backgroundColor };
  });
}

test('iPhone (47 px Zone oben): nach dem Rollen läuft kein Inhalt unter der Statusleiste', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?pfad=%2Fadmin-projects%2Fp1&rolle=Administrator');
  await expect(page.getByRole('heading', { name: 'Auftrag' })).toBeVisible({ timeout: 20_000 });
  await page.addStyleTag({ content: ':root { --sicher-oben: 47px !important; }' });
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(async () => (await inDerZone(page)).trifft).toBe('huelle');
  const z = await inDerZone(page);
  expect(z.hoehe).toBe('47px');
  expect(z.grund).toBe(z.seite);
});

test('ohne Zone oben (Android, Browser): keine Fläche', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?pfad=%2Fadmin-projects%2Fp1&rolle=Administrator');
  await expect(page.getByRole('heading', { name: 'Auftrag' })).toBeVisible({ timeout: 20_000 });
  expect((await inDerZone(page)).hoehe).toBe('0px');
});
