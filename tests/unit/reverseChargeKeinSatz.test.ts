import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * KEIN STEUERSATZ DARF „REVERSE CHARGE" VERSPRECHEN.
 *
 * WARUM DAS EIN EIGENER TEST IST. Im USt-Auswahlfeld stand
 * „0 % (Reverse Charge)". Die Auswahl setzte nur den Satz auf null — weder der
 * Pflichthinweis nach § 11 Abs 1a UStG noch die UID des Empfängers kamen auf
 * den Beleg. Die Rechnung sah aus wie Reverse Charge und war keine. Als
 * VORGABE des Betriebs hätte sie für jede Rechnung gegolten, auch die an
 * Privatkunden.
 *
 * DER BEFUND, DER DIESEN TEST AUSGELÖST HAT: die Zeile stand ZWEIMAL da —
 * einmal in `SettingsView`, einmal in einer zweiten Fassung desselben
 * Formulars in `InvoicesView`. Beim Beheben ist mir die zweite durchgegangen;
 * aufgefallen ist es erst beim Durchsuchen des ausgelieferten Bundles.
 *
 * Genau dagegen hilft kein Ansichtstest, sondern dieser Abgleich: er sieht
 * ALLE Dateien an, nicht die, an die jemand gerade denkt. Dasselbe Muster wie
 * beim Abgleich Navigation ↔ Routen und beim Exportumfang.
 *
 * Der Übergang der Steuerschuld hängt an der einzelnen Leistung, nicht am
 * Betrieb. Er wird je Rechnung angehakt — mit UID des Empfängers, sonst lässt
 * sich die Rechnung nicht anlegen.
 */

function alleQuellen(ordner: string): string[] {
  const raus: string[] = [];
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) raus.push(...alleQuellen(pfad));
    else if (/\.tsx?$/.test(eintrag)) raus.push(pfad);
  }
  return raus;
}

describe('Der Steuersatz verspricht keinen Übergang der Steuerschuld', () => {
  it('in keiner einzigen Datei', () => {
    const treffer: string[] = [];
    for (const datei of alleQuellen('src')) {
      const inhalt = readFileSync(datei, 'utf8');
      for (const zeile of inhalt.split('\n')) {
        // Nur ANGEBOTENE Werte, keine Kommentare: der Kommentar, der diesen
        // Fehler erklärt, darf den Namen nennen.
        if (/<option[^>]*>[^<]*Reverse Charge/i.test(zeile)) {
          treffer.push(`${datei}: ${zeile.trim()}`);
        }
      }
    }
    expect(
      treffer,
      'Ein Steuersatz namens „Reverse Charge" setzt nur die Zahl auf null — ' +
        'ohne Pflichthinweis und ohne UID des Empfängers ist die Rechnung ungültig. ' +
        'Der Übergang gehört als Haken an die einzelne Rechnung.',
    ).toEqual([]);
  });
});
