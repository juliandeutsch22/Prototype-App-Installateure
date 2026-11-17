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
import { kaestchen, sofortKaestchen, tsxDateien } from './bedienregelnQuelle';

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
  }, 60_000);

  it('jede Ausnahme gibt es noch und nennt ihren Grund', () => {
    for (const [datei, grund] of Object.entries(AUSNAHMEN)) {
      expect(sofortKaestchen(datei).length, datei).toBeGreaterThan(0);
      expect(grund.length).toBeGreaterThan(20);
    }
  });

  it('kein Kästchen mit „ein“/„aus“ daneben', () => {
    const funde = tsxDateien().filter((d) => /['"]ein['"]\s*:\s*['"]aus['"]|['"]aus['"]\s*:\s*['"]ein['"]/.test(readFileSync(d, 'utf8')));
    expect(funde).toEqual([]);
  }, 60_000);

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

/*
  EIN MUSTER FÜR DIE GANZE APP (E95, 17.11.2026: „In den Einstellungen unter
  Module gibt es nun Switches statt Checkboxen. Das sollte überall einheitlich
  der Fall sein, wo es Sinn macht“). Die Regel aus E3 („Schalter nur, was
  sofort wirkt“) ließ in Formularen weiter Kästchen für dasselbe Ein/Aus
  stehen — „Aktiv“, „Darf …“, „Eilzustellung“, „Nur meine Baustellen“.

  Jetzt: JEDES EIN/AUS EINER EINSTELLUNG ODER EIGENSCHAFT IST EIN SCHALTER,
  ob es sofort wirkt oder mit „Speichern“. Das Kästchen bleibt für genau drei
  Fälle:
    Auswahl     — aus mehreren Einträgen einer Liste wählen (Personen,
                  Rechnungen, Buchungen, Wochentage, Rollen)
    Abhaken     — ein Erledigt-Zeichen je Posten
    Bestätigung — eine Erklärung, die jemand bewusst abgibt
  Jedes Kästchen der App steht hier mit seiner Art; ein neues, das nicht
  hierher gehört, macht die Prüfung rot.
*/
const KAESTCHEN: Record<string, { anzahl: number; art: 'Auswahl' | 'Abhaken' | 'Bestätigung' | 'Baustein'; grund: string }> = {
  'src/components/Field.tsx': { anzahl: 1, art: 'Baustein', grund: 'CheckboxField selbst — der Baustein für die drei Fälle' },
  'src/components/LotBausteine.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Zeile einer Liste für eine Sammelaktion markieren' },
  'src/components/PersonPicker.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Personen für einen Einsatz auswählen' },
  'src/features/angebotAnnahme/AngebotAnnahmeSeite.tsx': { anzahl: 1, art: 'Bestätigung', grund: 'der Kunde nimmt das Angebot verbindlich an' },
  'src/features/assignments/RuestlisteAbhaken.tsx': { anzahl: 1, art: 'Abhaken', grund: 'Packstück der Rüstliste als eingepackt abhaken' },
  'src/features/dashboard/start/StartseiteAnpassen.tsx': { anzahl: 2, art: 'Auswahl', grund: 'höchstens vier Kennzahlen aus der Liste wählen' },
  'src/features/invoices/InvoicesView.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Teilrechnungen wählen, die von der Schlussrechnung abgehen' },
  'src/features/invoices/KontoauszugView.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Buchungen des Kontoauszugs zum Verbuchen wählen' },
  'src/features/muster/MusterSchalter.tsx': { anzahl: 1, art: 'Baustein', grund: 'die Musterseite zeigt das Kästchen neben dem Schalter' },
  'src/features/muster/MusterV10.tsx': { anzahl: 1, art: 'Baustein', grund: 'die Musterseite zeigt das Häkchen der Auswahl' },
  'src/features/orders/Bestellvorschlaege.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Bestellvorschläge zum Übernehmen wählen' },
  'src/features/orders/LagerDialoge.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Bestellungen wählen, zu denen der Wareneingang gehört' },
  'src/features/plattform/NotzugangPasswort.tsx': { anzahl: 1, art: 'Bestätigung', grund: 'der Support bestätigt den Rückruf zur Identität' },
  'src/features/plattform/NotzugangZweiFaktor.tsx': { anzahl: 1, art: 'Bestätigung', grund: 'der Support bestätigt den Rückruf zur Identität' },
  'src/features/plattform/Rechtstexte.tsx': { anzahl: 1, art: 'Bestätigung', grund: 'der Text ist rechtlich geprüft und freigegeben' },
  'src/features/settings/ZeitfelderView.tsx': { anzahl: 2, art: 'Auswahl', grund: 'Stände und Rollen wählen, für die das Feld Pflicht ist' },
  'src/features/users/ArbeitszeitVerlaufKarte.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Arbeitstage der Woche wählen' },
  'src/features/users/UserMgmtView.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Arbeitstage der Woche wählen' },
  'src/features/vacations/BetriebsurlaubReiter.tsx': { anzahl: 1, art: 'Auswahl', grund: 'Personen wählen, die vom Betriebsurlaub ausgenommen sind' },
  'src/features/vacations/FreistellungenBestaetigen.tsx': { anzahl: 1, art: 'Abhaken', grund: 'eine Freistellung als geprüft abhaken' },
};

describe('E95 · ein Muster: Schalter für jedes Ein/Aus, Kästchen nur für Auswahl, Abhaken und Bestätigung', () => {
  it('jedes Kästchen der App gehört zu einem der drei Fälle (oder ist der Baustein selbst)', () => {
    const ist = Object.fromEntries(tsxDateien().map((d) => [d, kaestchen(d).length]).filter(([, n]) => (n as number) > 0));
    const soll = Object.fromEntries(Object.entries(KAESTCHEN).map(([d, k]) => [d, k.anzahl]));
    expect(ist).toEqual(soll);
  }, 60_000);

  it('jede Ausnahme nennt ihren Grund', () => {
    for (const [d, k] of Object.entries(KAESTCHEN)) expect(k.grund.length, d).toBeGreaterThan(20);
  });

  it('Gegenprobe: ein Ein/Aus als Kästchen in einem Formular fiele auf', () => {
    const formular = `export function X() { return <CheckboxField id="aktiv" label="Aktiv" checked={a} onChange={(e) => setA(e.target.checked)} />; }`;
    expect(kaestchen('neu.tsx', formular)).toEqual(['"aktiv"']);
    const roh = `export function X() { return <label><input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} /> Eilzustellung</label>; }`;
    expect(kaestchen('roh.tsx', roh)).toHaveLength(1);
    const schalter = `export function X() { return <Schalter id="aktiv" label="Aktiv" an={a} onChange={setA} />; }`;
    expect(kaestchen('gut.tsx', schalter)).toEqual([]);
  });
});

