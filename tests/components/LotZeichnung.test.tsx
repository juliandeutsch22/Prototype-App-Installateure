/**
 * Die Zeichnungen der Linie „Lot“ (`LotZeichnung`, Entscheidung E29).
 *
 * Eine Zeichnung trägt keine Bedeutung, die nicht auch im Text steht. Geprüft
 * wird, dass sie für Vorlesehilfe und Tastatur unsichtbar bleibt, dass jede
 * Größe ihre Klasse bekommt — und dass Klassen und Regeln den Bau überleben:
 * Tailwind behält Regeln aus `@layer components` nur, wenn der Klassenname
 * wörtlich im Quelltext steht. Zusammengesetzt (`lot-zeichnung-${art}`) fielen
 * die Größen im Bau weg, und die Zeichnung füllte die ganze Breite — in jsdom
 * sieht man das nicht, nur am Quelltext.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import LotZeichnung, { type LotMotiv } from '@/components/LotZeichnung';

const ARTEN = ['leer', 'hinweis', 'buehne'] as const;
const MOTIVE: LotMotiv[] = ['bau', 'akte', 'beleg', 'schein', 'plan', 'lager', 'wartung', 'einrichtung', 'suche', 'fertig', 'ablage'];
/** Die Bausteine einer Zeichnung — jeder braucht eine Regel, sonst malt der Browser schwarz. */
const BAUSTEINE = ['hilfe', 'kontur', 'papier', 'flaeche', 'zeile', 'balken', 'griff', 'haken'];

/** Ohne Kommentare — dort steht der zusammengesetzte Name als Begründung. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const STILE = readdirSync('src/styles')
  .filter((n) => n.endsWith('.css'))
  .map((n) => readFileSync(join('src/styles', n), 'utf8'))
  .join('\n');

describe('LotZeichnung', () => {
  it('ist rein dekorativ: verborgen für die Vorlesehilfe, ohne Fokus, ohne Text', () => {
    const { container } = render(<LotZeichnung motiv="bau" art="leer" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('viewBox', '0 0 240 150');
    expect(svg.textContent).toBe('');
  });

  it.each(MOTIVE)('Motiv „%s“: Hilfslinien und Kontur, nur bekannte Bausteine', (motiv) => {
    const { container } = render(<LotZeichnung motiv={motiv} art="leer" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('data-motiv', motiv);
    expect(svg.querySelectorAll('.hilfe').length).toBeGreaterThan(0);
    expect(svg.querySelectorAll('.kontur').length).toBeGreaterThan(0);
    const klassen = new Set([...svg.querySelectorAll('path, rect, circle')].flatMap((t) => (t.getAttribute('class') ?? '').split(' ')));
    for (const k of klassen) expect(BAUSTEINE, k).toContain(k);
  });

  it.each(ARTEN)('Größe „%s“ trägt genau ihre Klasse', (art) => {
    const { container } = render(<LotZeichnung motiv="akte" art={art} />);
    expect([...container.querySelector('svg')!.classList]).toEqual(['lot-zeichnung', `lot-zeichnung-${art}`]);
  });

  /*
    DER WÄCHTER GEGEN DEN FEHLER, DER SCHON EINMAL DA WAR. Gegenprobe
    (29.10.2026 ausgeführt): mit `lot-zeichnung lot-zeichnung-${art}` in
    LotZeichnung.tsx rendert die Komponente dieselben Klassen — die Prüfung
    oben bleibt grün, diese wird rot.
  */
  it.each(ARTEN)('Wächter: „lot-zeichnung-%s“ steht wörtlich im Quelltext und hat eine Regel', (art) => {
    const klasse = `lot-zeichnung-${art}`;
    const quelle = ohneKommentare(readFileSync('src/components/LotZeichnung.tsx', 'utf8'));
    expect(quelle).toMatch(new RegExp(`['"\`\\s]${klasse}['"\`\\s]`));
    expect(STILE).toMatch(new RegExp(`\\.${klasse}(?![\\w-])[^{}]*\\{`));
  });

  it.each(BAUSTEINE)('Wächter: der Baustein „%s“ hat eine Regel unter .lot-zeichnung', (baustein) => {
    expect(STILE).toMatch(new RegExp(`\\.lot-zeichnung \\.${baustein}(?![\\w-])[^{}]*\\{`));
  });

  it('keine halbdurchsichtigen Flächen: die Regeln der Zeichnung setzen keine Deckkraft', () => {
    const regeln = STILE.split('\n').filter((z) => z.includes('.lot-zeichnung'));
    expect(regeln.length).toBeGreaterThan(0);
    for (const z of regeln) expect(z).not.toMatch(/opacity/);
  });

  it('Wächter: auch der nächste Schritt eines Leerzustands steht wörtlich da und hat seine Regeln', () => {
    const quelle = ohneKommentare(readFileSync('src/components/States.tsx', 'utf8'));
    expect(quelle).toMatch(/['"`\s]lot-naechster-schritt-breit['"`\s]/);
    expect(STILE).toMatch(/\.lot-naechster-schritt(?![\w-])[^{}]*\{/);
    expect(STILE).toMatch(/\.lot-naechster-schritt-breit \{ display: none; \}/);
  });
});
