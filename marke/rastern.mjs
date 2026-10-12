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
  DIE VORLAGE (seit 12.10.2026) ist das Bild des Betriebs, wie geliefert:
  1254 × 1254, die Kachel in Petrol mit dem weissen Senklot, der Grund
  ringsum durchsichtig. Gemessen an der Datei:

  - die Kachel reicht von Spalte 114 bis 1139 und Zeile 93 bis 1131
    (1025 × 1038 — nicht ganz quadratisch);
  - ihr Rand ist ein dunkler Umriss mit heller Fase, zusammen rund 40 px;
    auf den Diagonalen der runden Ecken klingt er 108 px von der Ecke aus;
  - der weiteste Punkt des Senklots (Oberkante der Schnur, Spitze) liegt
    355 px von der Mitte der Kachel.
*/
const KACHEL = { links: 114, oben: 93, rechts: 1139, unten: 1131 };
const MITTE_X = (KACHEL.links + KACHEL.rechts) / 2;
const MITTE_Y = (KACHEL.oben + KACHEL.unten) / 2;
const SENKLOT_RADIUS = 355;

/*
  ZWEI FORMEN DES ZEICHENS.

  - KACHEL: so, wie geliefert — die runden Ecken bleiben durchsichtig. Für
    den Browserreiter und das Zeichen „any“ (Schreibtisch, Liste der Apps).
    Ausschnitt: ein Quadrat um die Mitte der Kachel, etwas grösser als ihre
    längere Seite.
  - RANDLOS: ein deckendes Quadrat ohne Ecke und ohne Rand. iOS rundet das
    Apple-Touch-Icon selbst ab und rechnet Durchsichtiges vorher gegen
    Schwarz; Android schneidet das maskable Zeichen in seine eigene Form.
    Genommen wird das Innere der Kachel, 112 px von ihrem Rand — dort ist
    die Fase vorbei, auch in den Ecken. Es ist 801 px breit; damit Android
    nichts vom Senklot wegschneidet (sicher bleibt nur ein Kreis von 80 %
    der Breite), wird es auf 935 px verlängert: das Senklot reicht dann bis
    38 % der Breite von der Mitte. Verlängert wird mit der jeweils
    äussersten Zeile und Spalte; der Grund läuft dort fast eben, eine Naht
    ist nicht zu sehen.
*/
const KACHEL_SEITE = Math.max(KACHEL.rechts - KACHEL.links, KACHEL.unten - KACHEL.oben) + 2;
const INNEN_RAND = 112;
const INNEN_SEITE = KACHEL.rechts - KACHEL.links - 2 * INNEN_RAND;
const RANDLOS_SEITE = Math.ceil(SENKLOT_RADIUS / 0.38);

const AUFTRAEGE = [
  { ziel: 'icon-192.png', groesse: 192, form: 'kachel' },
  { ziel: 'icon-512.png', groesse: 512, form: 'kachel' },
  { ziel: 'apple-touch-icon.png', groesse: 180, form: 'randlos' },
  { ziel: 'icon-maskable-512.png', groesse: 512, form: 'randlos' },
  { ziel: 'favicon-64.png', groesse: 64, form: 'kachel' },
  { ziel: 'favicon-32.png', groesse: 32, form: 'kachel' },
  { ziel: 'favicon-16.png', groesse: 16, form: 'kachel' },
];

