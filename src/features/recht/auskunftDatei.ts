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
  // K7: wann ihr zweiter Faktor zurückgesetzt wurde — und bei dem, der es tat, sein Name daran.
  zwei_faktor_ruecksetzungen: 'Protokoll zum Zurücksetzen des zweiten Faktors',
  // V14: ihre Bitten um ein neues Passwort — und bei dem, der sie erledigte, sein Name daran.
  passwort_anfragen: 'Bitten um ein neues Passwort',
  // K9 (N5): die Umstellungen des Kontos zwischen E-Mail und Benutzername — und bei dem, der umstellte, sein Name daran.
  kontoumstellungen: 'Umstellungen der Anmeldung (E-Mail / Benutzername)',
  // F13: verbuchte Bankbewegungen bleiben (Wiederholungssperre), nur ohne ihren Namen.
  bank_buchungen: 'Ihr Name an verbuchten Bewegungen eines Kontoauszugs',
  // F16: der Versand bleibt im Verlauf des Belegs, nur ohne ihren Namen.
  beleg_versand: 'Ihr Name an Rechnungen und Angeboten per Mail',
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
  // F16: Zeitpunkt, Beleg und Betreff bleiben neben dem aufbewahrten Beleg, die Adressen gehen.
  mailversand_adressen: 'Empfängeradressen von Rechnungen und Angeboten per Mail',
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
