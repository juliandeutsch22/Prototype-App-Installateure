import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/*
  E95 (17.11.2026): „Die App soll zurück zum Petrol-Farbschema … stelle
  sicher, dass am Ende wirklich alle Elemente die korrekten Farben haben.“

  Die Farben stehen als Tokens in `src/index.css`; daneben gibt es Stellen,
  die vor jedem Stylesheet gelten (Ladefläche in `index.html`, Manifest,
  Statusleiste) oder als Bild ausgeliefert werden (Marke). Diese Prüfung
  sucht in allem, was die App ausliefert, nach den Tönen der warmen Linie V10
  und des kurzen Blaus (E93) — ein vergessener Wert fiele sonst erst am
  Telefon auf, etwa als beiger Blitz beim Start.
*/
const WURZEL = resolve(process.cwd());
const ALTE_TOENE = [
  // V10 hell und dunkel
  'a85439', '9b4c33', 'd08a68', 'f4f0e8', 'fffdf8', 'faf7f1', 'eee6db', '25231f', '211f1c', '25221f', '302c27', 'fff8ee',
  'f3e4d8', 'e2d8cb', 'ded4c7', '292722', '473b32', 'b97b5e', 'e8dacc', 'f1ece4', 'e7ded2',
  // E93
  '2b5fa6', '7ba7dc', 'f4f1e8', '5e6a40', '9daf7e',
];

function dateien(ordner: string, endungen: string[]): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad, endungen);
    return endungen.some((e) => name.endsWith(e)) ? [pfad] : [];
  });
}

function funde(text: string): string[] {
  const klein = text.toLowerCase();
  return ALTE_TOENE.filter((t) => new RegExp(`#${t}\\b`).test(klein));
}

describe('Petrol überall (E95)', () => {
  it('keine Töne der warmen Linie oder des Blaus in Stilen, Code, Ladefläche, Manifest und Marke', () => {
    const quellen = [
      ...dateien(join(WURZEL, 'src'), ['.css', '.ts', '.tsx']),
      join(WURZEL, 'index.html'),
      join(WURZEL, 'public/manifest.webmanifest'),
      ...dateien(join(WURZEL, 'public/marke'), ['.svg']),
      ...dateien(join(WURZEL, 'marke'), ['.svg']),
    ];
    const treffer = quellen.flatMap((pfad) => funde(readFileSync(pfad, 'utf8')).map((t) => `${pfad.slice(WURZEL.length + 1)}: #${t}`));
    expect(treffer).toEqual([]);
  });

  it('der Grund vor dem ersten Bild, das Manifest und die Statusleiste tragen Petrol-Weiß und dunkel den Petrol-Grund', () => {
    const html = readFileSync(join(WURZEL, 'index.html'), 'utf8');
    expect(html).toContain('<html lang="de" style="background-color:#ffffff">');
    expect(html).toContain("h.style.backgroundColor='#0c1c20'");
    const darstellung = readFileSync(join(WURZEL, 'src/lib/darstellung.ts'), 'utf8');
    expect(darstellung).toContain("{ hell: '#ffffff', dunkel: '#0c1c20' }");
  });

  it('Gegenprobe: ein vergessener warmer Ton fällt auf', () => {
    expect(funde('.x { background: #F4F0E8; }')).toEqual(['f4f0e8']);
    expect(funde('<g fill="#A85439">')).toEqual(['a85439']);
    expect(funde('.x { color: #0f4552; }')).toEqual([]);
  });
});
