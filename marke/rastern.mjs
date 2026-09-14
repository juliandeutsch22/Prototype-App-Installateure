/**
 * SVG → PNG, mit dem Browser statt mit einem eigenen Rasterer.
 *
 * Chromium liegt ohnehin da (der Durchklick braucht ihn), und er zeichnet
 * die Datei genau so, wie sie später im Browser des Monteurs aussieht. Ein
 * zweiter Rasterer wäre eine zweite Wahrheit.
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HIER = resolve(process.cwd(), 'marke');
const AUFTRAEGE = [
  { quelle: 'icon.svg', ziel: 'icon-192.png', groesse: 192 },
  { quelle: 'icon.svg', ziel: 'icon-512.png', groesse: 512 },
  { quelle: 'icon.svg', ziel: 'apple-touch-icon.png', groesse: 180 },
  { quelle: 'favicon.svg', ziel: 'favicon-64.png', groesse: 64 },
  { quelle: 'favicon.svg', ziel: 'favicon-32.png', groesse: 32 },
  { quelle: 'favicon.svg', ziel: 'favicon-16.png', groesse: 16 },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PFAD || undefined,
});
const page = await browser.newPage();

for (const a of AUFTRAEGE) {
  const svg = readFileSync(resolve(HIER, a.quelle), 'utf8');
  await page.setViewportSize({ width: a.groesse, height: a.groesse });
  // Hintergrund durchsichtig lassen: ein Icon mit weisser Platte darunter
  // sieht auf einem dunklen Startbildschirm nach Fehler aus.
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${a.groesse}px;height:${a.groesse}px}</style>${svg}`,
  );
  const bild = await page.locator('svg').screenshot({ omitBackground: true });
  writeFileSync(resolve(HIER, a.ziel), bild);
  console.log(`${a.ziel}  ${a.groesse}×${a.groesse}  ${bild.length} Bytes`);
}

// Maskable: Android schneidet bis zu 20 % vom Rand weg. Das Zeichen muss
// deshalb kleiner in einer vollflächigen Platte sitzen, sonst köpft das
// System die Öse.
const icon = readFileSync(resolve(HIER, 'icon.svg'), 'utf8')
  .replace('<rect width="64" height="64" rx="14"', '<rect x="-20" y="-20" width="104" height="104" rx="0"');
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(
  `<style>html,body{margin:0;background:transparent}svg{display:block;width:512px;height:512px}</style>${icon.replace('viewBox="0 0 64 64"', 'viewBox="-10 -10 84 84"')}`,
);
const maskable = await page.locator('svg').screenshot({ omitBackground: true });
writeFileSync(resolve(HIER, 'icon-maskable-512.png'), maskable);
console.log(`icon-maskable-512.png  512×512  ${maskable.length} Bytes`);

await browser.close();
