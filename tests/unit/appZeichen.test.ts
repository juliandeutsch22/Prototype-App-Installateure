/**
 * App-Zeichen und Favicon — das einheitliche Senklot in Petrol auf Weiß.
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
import { createHash } from 'node:crypto';

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
const ZEICHEN: Array<{ datei: string; groesse: number }> = [
  ...manifest.icons.map((i: { src: string; sizes: string }) => ({ datei: i.src.slice(1), groesse: Number(i.sizes.split('x')[0]) })),
  ...[...html.matchAll(/<link rel="icon" type="image\/png" sizes="(\d+)x\d+" href="\/([^"]+)"/g)].map((m) => ({ datei: m[2], groesse: Number(m[1]) })),
  { datei: 'marke/apple-touch-icon.png', groesse: 180 },
];

describe('Einheitliche Senklot-Zeichen', () => {
  it('bindet alle Größen unter neuen Adressen ein', () => {
    expect(ZEICHEN.map(z => z.datei).sort()).toEqual([
      'marke/apple-touch-icon.png', 'marke/favicon-16.png', 'marke/favicon-32.png', 'marke/favicon-64.png',
      'marke/icon-192.png', 'marke/icon-512.png', 'marke/icon-maskable-512.png',
    ]);
    expect(html).toContain('href="/marke/apple-touch-icon.png"');
    expect(html).toContain('href="/marke/favicon.svg"');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  /*
    RUND wird, was das System so zeigt, wie es geliefert wird (Reiter,
    Lesezeichen, installierte App am Schreibtisch) — Vorgabe vom 04.11.2026,
    Radius 12 von 64. RANDLOS und deckend bleiben das Apple-Touch-Icon (iOS
    füllt durchsichtige Ecken schwarz) und das maskierbare Android-Icon (der
    Starter schneidet seine Form selbst aus).
  */
  const RANDLOS = ['marke/apple-touch-icon.png', 'marke/icon-maskable-512.png'];
  const RUND = ZEICHEN.filter((z) => !RANDLOS.includes(z.datei));

  it('rundet die Reiter- und Schreibtisch-Icons, nicht die, die das System selbst maskiert', () => {
    expect(RUND.map((z) => z.datei).sort()).toEqual([
      'marke/favicon-16.png', 'marke/favicon-32.png', 'marke/favicon-64.png', 'marke/icon-192.png', 'marke/icon-512.png',
    ]);
    expect(lies('public/marke/favicon.svg').toString()).toContain('<rect width="64" height="64" rx="12" fill="#FFFFFF"/>');
    expect(lies('public/marke/icon.svg').toString()).toContain('<rect width="64" height="64" fill="#FFFFFF"/>');
  });

  it.each(ZEICHEN)('$datei hat die angegebene Größe und das Lot in Petrol', ({ datei, groesse }) => {
    const { breite, hoehe, pixel } = pngLesen(lies(`public/${datei}`));
    expect([breite, hoehe]).toEqual([groesse, groesse]);
    let petrol=0;
    for (let y=0;y<hoehe;y++) for (let x=0;x<breite;x++) {
      const [r,g,b]=pixel(x,y);
      if(r<100 && g<150 && b<170) petrol++;
    }
    expect(petrol).toBeGreaterThan(breite*hoehe*.02);
  });

  it.each(RANDLOS.map((datei) => ({ datei })))('$datei bleibt randlos auf deckendem Weiß', ({ datei }) => {
    const { breite, hoehe, pixel } = pngLesen(lies(`public/${datei}`));
    for (const [x,y] of [[0,0],[breite-1,0],[0,hoehe-1],[breite-1,hoehe-1]]) expect(pixel(x,y)).toEqual([255,255,255,255]);
    let durchsichtig=0;
    for (let y=0;y<hoehe;y++) for (let x=0;x<breite;x++) if(pixel(x,y)[3]!==255) durchsichtig++;
    expect(durchsichtig).toBe(0);
  });

  it.each(RUND)('$datei hat runde Ecken mit Radius 12/64 und sonst deckendes Weiß', ({ datei }) => {
    const { breite, hoehe, pixel } = pngLesen(lies(`public/${datei}`));
    for (const [x,y] of [[0,0],[breite-1,0],[0,hoehe-1],[breite-1,hoehe-1]]) expect(pixel(x,y)[3], `Ecke ${x},${y}`).toBeLessThan(32); // bei 16 px Kantenglättung
    // Die Kanten zwischen den Ecken sind deckend weiß: gerundet ist nur die Ecke.
    for (const [x,y] of [[breite>>1,0],[0,hoehe>>1],[breite-1,hoehe>>1],[breite>>1,hoehe-1]]) expect(pixel(x,y)).toEqual([255,255,255,255]);
    // Fehlende Deckung gesamt = vier Viertelkreis-Zwickel: 4 · (1 − π/4) · (12/64)² ≈ 3,0 % der Fläche.
    let fehlend=0;
    for (let y=0;y<hoehe;y++) for (let x=0;x<breite;x++) fehlend+=(255-pixel(x,y)[3])/255;
    expect(fehlend/(breite*hoehe)).toBeCloseTo(4*(1-Math.PI/4)*(12/64)**2, 2);
    // Innerhalb der Rundung ist nichts durchsichtig.
    const r = breite*12/64;
    for (let y=0;y<hoehe;y++) for (let x=0;x<breite;x++) {
      const dx=Math.max(0, r-(x+.5), (x+.5)-(breite-r)), dy=Math.max(0, r-(y+.5), (y+.5)-(hoehe-r));
      if (Math.hypot(dx,dy) < r-1.5) expect(pixel(x,y)[3], `${x},${y}`).toBe(255);
    }
  });

  it('hält das gesamte Zeichen im sicheren Android-Kreis', () => {
    const {breite,hoehe,pixel}=pngLesen(lies('public/marke/icon-maskable-512.png'));
    let radius=0;
    for(let y=0;y<hoehe;y++) for(let x=0;x<breite;x++) {
      const [r,g,b]=pixel(x,y);
      if(r<200 && g<210 && b<220) radius=Math.max(radius,Math.hypot(x+.5-breite/2,y+.5-hoehe/2));
    }
    expect(radius/breite).toBeLessThanOrEqual(.4);
    expect(radius/breite).toBeGreaterThan(.3);
  });

  it.each(ZEICHEN)('$datei bleibt auch unter der bisherigen Adresse aktuell', ({datei}) => {
    const name=datei.split('/').pop()!;
    expect(lies(`public/${datei}`).equals(lies(`marke/${name}`))).toBe(true);
    expect(lies(`public/${name}`).equals(lies(`marke/${name}`))).toBe(true);
  });

  it('liefert die freigegebenen SVG-Pfade ohne fontabhängige Texte aus', () => {
    for(const name of ['logo.svg','logo-weiss.svg','zeichen.svg','schriftzug.svg']) {
      const master=lies(`marke/${name}`);
      expect(lies(`public/marke/${name}`).equals(master)).toBe(true);
      expect(master.toString()).not.toMatch(/<text\b|<image\b|<script\b|font-family/);
    }
  });

  it('erkennt geänderte Vorlagen ohne neu erzeugte Icons', () => {
    const ausgabe=JSON.parse(lies('marke/ausgabe.json').toString()) as {vorlagen:Record<string,string>;bilder:Record<string,string>};
    for(const [name,hash] of Object.entries({...ausgabe.vorlagen,...ausgabe.bilder})) {
      expect(createHash('sha256').update(lies(`marke/${name}`)).digest('hex'),name).toBe(hash);
    }
  });

  it('zeigt bei Push ein transparentes Abzeichen statt einer vollflächigen Kachel', () => {
    const {breite,hoehe,pixel}=pngLesen(lies('public/marke/badge-96.png'));
    expect([breite,hoehe]).toEqual([96,96]);
    expect(pixel(0,0)[3]).toBe(0);
    let sichtbar=0;
    for(let y=0;y<hoehe;y++) for(let x=0;x<breite;x++) if(pixel(x,y)[3]>200) sichtbar++;
    expect(sichtbar).toBeGreaterThan(100);
    expect(sichtbar).toBeLessThan(breite*hoehe/2);
    const worker=lies('public/sw.js').toString();
    expect(worker).toContain("badge: '/marke/badge-96.png'");
    expect(worker).toContain("icon: '/marke/icon-192.png'");
  });

  it('behält Startbildschirm- und Statusleistenfarben der App bei', () => {
    expect(manifest.background_color.toLowerCase()).toBe('#ffffff');
    expect(manifest.theme_color.toLowerCase()).toBe('#0f3c47');
  });
});
