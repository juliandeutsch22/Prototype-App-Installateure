/**
 * App-Zeichen und Favicon — das Senklot weiss auf der Kachel in Petrol
 * (seit 12.10.2026, vom Betrieb geliefert; davor auf Weiss).
 *
 * Was hier steht, sieht kein Test der Oberfläche: der Reiter, der
 * Startbildschirm, der Start der App unter Android. Ein falsch
 * zugeschnittenes Bild oder eine durchsichtige Ecke am falschen Ort fällt
 * erst am Telefon auf — und iOS behält das Bild, bis die App dort neu
 * hinzugefügt wird.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad));

/**
 * Ein PNG ganz gelesen: Breite, Höhe und jedes Pixel als RGBA. Nur was
 * `rastern.mjs` schreibt — 8 Bit, RGB oder RGBA, ohne Zeilensprung —, dafür
 * jeder der fünf Zeilenfilter.
 */
function pngLesen(daten: Buffer) {
  expect(daten.subarray(1, 4).toString('latin1')).toBe('PNG');
  const breite = daten.readUInt32BE(16);
  const hoehe = daten.readUInt32BE(20);
  expect(daten[24], 'nur 8 Bit je Kanal').toBe(8);
  expect(daten[28], 'ohne Zeilensprung').toBe(0);
  const farbtyp = daten[25];
  const kanaele = farbtyp === 6 ? 4 : farbtyp === 2 ? 3 : 0;
  expect(kanaele, 'nur RGB oder RGBA').toBeGreaterThan(0);
  const idat: Buffer[] = [];
  for (let i = 8; i < daten.length; ) {
    const laenge = daten.readUInt32BE(i);
    if (daten.subarray(i + 4, i + 8).toString('latin1') === 'IDAT') idat.push(daten.subarray(i + 8, i + 8 + laenge));
    i += 12 + laenge;
  }
  const roh = inflateSync(Buffer.concat(idat));
  const zeile = breite * kanaele;
  const bild = new Uint8Array(zeile * hoehe);
  for (let y = 0; y < hoehe; y += 1) {
    const filter = roh[y * (zeile + 1)];
    const ein = y * (zeile + 1) + 1;
    for (let x = 0; x < zeile; x += 1) {
      const a = x >= kanaele ? bild[y * zeile + x - kanaele] : 0;
      const b = y > 0 ? bild[(y - 1) * zeile + x] : 0;
      const c = x >= kanaele && y > 0 ? bild[(y - 1) * zeile + x - kanaele] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const vorhersage = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      bild[y * zeile + x] = (roh[ein + x] + vorhersage) & 0xff;
    }
  }
  const pixel = (x: number, y: number): [number, number, number, number] => {
    const i = (y * breite + x) * kanaele;
    return [bild[i], bild[i + 1], bild[i + 2], kanaele === 4 ? bild[i + 3] : 255];
  };
  return { breite, hoehe, pixel };
}

const manifest = JSON.parse(lies('public/manifest.webmanifest').toString('utf8'));
const html = lies('index.html').toString('utf8');

/** Jedes Bild, das ein Gerät als Zeichen holt, mit der Größe, die es erwartet. */
const ZEICHEN: Array<{ datei: string; groesse: number }> = [
  ...manifest.icons.map((i: { src: string; sizes: string }) => ({
    datei: i.src.replace(/^\//, ''),
    groesse: Number(i.sizes.split('x')[0]),
  })),
  ...[...html.matchAll(/<link rel="icon" type="image\/png" sizes="(\d+)x\d+" href="\/([^"]+)"/g)].map((m) => ({
    datei: m[2],
    groesse: Number(m[1]),
  })),
  { datei: 'apple-touch-icon.png', groesse: 180 },
];

