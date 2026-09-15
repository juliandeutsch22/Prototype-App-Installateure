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

/** Die Platte des App-Zeichens — der einzige Teil, den die Zuschnitte tauschen. */
const PLATTE = '<rect width="64" height="64" rx="14"';

const AUFTRAEGE = [
  { quelle: 'icon.svg', ziel: 'icon-192.png', groesse: 192 },
  { quelle: 'icon.svg', ziel: 'icon-512.png', groesse: 512 },
  { quelle: 'favicon.svg', ziel: 'favicon-64.png', groesse: 64 },
  { quelle: 'favicon.svg', ziel: 'favicon-32.png', groesse: 32 },
  { quelle: 'favicon.svg', ziel: 'favicon-16.png', groesse: 16 },
  /*
    APPLE-TOUCH-ICON: QUADRATISCH UND RANDLOS, ohne eine einzige durchsichtige
    Ecke.

    iOS rundet dieses Bild selbst ab und rechnet Durchsichtigkeit vorher gegen
    Schwarz. Solange die Platte petrol war, fiel das nicht auf — die
    weggerundeten Ecken waren dunkel und der Rest auch. Seit die Platte weiss
    ist, wäre daraus ein weisses Zeichen mit vier schwarzen Ecken geworden.

    Deshalb hier `rx="0"` statt der gerundeten Platte: die Rundung kommt vom
    Betriebssystem, nicht aus der Datei. Genau das schreibt Apple auch so vor.
  */
  { quelle: 'icon.svg', ziel: 'apple-touch-icon.png', groesse: 180, platte: `${PLATTE.replace('rx="14"', 'rx="0"')}` },
  /*
    MASKABLE: Android schneidet bis zu 20 % vom Rand weg. Das Zeichen muss
    deshalb kleiner in einer vollflächigen Platte sitzen, sonst köpft das
    System die Öse.
  */
  {
    quelle: 'icon.svg',
    ziel: 'icon-maskable-512.png',
    groesse: 512,
    platte: '<rect x="-20" y="-20" width="104" height="104" rx="0"',
    sichtfeld: '-10 -10 84 84',
  },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PFAD || undefined,
});
const page = await browser.newPage();

for (const a of AUFTRAEGE) {
  let svg = readFileSync(resolve(HIER, a.quelle), 'utf8');
  if (a.platte) {
    if (!svg.includes(PLATTE)) throw new Error(`${a.quelle}: die Platte sieht anders aus als erwartet`);
    svg = svg.replace(PLATTE, a.platte);
  }
  if (a.sichtfeld) svg = svg.replace('viewBox="0 0 64 64"', `viewBox="${a.sichtfeld}"`);

  await page.setViewportSize({ width: a.groesse, height: a.groesse });
  /*
    Der Seitengrund bleibt durchsichtig, damit die gerundeten Ecken der Platte
    wirklich Ecken sind und nicht weiss ausgemalte. Was voll deckend sein muss
    (apple-touch, maskable), sorgt über seine eigene Platte dafür.
  */
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${a.groesse}px;height:${a.groesse}px}</style>${svg}`,
  );
  const bild = await page.locator('svg').screenshot({ omitBackground: true });
  writeFileSync(resolve(HIER, a.ziel), bild);
  console.log(`${a.ziel}  ${a.groesse}×${a.groesse}  ${bild.length} Bytes`);
}

await browser.close();
