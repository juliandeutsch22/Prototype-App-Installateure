import { describe, it, expect } from 'vitest';
import { SCHEIN_ROLLEN, canWriteWorkSheet } from '@/lib/permissions';
import type { Role } from '@/types';

/**
 * Wer einen Handwerksschein schreiben darf.
 *
 * WARUM DAS EINE EIGENE PRÜFUNG IST. Die Rollen standen ausgeschrieben in
 * der Route; die LISTE der Scheine sieht aber auch die Buchhaltung und die
 * Verwaltung. Als dort ein Knopf „Weiterbearbeiten" dazukam, gab es zwei
 * Stellen, die dieselbe Frage beantworten — und zwei Aufzählungen laufen
 * früher oder später auseinander. Dann führt ein sichtbarer Knopf auf eine
 * Seite mit „Kein Zugriff", und niemand weiß, welche der beiden Stellen
 * recht hat.
 *
 * Jetzt gibt es eine Liste und eine Frage darauf. Hier steht, was sie
 * beantwortet.
 */

const ALLE: Role[] = [
  'Mitarbeiter',
  'Projektleiter',
  'Buchhaltung',
  'Verwaltung',
  'Geschäftsführung',
  'Administrator',
];

describe('Schein schreiben', () => {
  it('erlaubt es, wer rausfährt oder die Baustelle verantwortet', () => {
    expect(canWriteWorkSheet('Mitarbeiter')).toBe(true);
    expect(canWriteWorkSheet('Projektleiter')).toBe(true);
    expect(canWriteWorkSheet('Geschäftsführung')).toBe(true);
    expect(canWriteWorkSheet('Administrator')).toBe(true);
  });

  it('verweigert es Buchhaltung und Verwaltung — sie sehen die Liste trotzdem', () => {
    /*
      GENAU DIESE BEIDEN sind der Grund für die Prüfung. Sie stehen im
      Reiter „Handwerksscheine" und sähen den Knopf; die Route dahinter
      lässt sie nicht durch.
    */
    expect(canWriteWorkSheet('Buchhaltung')).toBe(false);
    expect(canWriteWorkSheet('Verwaltung')).toBe(false);
  });

  it('beantwortet die Frage AUS der Liste, die auch die Route benutzt', () => {
    /*
      Der Kern: die Prüfung darf keine zweite, eigene Aufzählung sein. Wäre
      sie es, könnte sie hier grün sein und trotzdem von der Route abweichen
      — der Fehler, den es zu verhindern gilt, bliebe unbemerkt.
    */
    for (const rolle of ALLE) {
      expect(canWriteWorkSheet(rolle)).toBe(SCHEIN_ROLLEN.includes(rolle));
    }
  });
});
