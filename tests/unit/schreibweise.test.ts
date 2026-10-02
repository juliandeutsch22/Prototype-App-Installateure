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
  'hiesse', 'hiessen', 'liesse', 'liessen', 'weisse', 'weissen', 'weisser', 'einschliesslich',
  'Fuss', 'Fussnote', 'Fussleiste', 'dreissig', 'Bildschirmgrössen', 'Mindestmass', 'Grosshandelskatalog',
];
const WORT = new RegExp(`(?<![A-Za-zÄÖÜäöüß])(${SCHWEIZER.join('|')})(?![A-Za-zÄÖÜäöüß])`);
const ANFUEHRUNG = /„[^"„“\n$\\]{1,120}"/;

function dateien(): string[] {
  return execSync('git ls-files "src/*.ts" "src/*.tsx" "shared/*.ts"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

/**
 * Das Handbuch gehört zum Sichtbaren (Entscheidung G1 vom 30.09.2026): der
 * Betrieb liest es, und es wird als Seite veröffentlicht. Geprüft wird der
 * Text zwischen den Tags — Stil, Code und Attribute bleiben außen vor, weil
 * dort Klassennamen und Bezeichner stehen.
 */
const HANDBUCH = 'docs/handbuch/handbuch.html';
function handbuchText(html: string): string[] {
  return html
    .replace(/<(style|script|code|pre)\b[\s\S]*?<\/\1>/g, ' ')
    .split(/<[^>]+>/)
    .map((t) => t.trim())
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

  it('das Handbuch hält dieselbe Schreibweise', () => {
    const texte = handbuchText(readFileSync(HANDBUCH, 'utf8'));
    expect(texte.some((t) => /ß/.test(t))).toBe(true);
    const funde = texte.filter((t) => WORT.test(t) || ANFUEHRUNG.test(t)).map((t) => t.slice(0, 60));
    expect(funde).toEqual([]);
  });

  it('Gegenprobe Handbuch: Text wird gefunden, Klassen und Code nicht', () => {
    const probe = '<style>.fuss{}</style><p class="draussen">Das heisst „Ja"</p><code>ausser</code>';
    expect(handbuchText(probe)).toEqual(['Das heisst „Ja"']);
    expect(handbuchText(probe).some((t) => WORT.test(t) && ANFUEHRUNG.test(t))).toBe(true);
  });

  it('Gegenprobe: die Prüfung erkennt, was sie finden soll', () => {
    expect(WORT.test('Das heisst: bitte schliessen')).toBe(true);
    expect(WORT.test('Das heißt: bitte Anschluss prüfen')).toBe(false);
    expect(ANFUEHRUNG.test('auf „Anfordern" tippen')).toBe(true);
    expect(ANFUEHRUNG.test('auf „Zur Anforderung“ tippen')).toBe(false);
  });
});
