/**
 * WARN- UND FEHLERTEXT NIE OHNE ZEICHEN (U5, Durchsicht 15.11.2026).
 *
 * Die Regel steht an EINER Stelle in `src/index.css`: jeder Text in Warn-
 * oder Fehlerfarbe trägt das Dreieck davor, wer ein eigenes Zeichen mitbringt,
 * behält seins. Diese Wächter halten die Lücken zu: Text in Warnfarbe über
 * einen Weg, den die Regel nicht kennt (ein anderes Element, eine eigene
 * Klasse mit `color: var(--danger)`, eine Farbe im `style`).
 *
 * Gegenprobe im Browser (Vorschau, 14 Seiten, 390 px): vor der Regel sechs
 * Texte in Warn- oder Fehlerfarbe ohne Zeichen („Kein Ansprechpartner
 * hinterlegt.“, „Zwischenstand — …“, Fristen und „Gültig bis“), danach keiner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { attribut, elemente, ort, tagName, tsxDateien } from './bedienregelnQuelle';

const INDEX = readFileSync('src/index.css', 'utf8');
const regelStart = INDEX.indexOf(":is(p, span, div, strong, small, dd, li, label):is(.text-warning, .text-danger)");
const REGEL = INDEX.slice(regelStart, INDEX.indexOf('}', regelStart));

/** Die Elemente, an denen die Regel greift — und die, die bewusst ohne bleiben. */
const ABGEDECKT = ['p', 'span', 'div', 'strong', 'small', 'dd', 'li', 'label'];
/** Ein Abzug in einer Summentabelle ist ein Betrag mit Minus, keine Meldung; Knöpfe und Verweise tragen eine Handlung. */
const BEWUSST_OHNE = ['tr', 'td', 'Button', 'Link', 'a', 'button'];

/**
 * Eigene Klassen mit Warn- oder Fehlerfarbe — je mit dem Grund, warum sie
 * ohne die Regel auskommen, oder in der Regel stehen.
 */
const EIGENE_KLASSEN: Record<string, string> = {
  '.korb-fehler': 'in der Regel',
  '.zaehl-zeile-fehler': 'in der Regel',
  '.tag-fehlt': 'in der Regel',
  '.grenz-verstoss': 'in der Regel',
  '.lage-wert-rot': 'in der Regel',
  '.lage-wert-warn': 'in der Regel',
  '.v-hinweis': 'in der Regel',
  '.mo-balken-konflikt': 'ein Knopf (Balken im Monat); der Zustand steht als Wort in seinem Namen',
  '.schein-foto-weg': 'das ✕ an einem Foto, ein Knopf, keine Meldung',
  '.mw-zelle-fehlt': 'Zelle im Monatsstreifen (44 px): das Wort „fehlt“ trägt die Bedeutung, die Legende das Zeichen',
  '.pk-tag-fehlt': 'Tag im Personenkalender: das Wort „fehlt“ trägt die Bedeutung',
  '.mengen-wahl-fehler .mengen-feld': 'die Zahl im Feld; die Meldung steht darunter mit Zeichen',
  '.mo-legende-konflikt': 'Legende: steht mit dem Konfliktzeichen des Kalenders',
  '.kal-info-achtung': 'Zeile in der Kalenderzelle: das Zeichen trägt der Tag (Planlinie)',
  '.leiste-knopf[data-ton="gefahr"]': 'ein Knopf, keine Meldung',
  '.einsatz-knopf[data-ton="gefahr"]': 'ein Knopf, keine Meldung',
  '.masslinie-achtung .masslinie-soll': 'Teil der Maßlinie, die Überschreitung zeichnet die Linie selbst',
  '.masslinie-plus': 'Zahl an der Maßlinie, die Überschreitung zeichnet die Linie selbst',
  '.hinweislinie': 'trägt ihr eigenes Zeichen (Strich mit Pfeil, Planlinie)',
  '.hinweislinie-fehl': 'trägt ihr eigenes Zeichen (Strich mit Pfeil, Planlinie)',
  '.kopf-warnung': 'trägt ein eigenes Symbol (svg)',
  '.eintrag-konflikt .e-konflikt': 'trägt ein eigenes Symbol (svg)',
  '.arbeitstag-fehler': 'trägt ein eigenes Symbol (svg)',
  '.rechnung-detail-abzug': 'ein Abzug in der Summe: Betrag mit Minus, keine Meldung',
  '.schriftfeld .lage-wert-rot': 'in der Regel (.lage-wert-rot)',
  '.schriftfeld .lage-wert-warn': 'in der Regel (.lage-wert-warn)',
};

