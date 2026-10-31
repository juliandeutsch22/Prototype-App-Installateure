import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  JEDE SEITE BEGINNT GLEICH (E31, Rückmeldung 31.10.2026: „Einheitlicher
  Beginn aller Seiten und Untertabs“). Gemessen über 46 Ansichten der
  Geschäftsführung und 15 des Monteurs in 390, 834 und 1440 px lag der
  erste Inhalt 20 bis 71 px unter dem Kopf bzw. unter den Reitern. Die
  Messung selbst braucht einen Browser; hier steht fest, welche Regeln den
  Takt halten, damit keine spätere Änderung ihn still wieder öffnet.
*/
const INDEX = readFileSync('src/index.css', 'utf8');
const AKTEN = readFileSync('src/styles/lot-akten.css', 'utf8');
const PLANUNG = readFileSync('src/styles/lot-planung.css', 'utf8');
const START = readFileSync('src/styles/lot-start.css', 'utf8');

describe('Abstand unter dem Seitenkopf', () => {
  it('12 px, ab 1200 px 20 px — gleich, ob die Seite mit 12/20 oder 24 px gestapelt ist', () => {
    expect(INDEX).toContain(".inhalt [class*='space-y-'] > .plankopf + :not([hidden]) { margin-top: 0.75rem; }");
    expect(INDEX).toContain("@media (min-width: 1200px) { .inhalt [class*='space-y-'] > .plankopf + :not([hidden]) { margin-top: 1.25rem; } }");
  });

  it('Seiten mit eigenem Abstand halten denselben Takt', () => {
    expect(AKTEN).toContain('.akten-seite { display: flex; flex-direction: column; gap: 0.75rem; }');
    expect(AKTEN).toContain('@media (min-width: 1200px) { .akten-seite { gap: 1.25rem; } }');
    expect(PLANUNG).toContain('.einsatzplanung { display: flex; flex-direction: column; gap: 0.75rem; }');
    expect(START).toContain('.start-kopf { padding-bottom: 0; }');
  });

  it('eine Karte direkt unter dem Kopf oder unter Reitern bringt kein eigenes Polster mit', () => {
    expect(INDEX).toMatch(/\.plankopf \+ \.karte,[\s\S]*?\) \{ padding-top: 0; \}/);
    expect(INDEX).toMatch(/:is\(\.reiterleiste, \.segment, \.anf-leiste\) \+ \.karte,[\s\S]*?\) \{ padding-top: 0; \}/);
  });

  it('Verweise im Kartenkopf machen ihn nicht höher, die Tastfläche bleibt', () => {
    expect(INDEX).toContain('.karte-kopf > div > a { min-height: 0; padding-block: 0.875rem; margin-block: -0.875rem; }');
  });
});

describe('Die Kontextspalte der Akten in einer Schrift (Rückmeldung 31.10.2026)', () => {
  it('Anschrift, Notiz und Angaben stehen gleich groß', () => {
    expect(AKTEN).toContain('.akten-kontext :is(.akten-angaben dd, .karte-koerper > p, .akten-notiz) { font-size: 0.8125rem; line-height: 1.25rem; }');
  });

  it('Links tragen ihre Tastfläche ohne die Zeile höher zu machen', () => {
    expect(AKTEN).toContain('.akten-kontext :is(.link-kontakt, .akten-verweis) { min-height: 0; padding-block: 0.75rem; margin-block: -0.75rem; }');
  });

  it('jeder Abschnitt hat denselben Abstand zur Überschrift', () => {
    expect(AKTEN).toContain('.akten-kontext .karte-kopf { min-height: 0; padding: 1.25rem 0 0.5rem; }');
    expect(AKTEN).toContain('.akten-kontext .karte-koerper { padding: 0; }');
  });
});
