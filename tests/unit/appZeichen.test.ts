/**
 * App-Zeichen und Favicon — das Senklot auf Schwarz (seit 04.10.2026).
 *
 * Was hier steht, sieht kein Test der Oberfläche: der Reiter, der
 * Startbildschirm, der Start der App unter Android. Ein falsch
 * zugeschnittenes Bild oder eine durchsichtige Ecke fällt erst am Telefon
 * auf — und iOS behält das Bild, bis die App dort neu hinzugefügt wird.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad));

/** Breite, Höhe und das Pixel links oben — mehr braucht die Prüfung nicht. */
function pngKopf(daten: Buffer) {
  expect(daten.subarray(1, 4).toString('latin1')).toBe('PNG');
  const breite = daten.readUInt32BE(16);
  const hoehe = daten.readUInt32BE(20);
  const farbtyp = daten[25];
  const idat: Buffer[] = [];
  for (let i = 8; i < daten.length; ) {
    const laenge = daten.readUInt32BE(i);
    if (daten.subarray(i + 4, i + 8).toString('latin1') === 'IDAT') idat.push(daten.subarray(i + 8, i + 8 + laenge));
    i += 12 + laenge;
  }
  /*
    Das erste Pixel der ersten Zeile steht in jedem PNG-Filter unverändert
    da: es hat weder einen linken noch einen oberen Nachbarn, alle Vorhersagen
    sind null. Ein ganzer Dekoder wäre hier zu viel.
  */
  const roh = inflateSync(Buffer.concat(idat));
  const kanaele = farbtyp === 6 ? 4 : farbtyp === 2 ? 3 : 0;
  expect(kanaele, 'nur RGB oder RGBA mit 8 Bit').toBeGreaterThan(0);
  const ecke = [...roh.subarray(1, 1 + kanaele)];
  return { breite, hoehe, ecke: kanaele === 3 ? [...ecke, 255] : ecke };
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
    const { breite, hoehe } = pngKopf(lies(`public/${datei}`));
    expect([breite, hoehe]).toEqual([groesse, groesse]);
  });

  it.each(ZEICHEN)('$datei hat eine deckend schwarze Ecke — keine durchsichtige, keine weisse Platte', ({ datei }) => {
    // iOS rechnet Durchsichtigkeit gegen Schwarz, Android schneidet rund zu:
    // beides geht nur ohne Bruch, wenn der Grund bis in die Ecke Schwarz ist.
    expect(pngKopf(lies(`public/${datei}`)).ecke).toEqual([0, 0, 0, 255]);
  });

  it.each(ZEICHEN)('$datei ist dieselbe Datei wie in marke/', ({ datei }) => {
    // Zwei Stände desselben Bildes wären zwei Wahrheiten; `rastern.mjs`
    // schreibt nach marke/, ausgeliefert wird public/.
    expect(lies(`public/${datei}`).equals(lies(`marke/${datei}`))).toBe(true);
  });

  it('startet unter Android auf dem Grund des Zeichens', () => {
    // Auf Weiss stünde beim Start ein schwarzes Quadrat.
    expect(manifest.background_color.toLowerCase()).toBe('#000000');
  });

  it('lässt die Farbe des Statusbalkens beim Petrol der Kopfleiste', () => {
    expect(manifest.theme_color.toLowerCase()).toBe('#0f4552');
  });
});
