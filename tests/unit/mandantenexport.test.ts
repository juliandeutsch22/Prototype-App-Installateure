import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Der Export-Abgleich: nimmt die Datenausleitung wirklich ALLES mit?
 *
 * WARUM DAS EIN EIGENER TEST SEIN MUSS. `exportCompanyData` führte neun von
 * sechzehn Sammlungen. Es fehlten Kunden, Angebote, Handwerksscheine,
 * Urlaubsanträge und die Nummernkreise — und das Fehlen war an nichts zu
 * merken: die Function lief durch, gab eine wohlgeformte Datei zurück und
 * meldete keinen Fehler. Ein Export, der schweigend die Hälfte auslässt, ist
 * schlimmer als keiner, weil man sich auf ihn verlässt.
 *
 * Der Test läuft rein statisch gegen die beiden Listen, die dasselbe
 * behaupten müssen: die Sammlungen in `firestore.rules` — das ist die
 * vollständige Aufzählung dessen, was der Betrieb überhaupt speichert — und
 * `EXPORTABLE` in der Function.
 *
 * Wer eine Sammlung ergänzt und den Export vergisst, bekommt hier einen
 * Fehlschlag mit ihrem Namen. Wer sie bewusst auslässt, trägt sie unten mit
 * Begründung ein — und muss sich damit entscheiden, statt es zu übersehen.
 */

const REGELN = join(__dirname, '../../firestore.rules');
const EXPORT = join(__dirname, '../../functions/src/mandantendaten.ts');

/** Sammlungen, die bewusst NICHT über das companyId-Feld exportiert werden. */
const AUSNAHMEN: Record<string, string> = {
  // Ein einzelnes Dokument, adressiert über die Mandanten-ID statt über ein
  // Feld. Die Function holt es getrennt — deshalb steht es nicht in EXPORTABLE.
  companies: 'wird über die Dokument-ID geholt, nicht über ein Feld',
};

function sammlungenAusRegeln(): string[] {
  const text = readFileSync(REGELN, 'utf8');
  const muster = /match \/([A-Za-z][A-Za-z0-9_]*)\/\{/g;
  const raus = new Set<string>();
  let treffer: RegExpExecArray | null;
  while ((treffer = muster.exec(text))) {
    // `match /databases/{database}` ist der Rahmen, keine Sammlung.
    if (treffer[1] !== 'databases') raus.add(treffer[1]);
  }
  return [...raus].sort();
}

function exportierteSammlungen(): string[] {
  const text = readFileSync(EXPORT, 'utf8');
  const block = /export const EXPORTABLE = \[([\s\S]*?)\] as const;/.exec(text);
  if (!block) throw new Error('EXPORTABLE nicht gefunden — hat die Function ihre Form geändert?');
  return [...block[1].matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)].map((m) => m[1]).sort();
}

describe('Mandantenexport deckt den ganzen Betrieb ab', () => {
  const ausRegeln = sammlungenAusRegeln();
  const exportiert = exportierteSammlungen();

  it('findet die Sammlungen überhaupt', () => {
    // Schutz gegen einen stillschweigend wirkungslosen Test: greift eines der
    // Muster nicht mehr, prüfte er nichts und bliebe trotzdem grün.
    expect(ausRegeln.length).toBeGreaterThan(10);
    expect(exportiert.length).toBeGreaterThan(10);
  });

  it.each(sammlungenAusRegeln().map((n) => [n] as const))('%s ist im Export', (name) => {
    if (AUSNAHMEN[name]) {
      expect(AUSNAHMEN[name]).toBeTruthy();
      return;
    }
    expect(
      exportiert.includes(name),
      `Die Sammlung '${name}' steht in firestore.rules, aber nicht in EXPORTABLE.\n` +
        `Ein Export ohne sie sieht vollständig aus und ist es nicht. Entweder in\n` +
        `functions/src/export.ts ergänzen oder hier mit Begründung ausnehmen.`,
    ).toBe(true);
  });

  it('exportiert nichts, was es gar nicht gibt', () => {
    // Eine Sammlung, die aus den Regeln verschwunden ist, bliebe sonst für
    // immer in der Liste stehen und läse bei jedem Export ins Leere.
    const unbekannt = exportiert.filter((n) => !ausRegeln.includes(n));
    expect(unbekannt).toEqual([]);
  });

  it('nimmt die Push-Tokens ausdrücklich heraus', () => {
    // Kanäle auf fremde Geräte gehören nicht in eine herunterladbare Datei.
    // Steht das nicht mehr da, ist es eine Entscheidung und kein Versehen.
    const text = readFileSync(EXPORT, 'utf8');
    expect(text).toContain("userPrefs: ['pushTokens']");
  });
});