const vorlage = `data:image/png;base64,${readFileSync(resolve(HIER, 'app-zeichen.png')).toString('base64')}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PFAD || undefined,
});
const page = await browser.newPage();

const bilder = await page.evaluate(
  async ({ vorlage, auftraege, MITTE_X, MITTE_Y, KACHEL_SEITE, INNEN_SEITE, RANDLOS_SEITE }) => {
    const bild = new Image();
    bild.src = vorlage;
    await bild.decode();

    /*
      DIE DECKKRAFT BEREINIGEN. Die gelieferte Datei ist in der Kachel nicht
      ganz deckend (246–253 statt 255) — auf hellem Grund schiene sie leicht
      durch —, und ausserhalb liegen Reste mit höchstens 2 % Deckkraft, auf
      Weiss ein grauer Schleier. Beides ist weg; die geglättete Kante der
      Kachel (Deckkraft dazwischen) bleibt, wie sie ist.
    */
    const roh = document.createElement('canvas');
    roh.width = bild.width;
    roh.height = bild.height;
    const r = roh.getContext('2d');
    r.drawImage(bild, 0, 0);
    const pixel = r.getImageData(0, 0, roh.width, roh.height);
    for (let i = 3; i < pixel.data.length; i += 4) {
      if (pixel.data[i] < 8) pixel.data[i] = 0;
      else if (pixel.data[i] >= 200) pixel.data[i] = 255;
    }
    r.putImageData(pixel, 0, 0);

    // Ganze Pixel als Ausschnitt: ein halber verschöbe alles um eine halbe Zeile und machte es weich.
    const kachel = document.createElement('canvas');
    kachel.width = kachel.height = KACHEL_SEITE;
    const kx = Math.round(MITTE_X - KACHEL_SEITE / 2);
    const ky = Math.round(MITTE_Y - KACHEL_SEITE / 2);
    kachel.getContext('2d').drawImage(roh, kx, ky, KACHEL_SEITE, KACHEL_SEITE, 0, 0, KACHEL_SEITE, KACHEL_SEITE);

    // Das Innere der Kachel, dann ringsum mit seiner äussersten Zeile und Spalte verlängert.
    const randlos = document.createElement('canvas');
    randlos.width = randlos.height = RANDLOS_SEITE;
    const q = randlos.getContext('2d');
    const n = INNEN_SEITE;
    const ix = Math.round(MITTE_X - n / 2);
    const iy = Math.round(MITTE_Y - n / 2);
    const vorn = Math.floor((RANDLOS_SEITE - n) / 2);
    const hinten = RANDLOS_SEITE - vorn - n;
    q.drawImage(roh, ix, iy, n, n, vorn, vorn, n, n);
    q.drawImage(roh, ix, iy, n, 1, vorn, 0, n, vorn);
    q.drawImage(roh, ix, iy + n - 1, n, 1, vorn, vorn + n, n, hinten);
    q.drawImage(roh, ix, iy, 1, n, 0, vorn, vorn, n);
    q.drawImage(roh, ix + n - 1, iy, 1, n, vorn + n, vorn, hinten, n);
    q.drawImage(roh, ix, iy, 1, 1, 0, 0, vorn, vorn);
    q.drawImage(roh, ix + n - 1, iy, 1, 1, vorn + n, 0, hinten, vorn);
    q.drawImage(roh, ix, iy + n - 1, 1, 1, 0, vorn + n, vorn, hinten);
    q.drawImage(roh, ix + n - 1, iy + n - 1, 1, 1, vorn + n, vorn + n, hinten, hinten);

    /*
      IN HALBEN SCHRITTEN VERKLEINERN, nicht in einem Zug: von über 1000 auf
      16 Pixel nähme ein einziger Schritt nur jedes sechzigste Pixel mit, und
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

    return auftraege.map((a) => verkleinern(a.form === 'kachel' ? kachel : randlos, a.groesse).toDataURL('image/png').split(',')[1]);
  },
  { vorlage, auftraege: AUFTRAEGE, MITTE_X, MITTE_Y, KACHEL_SEITE, INNEN_SEITE, RANDLOS_SEITE },
);

AUFTRAEGE.forEach((a, i) => {
  const daten = Buffer.from(bilder[i], 'base64');
  writeFileSync(resolve(HIER, a.ziel), daten);
  console.log(`${a.ziel}  ${a.groesse}×${a.groesse}  ${a.form}  ${daten.length} Bytes`);
});

await browser.close();