function textFarbRegeln(): string[] {
  const dateien = ['src/index.css', ...readdirSync('src/styles').map((d) => join('src/styles', d))];
  return dateien.flatMap((d) => readFileSync(d, 'utf8').split('\n')
    .filter((z) => /(^|[;{\s])color: var\(--(danger|warning|fehler|achtung)\)/.test(z) && !/^\s*(\*|\/\*)/.test(z))
    .map((z) => z.trim().split('{')[0].trim()))
    .filter((sel) => sel && !sel.startsWith('.hinweiszeile-') && !sel.startsWith('--'));
}

describe('U5 · Warn- und Fehlertext nie ohne Zeichen', () => {
  it('die Regel steht in index.css: Warn- und Fehlerfarbe bekommen das Dreieck, ein eigenes Zeichen geht vor', () => {
    expect(regelStart).toBeGreaterThan(0);
    expect(REGEL).toContain(':not(:has(svg))');
    expect(REGEL).toContain("::before");
    expect(INDEX).toMatch(/mask: var\(--zeichen-warnung\)/);
    expect(INDEX).toMatch(/--zeichen-warnung: url\("data:image\/svg\+xml,[^"]*M12 4 2\.5 20h19L12 4Z/);
  });

  it('Tailwind-Warnfarbe nur an Elementen, die die Regel kennt (oder bewusst ohne)', () => {
    const funde = tsxDateien().flatMap((d) => elemente(d).filter((e) => {
      const k = attribut(e, 'className');
      if (!k || k === true || !/\btext-(danger|warning)\b/.test(k.getText())) return false;
      const t = tagName(e);
      return !ABGEDECKT.includes(t) && !BEWUSST_OHNE.includes(t);
    }).map((e) => `${ort(e)}: <${tagName(e)}>`));
    expect(funde).toEqual([]);
  }, 60_000);

  it('jede eigene Klasse mit Warn- oder Fehlerfarbe steht in der Regel oder nennt ihren Grund', () => {
    const offen = textFarbRegeln().filter((sel) => !EIGENE_KLASSEN[sel]);
    expect(offen).toEqual([]);
    for (const [sel, grund] of Object.entries(EIGENE_KLASSEN)) {
      if (grund.startsWith('in der Regel (')) continue;
      if (grund === 'in der Regel') expect(INDEX, sel).toContain(sel.split(' ').pop()!);
    }
  });

  it('keine Warn- oder Fehlerfarbe im style-Attribut — dort sähe die Regel sie nicht', () => {
    const funde = tsxDateien().filter((d) => /style=\{\{[^}]*color:\s*['"`]var\(--(danger|warning)\)/.test(readFileSync(d, 'utf8')));
    expect(funde).toEqual([]);
  }, 60_000);

  it('Gegenprobe: ein Warntext in <em> und eine neue Klasse mit Fehlerfarbe fielen auf', () => {
    const em = elemente('alt.tsx', `export const X = () => <em className="text-warning">Kein Ansprechpartner hinterlegt.</em>;`)
      .filter((e) => !ABGEDECKT.includes(tagName(e)) && !BEWUSST_OHNE.includes(tagName(e)));
    expect(em).toHaveLength(1);
    expect(EIGENE_KLASSEN['.neue-meldung']).toBeUndefined();
  });
});
