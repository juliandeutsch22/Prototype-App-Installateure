/**
 * SCHALTER FÜR ALLES, WAS SOFORT WIRKT (U6, Entscheidung E3, 15.11.2026).
 *
 * Das Kästchen bleibt für die Auswahl in einem Formular, das erst mit
 * „Speichern“ gilt. Was beim Tippen schon gespeichert wird — Module,
 * Meldungen, eine Pflicht für den Betrieb, ein Filter der Ansicht —, ist ein
 * Schalter (`src/components/Schalter.tsx`): `role="switch"`, `aria-checked`,
 * Leertaste und Enter. Vorher standen beide als Kästchen da, bei den Modulen
 * mit „ein“/„aus“ daneben.
 *
 * Der Wächter findet ein Kästchen, dessen Änderung sofort schreibt: im
 * `onChange` steht ein `await`, ein `void …(…)` oder der Aufruf einer
 * `async`-Funktion derselben Datei.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sofortKaestchen, tsxDateien } from './bedienregelnQuelle';

/**
 * Begründete Ausnahmen — je Datei, mit Grund. Abhaken ist ein Erledigt-Zeichen
 * je Posten einer Liste, kein Ein/Aus einer Einstellung; ein Schalter je
 * Packstück läse sich wie eine Einstellung.
 */
const AUSNAHMEN: Record<string, string> = {
  'src/features/assignments/RuestlisteAbhaken.tsx': 'Abhaken einer Rüstliste: Erledigt-Zeichen je Posten, kein Ein/Aus',
};

describe('U6 · Schalter statt Kästchen für alles, was sofort wirkt', () => {
  it('kein Kästchen speichert beim Tippen (außer begründet)', () => {
    const funde = tsxDateien().filter((d) => !AUSNAHMEN[d]).flatMap((d) => sofortKaestchen(d));
    expect(funde).toEqual([]);
  });

  it('jede Ausnahme gibt es noch und nennt ihren Grund', () => {
    for (const [datei, grund] of Object.entries(AUSNAHMEN)) {
      expect(sofortKaestchen(datei).length, datei).toBeGreaterThan(0);
      expect(grund.length).toBeGreaterThan(20);
    }
  });

  it('kein Kästchen mit „ein“/„aus“ daneben', () => {
    const funde = tsxDateien().filter((d) => /['"]ein['"]\s*:\s*['"]aus['"]|['"]aus['"]\s*:\s*['"]ein['"]/.test(readFileSync(d, 'utf8')));
    expect(funde).toEqual([]);
  });

  it('der Schalter ist zugänglich: role="switch", aria-checked, ein echter Knopf (Leertaste, Enter)', () => {
    const quelle = readFileSync('src/components/Schalter.tsx', 'utf8');
    expect(quelle).toContain('role="switch"');
    expect(quelle).toContain('aria-checked={an}');
    expect(quelle).toMatch(/<button\s/);
    expect(quelle).toContain('type="button"');
  });

  it('Gegenprobe: das alte Kästchen der Meldungen und das der Module fielen auf', () => {
    const meldungen = `export function X() {
      async function speichern(a: object) { await savePrefs(a); }
      return <CheckboxField id="n" label="Neue Nachrichten" checked={an} onChange={(e) => void speichern({ n: e.target.checked })} />;
    }`;
    expect(sofortKaestchen('alt.tsx', meldungen)).toHaveLength(1);
    const formular = `export function X() { return <CheckboxField id="n" label="Halbe Tage" checked={an} onChange={(e) => setAn(e.target.checked)} />; }`;
    expect(sofortKaestchen('neu.tsx', formular)).toEqual([]);
    expect(/['"]ein['"]\s*:\s*['"]aus['"]/.test(`{an ? 'ein' : 'aus'}`)).toBe(true);
  });
});
