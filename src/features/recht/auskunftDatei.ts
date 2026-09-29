import { isTopLevel } from '@/lib/permissions';
import type { Role } from '@/types';

/**
 * Wer die Datenauskunft holt: die Geschäftsführung, nicht im Supporteinblick.
 * Dieselbe Grenze zieht die Datenbank (`person_auskunft`); hier entscheidet
 * sie, ob die Karte überhaupt erscheint — eine Akte ohne sie soll keine
 * leere Spalte zeigen.
 */
export function zeigtAuskunft(role: Role | undefined, imEinblick: boolean): boolean {
  return !!role && isTopLevel(role) && !imEinblick;
}

/** Die Namen dessen, was die Löschung sofort entfernt — Schlüssel wie in `person_loeschen`. */
export const SOFORT_GELOESCHT: Record<string, string> = {
  einstellungen: 'Einstellungen und Push-Adressen',
  fehlerprotokoll: 'Einträge im Fehlerprotokoll',
  einsaetze: 'Einsätze',
  ruestlisten: 'Zuteilungen auf Rüstlisten',
  baustellen: 'Zuordnungen an Baustellen',
  wartungen: 'Wartungen',
  kontaktdaten: 'Kontaktdaten (Ansprechpartner, Telefon, E-Mail, Notizen)',
};

/** Ein Dateiname, den jedes Betriebssystem nimmt — ohne Schrägstriche und Doppelpunkte. */
export function auskunftDateiname(person: string, erstelltAm: string): string {
  const name = person.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'person';
  return `datenauskunft-${name}-${erstelltAm.slice(0, 10)}.json`;
}
