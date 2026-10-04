/**
 * App-Zeichen und Favicon aus `app-zeichen.png`, mit dem Browser statt mit
 * einem eigenen Rasterer.
 *
 * Chromium liegt ohnehin da (der Durchklick braucht ihn), und er zeichnet
 * das Bild genau so, wie es später im Browser des Monteurs aussieht. Ein
 * zweiter Rasterer wäre eine zweite Wahrheit.
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HIER = resolve(process.cwd(), 'marke');

/*
  DIE VORLAGE IST HOCHFORMAT (1024 × 1536), jedes Zeichen quadratisch. Sie
  kommt deshalb mittig auf ein weisses Quadrat von 1800 Pixeln — die Mitte
  des Senklots (Oberkante der Schnur bis Spitze: Zeile 108 bis 1340, Spalte
  284 bis 742) liegt dann genau in dessen Mitte. Die Vorlage ist am ganzen
  Rand weiss; der Übergang ins Quadrat ist unsichtbar.
*/
const QUADRAT = 1800;
const VERSATZ_X = QUADRAT / 2 - 513;
const VERSATZ_Y = QUADRAT / 2 - 724;

/*
  WIE VIEL VOM QUADRAT JEDES ZEICHEN ZEIGT (Seitenlänge des Ausschnitts um
  die Mitte, in Pixeln der Vorlage). Das Senklot ist 1232 hoch.

  - Favicon: knapp, damit bei 16 px vom Zeichen so viel bleibt wie möglich.
  - App-Zeichen und Apple-Touch-Icon: mit Luft, wie ein Zeichen am
    Startbildschirm sie braucht. Apple rundet selbst ab; die Datei bleibt
    quadratisch und randlos, ohne durchsichtige Ecke.
  - Maskable: Android schneidet bis auf einen Kreis von 80 % weg. Von der
    Mitte bis zur Schnur sind es 616 Pixel; im ganzen Quadrat bleibt ein
    Kreis mit 720 — sonst köpft das System die Schnur.
*/
const AUFTRAEGE = [
  { ziel: 'icon-192.png', groesse: 192, ausschnitt: 1600 },
  { ziel: 'icon-512.png', groesse: 512, ausschnitt: 1600 },
  { ziel: 'apple-touch-icon.png', groesse: 180, ausschnitt: 1600 },
  { ziel: 'icon-maskable-512.png', groesse: 512, ausschnitt: QUADRAT },
  { ziel: 'favicon-64.png', groesse: 64, ausschnitt: 1360 },
  { ziel: 'favicon-32.png', groesse: 32, ausschnitt: 1360 },
  { ziel: 'favicon-16.png', groesse: 16, ausschnitt: 1360 },
];

const vorlage = `data:image/png;base64,${readFileSync(resolve(HIER, 'app-zeichen.png')).toString('base64')}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PFAD || undefined,
});
const page = await browser.newPage();

const bilder = await page.evaluate(
  async ({ vorlage, auftraege, QUADRAT, VERSATZ_X, VERSATZ_Y }) => {
    const bild = new Image();
    bild.src = vorlage;
    await bild.decode();

    const quadrat = document.createElement('canvas');
    quadrat.width = quadrat.height = QUADRAT;
    const q = quadrat.getContext('2d');
    q.fillStyle = '#fff';
    q.fillRect(0, 0, QUADRAT, QUADRAT);
    q.drawImage(bild, VERSATZ_X, VERSATZ_Y);

    /*
      IN HALBEN SCHRITTEN VERKLEINERN, nicht in einem Zug: von 1360 auf 16
      Pixel nähme ein einziger Schritt nur jedes neunzigste Pixel mit, und
      die Kanten flimmerten. Jedes Halbieren mittelt dagegen vier Pixel.
    */
    function verkleinern(quelle, ziel) {
      let jetzt = quelle;
      while (jetzt.width / 2 >= ziel) {
        const halb = document.createElement('canvas');
        halb.width = halb.height = Math.round(jetzt.width / 2);
        const h = halb.getContext('2d');
        h.imageSmoothingQuality = 'high';
        h.drawImage(jetzt, 0, 0, halb.width, halb.height);
        jetzt = halb;
      }
      const fertig = document.createElement('canvas');
      fertig.width = fertig.height = ziel;
      const f = fertig.getContext('2d');
      f.imageSmoothingQuality = 'high';
      f.drawImage(jetzt, 0, 0, ziel, ziel);
      return fertig;
    }

    return auftraege.map((a) => {
      const ausschnitt = document.createElement('canvas');
      ausschnitt.width = ausschnitt.height = a.ausschnitt;
      const rand = (QUADRAT - a.ausschnitt) / 2;
      ausschnitt.getContext('2d').drawImage(quadrat, rand, rand, a.ausschnitt, a.ausschnitt, 0, 0, a.ausschnitt, a.ausschnitt);
      return verkleinern(ausschnitt, a.groesse).toDataURL('image/png').split(',')[1];
    });
  },
  { vorlage, auftraege: AUFTRAEGE, QUADRAT, VERSATZ_X, VERSATZ_Y },
);

AUFTRAEGE.forEach((a, i) => {
  const daten = Buffer.from(bilder[i], 'base64');
  writeFileSync(resolve(HIER, a.ziel), daten);
  console.log(`${a.ziel}  ${a.groesse}×${a.groesse}  ${daten.length} Bytes`);
});

await browser.close();
