/**
 * Die Farben der Marke, auch dort, wo kein Stylesheet hinreicht.
 *
 * Belege, die Unterschrift und die Hauptknöpfe trugen bis zum Prüflauf vom
 * 24.09.2026 Farben, die es in der Oberfläche nicht gibt: #003366 im
 * Stundennachweis, das Schiefergrau #1e293b im Schein, die Grautöne von
 * Bootstrap auf Rechnung und Angebot, #111827 für die Unterschrift, zwei
 * Farben für Hauptaktionen (C1–C11, C14). Diese Prüfung hält beides fest:
 * die Belegfarben SIND die Tokens aus `index.css`, und die alten Werte
 * kommen nicht zurück.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TINTE, GRAU, LINIE, ROT, PETROL, FLAECHE } from '@/lib/belegLayout';

const css = readFileSync('src/index.css', 'utf8');

/** Der erste Wert eines Tokens in `:root` als RGB-Tripel. */
function token(name: string): [number, number, number] {
  const m = new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i').exec(css);
  if (!m) throw new Error(`Token ${name} fehlt in index.css`);
  const h = m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? dateien(p) : /\.(ts|tsx|css)$/.test(n) ? [p] : [];
  });
}

describe('Belegfarben', () => {
  /*
    SEIT DER LINIE „LOT“ GETRENNT. Bis zum Umbau waren die Belegfarben die
    Tokens der Oberfläche. Das Protokoll verlangt Belege und Exporte
    prüfsummengleich (docs/ui-umbau/protokoll.md 0.1) — sie bleiben deshalb
    beim Stand vor Lot, und diese Prüfung hält genau diesen Stand fest
    (docs/ui-umbau/entscheidungen.md, E11).
  */
  it('bleiben beim Stand vor dem Umbau', () => {
    expect(TINTE).toEqual([10, 32, 48]);
    expect(GRAU).toEqual([56, 80, 95]);
    expect(LINIE).toEqual([207, 227, 233]);
    expect(ROT).toEqual([173, 26, 26]);
    expect(FLAECHE).toEqual([241, 248, 250]);
  });

  it('und Petrol ist weiter die Farbe des Produkts', () => {
    expect(PETROL).toEqual(token('--brand-fixed'));
  });
});

/** Ohne Kommentare — dort dürfen die alten Werte als Begründung stehen. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Keine fremden Farben mehr im Quelltext', () => {
  const quellen = dateien('src').map((p) => [p, ohneKommentare(readFileSync(p, 'utf8'))] as const);

  it.each([
    ['#003366 (altes Marineblau)', /\[0,\s*51,\s*102\]|#003366/i],
    ['#1e293b (Schiefergrau)', /\[30,\s*41,\s*59\]|#1e293b/i],
    ['#111827 (Unterschrift)', /#111827/i],
    ['Bootstrap-Grau #212529/#6c757d/#ced4da', /\[33,\s*37,\s*41\]|\[108,\s*117,\s*125\]|\[206,\s*212,\s*218\]/],
    ['eigener Abdunkler statt bg-ink/40', /bg-\[rgba\(/],
    ['Schriftgrösse außerhalb der Skala', /text-\[(0\.\d+rem|\d+px)\]/],
    ['zweite Farbe für Hauptaktionen', /variant="accent"/],
  ])('%s', (_name, muster) => {
    const treffer = quellen.filter(([, text]) => muster.test(text)).map(([p]) => p);
    expect(treffer).toEqual([]);
  });

  it('Meldungen sind keine gesättigte Fläche', () => {
    // Nur die Meldung selbst: ein roter Löschen-Knopf ist gewollt.
    const toast = ohneKommentare(readFileSync('src/components/Toast.tsx', 'utf8'));
    expect(toast).not.toMatch(/bg-(success|danger|ink-deep)\b/);
  });
});