describe('App-Zeichen und Favicon', () => {
  it('sind alle eingebunden, die es gibt', () => {
    expect(ZEICHEN.map((z) => z.datei).sort()).toEqual([
      'apple-touch-icon.png',
      'favicon-16.png',
      'favicon-32.png',
      'favicon-64.png',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
    ]);
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
  });

  it.each(ZEICHEN)('$datei ist quadratisch in der angegebenen Größe', ({ datei, groesse }) => {
    const { breite, hoehe } = pngLesen(lies(`public/${datei}`));
    expect([breite, hoehe]).toEqual([groesse, groesse]);
  });

  /*
    ZWEI FORMEN. Wo der Browser oder das System das Bild so zeigt, wie es
    ist (Reiter, Zeichen „any“), steht die Kachel mit ihren runden Ecken —
    die Ecken sind durchsichtig. Wo das System selbst zuschneidet (iOS,
    Android maskable), ist das Bild randlos und deckend: iOS rechnet
    Durchsichtiges gegen Schwarz, und eine Ecke der Kachel innerhalb der
    Maske von Android stünde als heller Fleck da.
  */
  const RANDLOS = ['apple-touch-icon.png', 'icon-maskable-512.png'];
  const KACHEL = ZEICHEN.filter((z) => !RANDLOS.includes(z.datei));

  it.each(KACHEL)('$datei ist die Kachel: durchsichtige Ecken, deckende Mitte', ({ datei, groesse }) => {
    const { pixel } = pngLesen(lies(`public/${datei}`));
    const r = groesse - 1;
    // Bei 16 px ragt die Rundung knapp in das Eckpixel (Deckkraft 7 von 255) — durchsichtig heisst hier: fast nichts.
    for (const [x, y] of [[0, 0], [r, 0], [0, r], [r, r]]) expect(pixel(x, y)[3], `Ecke ${x},${y}`).toBeLessThan(16);
    expect(pixel(groesse >> 1, groesse >> 2)[3], 'oben in der Mitte').toBe(255);
  });

  it.each(RANDLOS.map((datei) => ({ datei })))('$datei ist randlos und in jedem Pixel deckend', ({ datei }) => {
    const { breite, hoehe, pixel } = pngLesen(lies(`public/${datei}`));
    const durchsichtig: string[] = [];
    for (let y = 0; y < hoehe; y += 1) {
      for (let x = 0; x < breite; x += 1) if (pixel(x, y)[3] !== 255) durchsichtig.push(`${x},${y}`);
    }
    expect(durchsichtig.slice(0, 5)).toEqual([]);
    // Die Ecke ist der Grund der Kachel (Petrol), nicht Weiss und nicht Schwarz.
    const [r, g, b] = pixel(0, 0);
    expect(b, 'Petrol: mehr Blau als Rot').toBeGreaterThan(r + 40);
    expect(g, 'Petrol: mehr Grün als Rot').toBeGreaterThan(r + 40);
  });

  it('das maskable Zeichen hält das Senklot im sicheren Kreis', () => {
    // Android garantiert nur einen Kreis von 80 % der Breite um die Mitte;
    // was ausserhalb liegt, schneidet eine runde Maske weg — zuerst die Schnur.
    const { breite, hoehe, pixel } = pngLesen(lies('public/icon-maskable-512.png'));
    const mitte = breite / 2;
    let weitester = 0;
    let gefunden = 0;
    for (let y = 0; y < hoehe; y += 1) {
      for (let x = 0; x < breite; x += 1) {
        const [r, g, b] = pixel(x, y);
        if (r > 200 && g > 200 && b > 200) {
          gefunden += 1;
          weitester = Math.max(weitester, Math.hypot(x + 0.5 - mitte, y + 0.5 - mitte));
        }
      }
    }
    expect(gefunden, 'das weisse Senklot ist da').toBeGreaterThan(breite * hoehe * 0.05);
    expect(weitester / breite).toBeLessThanOrEqual(0.4);
  });

  it.each(ZEICHEN)('$datei ist dieselbe Datei wie in marke/', ({ datei }) => {
    // Zwei Stände desselben Bildes wären zwei Wahrheiten; `rastern.mjs`
    // schreibt nach marke/, ausgeliefert wird public/.
    expect(lies(`public/${datei}`).equals(lies(`marke/${datei}`))).toBe(true);
  });

  it('startet unter Android auf Weiss, wie die App', () => {
    // Der Startbildschirm unter Android zeigt das Zeichen auf dieser Farbe,
    // gleich danach kommt die helle App. Mit der Kachel steht dort ein
    // Zeichen in Petrol auf Weiss — so wie im Reiter des Browsers.
    expect(manifest.background_color.toLowerCase()).toBe('#ffffff');
  });

  it('lässt die Farbe des Statusbalkens bei der Farbe der Kopfleiste', () => {
    // Seit der Linie „Lot“ trägt die Kopfleiste `--navi` (#0f3c47), eine
    // Stufe tiefer als das Petrol der Knöpfe.
    expect(manifest.theme_color.toLowerCase()).toBe('#0f3c47');
  });
});
