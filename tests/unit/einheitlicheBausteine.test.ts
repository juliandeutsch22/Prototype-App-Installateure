import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
  EIN BAUSTEIN, ÜBERALL GLEICH (E72, 09.11.2026). Der Auftraggeber: Knöpfe
  „sehen aus wie schlecht platzierter Text … wichtig ist, dass diese global
  einheitlich überarbeitet werden“, und „die Abstände sind nicht einheitlich“.
  Hier stehen die zentralen Regeln, die jede Stelle der App erben — geprüft
  am Stil und am Quelltext, damit keine Einzelstelle sie wieder unterläuft.
*/
const stil = (datei: string) => readFileSync(join('src/styles', datei), 'utf8');
const INDEX = readFileSync('src/index.css', 'utf8');
const LOT = stil('lot.css');
const AKTEN = stil('lot-akten.css');
const BLATT = stil('lot-blatt.css');
const PLATTFORM = stil('lot-plattform.css');

/** Die Zeile mit der Regel für genau diesen Selektor. */
function regel(quelle: string, selektor: string): string {
  const zeile = quelle.split('\n').find((z) => z.trim().startsWith(`${selektor} {`));
  expect(zeile, `Regel für ${selektor}`).toBeDefined();
  return zeile!;
}

function tsxDateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) return tsxDateien(pfad);
    return pfad.endsWith('.tsx') ? [pfad] : [];
  });
}

describe('Handlungen sehen aus wie Knöpfe', () => {
  it('„Schließen“ im Fenster ist ein gerahmter Zweitknopf, kein unterstrichenes Wort', () => {
    const r = regel(LOT, '.fenster-schliessen');
    expect(r).toContain('border: 1px solid var(--border-strong)');
    expect(r).toContain('padding: 0 0.875rem');
    expect(r).not.toContain('text-decoration: underline');
  });

  it('die Sammelleiste ist ein Blatt mit Haupt- und Zweitknopf, ohne feste Farben', () => {
    const leiste = regel(LOT, '.sammelleiste');
    expect(leiste).toContain('border: 1px solid var(--border-strong)');
    expect(leiste).toContain('background: var(--surface)');
    expect(leiste).not.toMatch(/#[0-9a-f]{3,6}|border-radius/i);
    expect(regel(LOT, '.sammel-knopf')).toContain('background: var(--brand)');
    const text = regel(LOT, '.sammel-text');
    expect(text).toContain('border: 1px solid var(--border-strong)');
    expect(text).not.toContain('text-decoration: underline');
  });

  it('der nächste Schritt in einer Arbeitszeile ist ein Zweitknopf, keine eigene Petrol-Gestalt', () => {
    const r = regel(LOT, '.arbeitszeile-schritt');
    expect(r).toContain('border: 1px solid var(--border-strong)');
    expect(r).toContain('color: var(--text)');
    expect(r).not.toContain('var(--petrol)');
  });

  it('die Knöpfe der Plattform behalten ihr Polster', () => {
    expect(PLATTFORM).not.toMatch(/button \{[^}]*padding-inline: 0/);
  });
});

describe('Aufklapper haben eine Gestalt', () => {
  // Die Kurzzeile der Akten (`kurz-kopf`) ist eine Zeile mit Name, Wert und eigenem „›“ — kein Aufklapper-Kopf.
  it('jedes <summary> trägt den einheitlichen Kopf mit Pfeil', () => {
    const ohne = tsxDateien('src').flatMap((pfad) =>
      [...readFileSync(pfad, 'utf8').matchAll(/<summary(?![^>]*(weiteres-kopf|kurz-kopf))[^>]*>/g)].map((m) => `${pfad}: ${m[0]}`));
    expect(ohne).toEqual([]);
  });

  it('der Pfeil dreht sich an jedem offenen Aufklapper, nicht nur an `.weiteres`', () => {
    expect(LOT).toContain("details[open] > .weiteres-kopf::after, .weiteres-knopf[aria-expanded='true']::after {");
  });
});

describe('Abstände im Takt', () => {
  it('der Formularfuß am Handy: feste Anteile 2 : 3 — gleiche Breite in jedem Zustand, Luft um „Abbrechen“', () => {
    const r = regel(INDEX, '.aktionsleiste-knoepfe');
    expect(r).toContain('grid-template-columns: minmax(0, 2fr) minmax(0, 3fr)');
    // Eine Spalte nach Inhalt ließ den Speichern-Knopf zwischen „Verwerfen“ und Platzhalter springen.
    expect(r).not.toContain('auto');
  });

  it('das Suchfenster hält am Handy 16 px Rand, die Nummer daneben bricht nicht', () => {
    expect(regel(LOT, '.suchfenster')).toContain('left: 1rem; right: 1rem;');
    expect(regel(LOT, '.such-nebeninfo')).toContain('white-space: nowrap');
  });

  it('die Gruppenköpfe im Mehr-Blatt wie in der Seitenleiste: Versalien, gesperrt, mit Linie', () => {
    const r = regel(LOT, '.mehr-gruppe');
    expect(r).toContain('text-transform: uppercase');
    expect(r).toContain('letter-spacing: 0.14em');
    expect(LOT).toContain(".mehr-gruppe::after { content: ''; flex: 1; height: 1px; background: var(--border); }");
  });

  it('der Untertext einer Blattzeile ohne Zusatzabstand — zwei Textzeilen ergeben genau 72 px', () => {
    expect(BLATT).toMatch(/\.zeile-meta \{ line-height: 1\.5rem; margin-top: 0; \}/);
  });

  it('Zeilen in Fenstern stehen auf der Flucht des Fensters', () => {
    expect(INDEX).toContain(':is(.fenster-inhalt, .blatt-inhalt) .zeile { padding-inline: 0; }');
  });

  it('Blätter einer Akte liegen eine Zelle auseinander (24 px, nicht 32 → 48)', () => {
    expect(regel(AKTEN, '.akten-spalte')).toContain('gap: 1.5rem');
  });

  it('Felder einer Bearbeiten-Gruppe stoßen nicht aneinander', () => {
    const r = regel(AKTEN, '.akten-editor-gruppe');
    expect(r).toContain('display: grid');
    expect(r).toContain('gap: 1rem');
  });

  it('der Formularfuß im Blatt reicht von Kante zu Kante und steht auf der 24-px-Flucht', () => {
    expect(BLATT).toMatch(/> \.karte-koerper \.aktionsleiste \{ margin: 1\.5rem -24px -24px; padding: 12px 24px; \}/);
  });
});
