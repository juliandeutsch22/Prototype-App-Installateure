import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import ts from 'typescript';

/**
 * Testbericht 30.09.2026, G1 — eine Schreibweise für alles Sichtbare:
 * durchgehend ß („heißt“, nicht „heisst“) und deutsche Anführungszeichen
 * „…“ — nicht „…".
 *
 * NACH DEM MUSTER DER EUROZEICHEN-PRÜFUNG: gelesen wird der Quelltext, aber
 * nur, was ein Mensch zu sehen bekommt — Zeichenketten, Textbausteine und
 * Text in JSX. Kommentare bleiben aussen vor; dort darf stehen, was will.
 * Ein einzelnes kleingeschriebenes Wort gilt nicht als Text: es ist ein
 * Schlüssel (`'strasse'` als Spaltenname im Import), keine Beschriftung.
 *
 * Die Meldungen der Datenbank sind noch nicht umgestellt; sie stehen in den
 * Migrationen und kommen mit ihren Funktionen, wenn diese ohnehin neu
 * geschrieben werden.
 */

const SCHWEIZER = [
  'abschliessen', 'Abschliessen', 'anschliessen', 'ausschliessen', 'Schliessen', 'schliessen', 'schliesst',
  'ausschliesslich', 'gross', 'Gross', 'grosse', 'grossen', 'grosser', 'Grösse', 'Grössen', 'grösser',
  'grössere', 'grösseren', 'grösste', 'Grossbuchstaben', 'Grosshändler', 'Grosshändlern', 'Grosshändlers',
  'Grosshandel', 'ausser', 'Ausser', 'ausserdem', 'ausserhalb', 'heisst', 'heissen', 'hiess', 'liess',
  'regelmässig', 'gemäss', 'mässig', 'weiss', 'bloss', 'Strasse', 'Fusszeile', 'angestossen', 'draussen',
  'aussen', 'Massnahme', 'schliesslich', 'fliessend', 'Fliesstext',
];
const WORT = new RegExp(`(?<![A-Za-zÄÖÜäöüß])(${SCHWEIZER.join('|')})(?![A-Za-zÄÖÜäöüß])`);
const ANFUEHRUNG = /„[^"„“\n$\\]{1,120}"/;

function dateien(): string[] {
  return execSync('git ls-files "src/*.ts" "src/*.tsx" "shared/*.ts"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function sichtbareTexte(pfad: string): string[] {
  const quelle = readFileSync(pfad, 'utf8');
  const sf = ts.createSourceFile(pfad, quelle, ts.ScriptTarget.Latest, true,
    pfad.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const texte: string[] = [];
  const besuche = (n: ts.Node) => {
    if (ts.isJsxText(n)) texte.push(n.text);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
      || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const t = n.text;
      if (/\s/.test(t) || /^[A-ZÄÖÜ][a-zäöüß]+$/.test(t)) texte.push(t);
    }
    ts.forEachChild(n, besuche);
  };
  besuche(sf);
  return texte;
}

describe('Schreibweise im Sichtbaren', () => {
  const alle = dateien();

  it('die Prüfung hat etwas zu prüfen', () => {
    const mitSz = alle.filter((p) => sichtbareTexte(p).some((t) => /ß/.test(t)));
    expect(mitSz.length).toBeGreaterThanOrEqual(10);
  });

  it('kein „ss“, wo „ß“ hingehört', () => {
    const funde = alle.flatMap((p) =>
      sichtbareTexte(p).filter((t) => WORT.test(t)).map((t) => `${p}: ${t.trim().slice(0, 60)}`));
    expect(funde).toEqual([]);
  });

  it('Anführungszeichen unten und oben — „…“, nicht „…"', () => {
    const funde = alle.flatMap((p) =>
      sichtbareTexte(p).filter((t) => ANFUEHRUNG.test(t)).map((t) => `${p}: ${t.trim().slice(0, 60)}`));
    expect(funde).toEqual([]);
  });

  it('Gegenprobe: die Prüfung erkennt, was sie finden soll', () => {
    expect(WORT.test('Das heisst: bitte schliessen')).toBe(true);
    expect(WORT.test('Das heißt: bitte Anschluss prüfen')).toBe(false);
    expect(ANFUEHRUNG.test('auf „Anfordern" tippen')).toBe(true);
    expect(ANFUEHRUNG.test('auf „Zur Anforderung“ tippen')).toBe(false);
  });
});
