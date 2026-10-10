import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * EINE ZAHLENEINGABE FÜR ALLE BETRÄGE UND MENGEN (Testbericht 30.09.2026, M15).
 *
 * „7.500,50“ ergab im Angebot kommentarlos 0,00 €. Behoben ist das zentral in
 * `src/lib/zahl.ts` und `src/components/ZahlFeld.tsx` — und es kommt zurück,
 * sobald eine Maske wieder selbst liest. Deshalb prüft dieser Test die
 * Quelle als Ganzes:
 *
 *  1. Niemand ausser `lib/zahl.ts` ersetzt Kommas durch Punkte.
 *  2. Ein Zahlenfeld des Browsers (`type="number"`) bleibt nur, wo ganze
 *     Zahlen ohne Tausender stehen: Tage, Wochen, Minuten, Prozentstufen und
 *     die Stunden (1–24) eines Notzugangs. Beträge, Mengen, Stunden mit
 *     Nachkommastellen und Urlaubstage laufen über `ZahlFeld`.
 */

const SRC = join(__dirname, '../../src');

function dateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis).flatMap((name) => {
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad);
    return /\.(ts|tsx)$/.test(name) ? [pfad] : [];
  });
}

const QUELLEN = dateien(SRC).map((pfad) => ({
  pfad: relative(SRC, pfad).replace(/\\/g, '/'),
  text: readFileSync(pfad, 'utf8'),
}));

/** Was in einem ganzzahligen Browserfeld stehen darf — an der Beschriftung erkannt. */
const GANZZAHLIG = /\((Tage|Wochen|Min\.|Minuten[^)]*|%|1–24)\)|\s%$/;

/** Das JSX-Element um eine Fundstelle: vom letzten `<` davor bis zum nächsten `/>`. */
function elementUm(text: string, stelle: number): string {
  const anfang = text.lastIndexOf('<', stelle);
  const ende = text.indexOf('/>', stelle);
  return text.slice(anfang, ende === -1 ? undefined : ende);
}

function beschriftung(element: string): string | null {
  const m = element.match(/(?:label|aria-label)=(?:"([^"]*)"|\{`([^`]*)`\})/);
  return m ? (m[1] ?? m[2]) : null;
}

describe('Zahleneingabe (M15)', () => {
  it('kein Komma-zu-Punkt außerhalb von lib/zahl.ts', () => {
    const funde = QUELLEN.filter(
      (q) => q.pfad !== 'lib/zahl.ts' && /replace\(\s*(?:','|\/,\/g?)\s*,\s*'\.'\s*\)/.test(q.text),
    ).map((q) => q.pfad);
    expect(funde).toEqual([]);
  });

  it('Browser-Zahlenfelder nur für ganze Tage, Minuten, Prozentstufen', () => {
    const funde: string[] = [];
    for (const q of QUELLEN) {
      if (q.pfad === 'components/ZahlFeld.tsx') continue;
      for (const m of q.text.matchAll(/type="number"/g)) {
        const label = beschriftung(elementUm(q.text, m.index ?? 0));
        if (!label || !GANZZAHLIG.test(label)) funde.push(`${q.pfad}: ${label ?? '(ohne Beschriftung)'}`);
      }
    }
    expect(funde).toEqual([]);
  });

  it('Gegenprobe: die Prüfung erkennt ein Betragsfeld als Browser-Zahlenfeld', () => {
    const quelle = '<InputField id="x" label="Verkaufspreis netto (€)" type="number" step="0.01" />';
    const label = beschriftung(elementUm(quelle, quelle.indexOf('type="number"')));
    expect(label).toBe('Verkaufspreis netto (€)');
    expect(GANZZAHLIG.test(label!)).toBe(false);
    expect(GANZZAHLIG.test('Zahlungsziel (Tage)')).toBe(true);
    expect(GANZZAHLIG.test('Nachtzuschlag %')).toBe(true);
    // Der Durchrechnungszeitraum (17–52 ganze Wochen) — ein Betrag in Wochen gibt es nicht.
    expect(GANZZAHLIG.test('Durchrechnung für den Schnitt von 48 Std. (Wochen)')).toBe(true);
    expect(GANZZAHLIG.test('Stunden je Woche')).toBe(false);
  });
});
