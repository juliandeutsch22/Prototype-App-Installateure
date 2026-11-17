/** Gemeinsame SVG-Vorlagen aus dem Markenpaket vom 03.11.2026. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const HIER = resolve(process.cwd(), 'marke');
const PUBLIC = resolve(process.cwd(), 'public');
const ZIEL = resolve(PUBLIC, 'marke');
mkdirSync(ZIEL, { recursive: true });
const zeichen = readFileSync(resolve(HIER, 'zeichen.svg'), 'utf8');
const grund = '<rect width="64" height="64" fill="#FFFFFF"/>';
/*
  ABGERUNDETE ECKEN (Vorgabe des Betreibers vom 04.11.2026): Radius 12 von 64,
  an seinem Bild gemessen. Rund wird nur, was das System so zeigt, wie es
  geliefert wird — Reiter, Lesezeichen, installierte App am Schreibtisch.
  Das Apple-Touch-Icon und das maskierbare Android-Icon bleiben randlos und
  deckend: iOS füllt durchsichtige Ecken schwarz, und beide Systeme schneiden
  ihre eigene Form aus, runden also ohnehin.
*/
const grundRund = '<rect width="64" height="64" rx="12" fill="#FFFFFF"/>';
const favicon = zeichen.replace('</title>', '</title>' + grundRund);
// 52/64 Höhe × 0,92 / 2 = 0,37375: vollständig im sicheren Android-Kreis (Radius 0,4).
const appIcon = zeichen
  .replace('</title>', '</title>' + grund)
  .replace('<g fill=', '<g transform="translate(32 32) scale(0.92) translate(-32 -32)" fill=');
const badge = zeichen.replaceAll('#0F4552', '#FFFFFF');
for (const [name, quelle] of [['icon.svg', appIcon], ['favicon.svg', favicon]]) {
  writeFileSync(resolve(HIER, name), quelle);
  writeFileSync(resolve(ZIEL, name), quelle);
}
for (const name of ['logo.svg', 'logo-weiss.svg', 'zeichen.svg', 'schriftzug.svg']) {
  writeFileSync(resolve(ZIEL, name), readFileSync(resolve(HIER, name)));
}
const auftraege = [
  { datei: 'icon-192.png', groesse: 192, svg: favicon },
  { datei: 'icon-512.png', groesse: 512, svg: favicon },
  { datei: 'icon-maskable-512.png', groesse: 512, svg: appIcon },
  { datei: 'apple-touch-icon.png', groesse: 180, svg: appIcon },
  ...[16, 32, 64].map((groesse) => ({ datei: `favicon-${groesse}.png`, groesse, svg: favicon })),
  { datei: 'badge-96.png', groesse: 96, svg: badge },
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD || undefined });
try {
  const page = await browser.newPage();
  for (const { datei, groesse, svg } of auftraege) {
    const png = await page.evaluate(async ({ svg, groesse }) => {
      const bild = new Image();
      bild.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
      await bild.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = groesse;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bild, 0, 0, groesse, groesse);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { svg, groesse });
    const daten = Buffer.from(png, 'base64');
    for (const ordner of [HIER, PUBLIC, ZIEL]) writeFileSync(resolve(ordner, datei), daten);
    console.log(`${datei} ${groesse}×${groesse}`);
  }
} finally {
  await browser.close();
}
const hash = (name) => createHash('sha256').update(readFileSync(resolve(HIER, name))).digest('hex');
writeFileSync(resolve(HIER, 'ausgabe.json'), JSON.stringify({
  quelle: 'Senklot-Markenpaket-2026-11-03',
  vorlagen: Object.fromEntries(['logo.svg', 'logo-weiss.svg', 'zeichen.svg', 'schriftzug.svg'].map((name) => [name, hash(name)])),
  bilder: Object.fromEntries(auftraege.map(({ datei }) => [datei, hash(datei)])),
}, null, 2) + '\n');
