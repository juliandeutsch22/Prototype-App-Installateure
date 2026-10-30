import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
  DIE GRENZEN DER PLANLINIE (Auftrag 30.10.2026, § 7; E30), soweit sie im
  Stil stehen. Was die Bausteine tun, prüft `tests/components/Planlinie.test.tsx`;
  hier steht, was die Regeln über ihren Ort sagen: jedes Statuszeichen hat
  sein eigenes Zeichen, das Lot steht nur am aktiven Punkt, das Raster nur
  auf Planung, Anmeldung und im dunklen Satz, die Mono-Schrift kommt aus
  dem eigenen Paket (die CSP lässt keine fremden Schriften zu).
*/
const stil = (datei: string) => readFileSync(join('src/styles', datei), 'utf8');
const PLANLINIE = stil('lot-planlinie.css');
const ALLE_STILE = [
  readFileSync('src/index.css', 'utf8'),
  ...readdirSync('src/styles').filter((d) => d.endsWith('.css')).map(stil),
].join('\n');

/** Die Deklarationen eines Selektors in der Planlinie (eine Regel je Zeile). */
function regel(selektor: string): string {
  const zeile = PLANLINIE.split('\n').find((z) => z.trim().startsWith(`${selektor} {`) || z.includes(`, ${selektor} {`));
  expect(zeile, `Regel für ${selektor}`).toBeDefined();
  return zeile!;
}

describe('B3 Statuszeichen', () => {
  const ZEICHEN: [string, string][] = [
    ['.stand-offen::before', 'offen'],
    ['.stand-geplant::before', 'geplant'],
    ['.stand-info::before', 'arbeit'],
    ['.stand-erledigt::before', 'erledigt'],
    ['.stand-warn::before', 'achtung'],
    ['.stand-fehl::before', 'ueberfaellig'],
    ['.stand-storniert::before', 'storniert'],
  ];

  it('jeder der sieben Zustände trägt sein eigenes Zeichen', () => {
    for (const [selektor, name] of ZEICHEN) {
      expect(regel(selektor)).toContain(`mask-image: var(--zeichen-${name})`);
    }
    expect(new Set(ZEICHEN.map(([, n]) => n)).size).toBe(7);
  });

  it('die Zeichen sind gezeichnete SVG mit fester Größe, in der Farbe des Zustands', () => {
    for (const [, name] of ZEICHEN) {
      const definition = PLANLINIE.split('\n').find((z) => z.includes(`--zeichen-${name}:`));
      expect(definition, name).toMatch(/url\("data:image\/svg\+xml,.*width='14' height='14'/);
    }
    // Die Farbe gibt die Fläche hinter der Maske — aus den Grundwerten, nie fest.
    expect(regel('.stand-warn::before')).toContain('background: var(--warning)');
    expect(regel('.stand-fehl::before')).toContain('background: var(--danger)');
  });

  it('Gegenprobe: kein Zustand fällt auf den alten Punkt zurück', () => {
    expect(regel('.stand::before')).toContain('border-radius: 0');
    expect(regel('.stand::before')).toContain('mask-image');
  });
});

describe('B4 Lot in der Navigation', () => {
  it('steht nur am aktiven Punkt — Seitenleiste und Leiste unten', () => {
    expect(regel('.navi-lot')).toContain('display: none');
    expect(regel('.navi-punkt-aktiv .navi-lot')).toContain('display: block');
    expect(regel('.unten-lot')).toContain('display: none');
    expect(regel('.unten-punkt-aktiv .unten-lot')).toContain('display: block');
  });

  it('der aktive Punkt hat keine gefüllte Fläche mehr — das Lot ersetzt sie', () => {
    expect(regel('.navi-punkt-aktiv')).toContain('background: none');
  });
});

describe('B12 Raster', () => {
  it('nur auf Planung, Anmeldung und im dunklen Satz (Grenze 5)', () => {
    // Das Raster ist ein Gitter aus zwei Verläufen mit harter 1-px-Kante.
    const mitGitter = ALLE_STILE.split('\n')
      .filter((z) => /linear-gradient\(var\([^)]+\) 1px, transparent 1px\), linear-gradient\(90deg/.test(z))
      .map((z) => z.trim().split(' {')[0]);
    expect(mitGitter.sort()).toEqual([
      '.anmelde-buehne',
      '.raster',
      ":root[data-theme='dark'] .hauptflaeche",
    ]);
  });

  it('die Klasse `raster` tragen nur die Planungsfläche und die Musterseite', () => {
    // Als Klasse im Text einer Klassenliste — nicht die Variable `const raster = …`.
    const dateien: string[] = [];
    const gehe = (ordner: string) => {
      for (const e of readdirSync(ordner, { withFileTypes: true })) {
        const pfad = join(ordner, e.name);
        if (e.isDirectory()) gehe(pfad);
        else if (pfad.endsWith('.tsx') && /(["'`]|\s)raster(["'`]|\s(?!=))/.test(readFileSync(pfad, 'utf8'))) dateien.push(pfad);
      }
    };
    gehe('src');
    expect(dateien.sort()).toEqual([
      'src/features/assignments/WochenRaster.tsx',
      'src/features/muster/MusterPlanlinie.tsx',
    ]);
  });
});

describe('Schrift', () => {
  it('IBM Plex Mono kommt aus dem eigenen Paket, nicht aus dem Netz', () => {
    const start = readFileSync('src/main.tsx', 'utf8');
    expect(start).toContain("import '@fontsource/ibm-plex-mono/latin-400.css'");
    expect(ALLE_STILE).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    expect(readFileSync('src/index.css', 'utf8')).toMatch(/--schrift-mono: 'IBM Plex Mono'/);
  });
});
