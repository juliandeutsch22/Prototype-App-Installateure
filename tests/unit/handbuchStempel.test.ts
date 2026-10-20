import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  KOPF UND FUSS DES HANDBUCHS SAGEN DASSELBE (20.10.2026): Der Stempel oben
  wurde mit jedem PR nachgezogen, die Fußzeile unten nicht — sie stand
  zwölf Tage lang auf „Stand 07.10.2026“ mit Zahlen, die es so nicht mehr
  gab. Wer nach unten blättert, soll nicht einen anderen Stand lesen.
*/

const html = readFileSync('docs/handbuch/handbuch.html', 'utf8');

function stempel() {
  const kopf = html.match(/<div class="stempel">([\s\S]*?)<\/div>/)?.[1] ?? '';
  return {
    stand: kopf.match(/Stand <b>(\d{2}\.\d{2}\.\d{4})<\/b>/)?.[1],
    pruefungen: kopf.match(/Automatische Prüfungen <b>([^<]+)<\/b>/)?.[1],
  };
}

function fuss(): string {
  return (html.match(/<footer class="fuss">([\s\S]*?)<\/footer>/)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('Handbuch: Fußzeile wie der Stempel', () => {
  it('der Stempel hat Stand und Prüfungen', () => {
    expect(stempel().stand).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(stempel().pruefungen).toMatch(/Modulprüfungen · \d+ Browserwege · \d+ Linkprüfungen$/);
  });

  it('die Fußzeile nennt denselben Stand', () => {
    expect(fuss()).toContain(`Stand ${stempel().stand}`);
  });

  it('die Fußzeile nennt dieselben Prüfungen und keine anderen Zahlen', () => {
    const f = fuss();
    expect(f).toContain(stempel().pruefungen);
    const zahlenImFuss: string[] = f.match(/\d[\d.]*/g) ?? [];
    const erlaubt: string[] = `${stempel().stand} ${stempel().pruefungen}`.match(/\d[\d.]*/g) ?? [];
    expect(zahlenImFuss.filter((z) => !erlaubt.includes(z))).toEqual([]);
  });
});
