import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  DER EINSATZ ALS VOLLE PETROL-FLÄCHE (E33, Variante B; 01.11.2026). Die helle
  Fläche mit Endmarken (Planlinie B11, 30.10.) las sich im Raster zu schwach;
  der Auftraggeber fand die frühere volle Fläche schöner und hat Variante B
  freigegeben: volle Fläche, weiße Schrift, eckig, Ort und Nummer leiser.
  Was bleibt: Bernstein für „eingeteilt, aber abwesend“, Schraffur für
  Abwesenheit.
*/

const planung = readFileSync('src/styles/lot-planung.css', 'utf8');
const monat = readFileSync('src/styles/lot-monat.css', 'utf8');

/**
 * Die Rümpfe aller Regeln, deren Selektorliste genau `selektor` ist, aneinander —
 * ab 1.200 px setzt eine zweite Regel nur die Innenabstände.
 */
function regel(css: string, selektor: string): string {
  const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const treffer = [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(treffer.length, `eine Regel für ${selektor}`).toBeGreaterThan(0);
  return treffer.map((t) => t[1]).join(' ');
}

const VOLL = [/background: var\(--petrol\)/, /color: var\(--auf-petrol\)/];

describe('Einsatz als volle Petrol-Fläche (Variante B)', () => {
  /*
    E88 (13.11.2026) löst E33 für die Woche ab: der Einsatz ist ein weißes
    Blatt mit Linie rundum und Petrol-Kante, nur heute voll. Der Monat
    bleibt bei der vollen Fläche (eigene Prüfung darunter).
  */
  it('Woche (E88): weiß mit Linie rundum und 4 px Petrol-Kante, Kunde in Tinte, eckig, zwei Zellen hoch', () => {
    const r = regel(planung, '.eintrag');
    expect(r).toMatch(/background: var\(--surface\)/);
    expect(r).toMatch(/color: var\(--ink-deep\)/);
    expect(r).toMatch(/border: 1px solid var\(--border-strong\); border-left: 4px solid var\(--petrol\)/);
    expect(r).toMatch(/border-radius: 0/);
    expect(r).toMatch(/min-height: 3rem/);
    expect(r).not.toMatch(/background: var\(--petrol\)/);
  });

  it('Gegenprobe: heute — und am Handy der gewählte Tag, wenn er heute ist — trägt die volle Fläche', () => {
    const heute = regel(planung, ':is(.wp-zelle-heute, .wp-zelle-schmal-heute, .handy-woche[data-heute]) .eintrag');
    for (const m of VOLL) expect(heute).toMatch(m);
    expect(regel(planung, ':is(.wp-zelle-heute, .wp-zelle-schmal-heute, .handy-woche[data-heute]) .eintrag :is(.e-zeile, .e-zeit, .e-nr)'))
      .toMatch(/color: var\(--auf-petrol-leise\)/);
  });

  it('Ort, Zeit und Nummer eine Stufe leiser — auf Weiß grau', () => {
    expect(regel(planung, '.eintrag .e-zeile, .eintrag .e-zeit, .eintrag .e-nr')).toMatch(/color: var\(--text-muted\)/);
  });

  it('Monat: derselbe Einsatz, auch gewählt; Legende und Musterbaustein gleich', () => {
    const r = regel(monat, '.mo-balken');
    for (const m of VOLL) expect(r).toMatch(m);
    expect(regel(monat, '.mo-balken-gewaehlt')).toMatch(/background: var\(--petrol-tief\); color: var\(--auf-petrol\)/);
    expect(regel(monat, '.mo-legende-plan::before')).toMatch(/background: var\(--petrol\)/);
    expect(regel(readFileSync('src/styles/lot-planlinie.css', 'utf8'), '.einsatzbalken')).toMatch(/background: var\(--petrol\); color: var\(--auf-petrol\)/);
  });

  it('abwesend trägt keine eigene Fläche mehr — die Schraffur kommt aus `.schraffur`', () => {
    expect(regel(planung, '.eintrag-weg')).not.toMatch(/background/);
    expect(monat).not.toMatch(/\.mo-balken-weg \{/);
    const schraffur = regel(readFileSync('src/styles/lot-planlinie.css', 'utf8'), '.schraffur');
    expect(schraffur).toMatch(/repeating-linear-gradient\(135deg/);
  });

  it('gleich geblieben: eingeteilt, aber abwesend in Bernstein', () => {
    expect(regel(planung, '.eintrag-konflikt')).toMatch(/background: var\(--warning-bg\); color: var\(--warning\); border: 2px solid var\(--warning\)/);
    expect(monat).toMatch(/\.mo-balken-konflikt \{ background: var\(--warning-bg\); color: var\(--warning\)/);
  });
});
