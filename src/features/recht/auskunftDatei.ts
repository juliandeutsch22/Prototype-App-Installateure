import { isTopLevel } from '@/lib/permissions';
import type { Role } from '@/types';
import type { AuskunftArt } from '@/lib/db/auskunft';

/**
 * Wer die Datenauskunft holt: die Geschäftsführung, nicht im Supporteinblick.
 * Dieselbe Grenze zieht die Datenbank (`person_auskunft`); hier entscheidet
 * sie, ob die Karte überhaupt erscheint — eine Akte ohne sie soll keine
 * leere Spalte zeigen.
 */
export function zeigtAuskunft(role: Role | undefined, imEinblick: boolean): boolean {
  return !!role && isTopLevel(role) && !imEinblick;
}

/**
 * Die Namen dessen, was die Löschung sofort entfernt — Schlüssel wie in `person_loeschen`.
 *
 * JEDER SCHLÜSSEL DER LETZTEN FASSUNG STEHT HIER. Fehlt einer, stünde im
 * Löschdialog der rohe Schlüssel; `tests/unit/loeschBezeichnungen.test.ts`
 * liest die Migrationen und meldet einen neuen Schlüssel ohne Namen.
 */
export const SOFORT_GELOESCHT: Record<string, string> = {
  einstellungen: 'Einstellungen und Push-Adressen',
  startseite: 'Eingerichtete Startseite',
  fehlerprotokoll: 'Einträge im Fehlerprotokoll',
  einsaetze: 'Einsätze',
  ruestlisten: 'Zuteilungen auf Rüstlisten',
  baustellen: 'Zuordnungen an Baustellen',
  termine: 'Termine',
  // M04a: das Fahrzeug bleibt, nur ohne Standardfahrer.
  standardfahrer: 'Eintragungen als Standardfahrer eines Fahrzeugs',
  // M10/B09: die Nachricht bleibt als Platzhalter „Gelöschtes Konto“, Text und Anhänge gehen.
  nachrichten: 'Eigene Nachrichten (Text und Anhänge)',
  nachrichten_teilnehmer: 'Teilnahmen an Gesprächen',
  // E77: Reaktionen gehen mit der Person — auf eigene wie auf fremde Nachrichten.
  nachricht_reaktionen: 'Reaktionen auf Nachrichten',
  geburtsdatum: 'Geburtsdatum',
  wartungen: 'Wartungen',
  kontaktdaten: 'Kontaktdaten (Ansprechpartner, Telefon, E-Mail, Notizen)',
  // M02a: nicht gelöscht, aber beendet — wer gelöscht werden will, löst keine Baustelle mehr aus.
  annahme_links: 'Offene Annahme-Links (werden widerrufen)',
  // M02b: übernommene bleiben bei ihrer Baustelle bzw. ihrem Angebot, ohne Kontaktdaten.
  auftragseingaenge: 'Offene und abgelehnte Auftragseingänge',
  // M02c: an welchen Liegenschaften er beteiligt war — samt den Werten im Änderungsverlauf.
  liegenschaft_beteiligungen: 'Beteiligungen an Liegenschaften',
};

/*
  DERSELBE SCHLÜSSEL, ZWEI VORGÄNGE. Beim Kunden gehen seine Termine; bei
  einer Person der Belegschaft bleibt der Termin und nur ihre Teilnahme
  geht. „Termine: 3“ hiesse dort, drei Termine verschwänden.
*/
const SOFORT_JE_ART: Partial<Record<AuskunftArt, Record<string, string>>> = {
  mitarbeiter: { termine: 'Teilnahmen an Terminen' },
};

/** Der Name eines Teils im Löschdialog — `null`, wenn der Schlüssel unbekannt ist. */
export function sofortBezeichnung(art: AuskunftArt, schluessel: string): string | null {
  return SOFORT_JE_ART[art]?.[schluessel] ?? SOFORT_GELOESCHT[schluessel] ?? null;
}

/** Ein Dateiname, den jedes Betriebssystem nimmt — ohne Schrägstriche und Doppelpunkte. */
export function auskunftDateiname(person: string, erstelltAm: string): string {
  const name = person.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'person';
  return `datenauskunft-${name}-${erstelltAm.slice(0, 10)}.json`;
}
