import type { StartRolle } from './laden';
import { ZIEL } from './ziele';

/**
 * DIE STARTSEITE SELBST EINRICHTEN (E68, 09.11.2026) — ohne Oberfläche, damit
 * sich prüfen lässt, wer was wählen kann.
 *
 * Gewählt wird nur, WAS dasteht, nie, ob jemand etwas sehen DARF: eine
 * Kennzahl erscheint nur, wenn die Rolle ihre Zielseite sehen darf und ihre
 * Daten geladen sind (`aufbau.ts`). Ein Thema unter „Zu erledigen“ lässt sich
 * ausblenden, aber nicht still: unten steht, wie viel ausgeblendet ist, und
 * ein Tipp zeigt es. Warnungen zum Zustand der App (Nachtläufe, fehlendes
 * Eintrittsdatum, „Nicht geladen“) bleiben immer stehen.
 *
 * Ohne eigene Wahl gilt die Vorgabe der Rolle — genau die Startseite von
 * vorher.
 */

/** Die gespeicherte Wahl (`startseite_wahl.wahl`). Fehlt `kennzahlen`, gilt die Vorgabe der Rolle. */
export interface StartWahl {
  kennzahlen?: string[];
  aus?: string[];
}

/** Höchstens vier Kennzahlen (E16, E22) — auch selbst gewählt. */
export const HOECHSTENS_KENNZAHLEN = 4;

/** Die Namen im Bogen „Startseite anpassen“ — auf der Seite selbst tragen manche den Monat oder die Woche. */
export const KENNZAHL_NAMEN: Record<string, string> = {
  saldo: 'Saldo',
  urlaub: 'Resturlaub',
  anf: 'Offene Anforderungen',
  knapp: 'Knappe Artikel',
  offen: 'Offene Rechnungen',
  ueberfaellig: 'Überfällige Rechnungen',
  bezahlt: 'Bezahlt im Monat',
  baustellen: 'Aktive Baustellen',
  auslastung: 'Auslastung der Woche',
};

/** Die Vorgabe je Rolle — die Kennzahlen, die dort bisher standen. */
export const KENNZAHLEN_VORGABE: Record<StartRolle, string[]> = {
  monteur: ['saldo', 'urlaub'],
  verwaltung: ['anf', 'knapp'],
  buchhaltung: ['offen', 'ueberfaellig', 'bezahlt'],
  projektleitung: ['baustellen', 'auslastung'],
  leitung: ['offen', 'ueberfaellig', 'baustellen'],
};

/** Was die Person überhaupt an Kennzahlen bekommen kann — Rechte und Module, keine Daten. */
export interface KennzahlRechte {
  /** Führt die Person ein Zeitkonto? */
  zeitkonto: boolean;
  /** Bearbeitet sie Anforderungen (und ist das Modul Material an)? */
  lager: boolean;
  /** Stellt sie Rechnungen (und ist Rechnungen an)? */
  geld: boolean;
  /** Leitet sie Baustellen (Projektleitung, Geschäftsführung, Administration)? */
  baustellen: boolean;
  /** Darf die Rolle die Zielseite sehen — Rolle UND Modul. */
  darf: (ziel: string) => boolean;
}

/** Die wählbaren Kennzahlen, in der Reihenfolge des Bogens. */
export function waehlbareKennzahlen(r: KennzahlRechte): string[] {
  const out: string[] = [];
  if (r.zeitkonto && r.darf(ZIEL.zeit)) out.push('saldo');
  if (r.zeitkonto && r.darf('/vacations')) out.push('urlaub');
  if (r.lager && r.darf(ZIEL.anforderungen('offen'))) out.push('anf');
  if (r.lager && r.darf(ZIEL.lagerKnapp)) out.push('knapp');
  if (r.geld && r.darf(ZIEL.rechnungen)) out.push('offen', 'ueberfaellig', 'bezahlt');
  if (r.baustellen && r.darf(ZIEL.baustellen('aktiv'))) out.push('baustellen');
  if (r.baustellen && r.darf(ZIEL.woche)) out.push('auslastung');
  return out;
}

/** Die Kennzahlen, die gelten: die eigene Wahl — nur Wählbares, ohne Doppelte, höchstens vier — oder die Vorgabe. */
export function geltendeKennzahlen(rolle: StartRolle, wahl: StartWahl | null | undefined): string[] {
  if (!wahl?.kennzahlen) return KENNZAHLEN_VORGABE[rolle];
  return [...new Set(wahl.kennzahlen.filter((k) => k in KENNZAHL_NAMEN))].slice(0, HOECHSTENS_KENNZAHLEN);
}

/*
  DIE BEREICHE AUSSER „ZU ERLEDIGEN“. Der Schlüssel steht wie die Themen in
  `aus`; das Vorzeichen `bereich-` hält beide auseinander.
*/
export const BEREICH_ARBEITSTAG = 'bereich-arbeitstag';
export const BEREICH_TAG = 'bereich-tag';
export const BEREICH_NAMEN: Record<string, string> = {
  [BEREICH_ARBEITSTAG]: 'Arbeitstag (Start/Stopp)',
  [BEREICH_TAG]: 'Tagesüberblick: Einsatz, Termine, heute',
};

/**
 * DIE THEMEN UNTER „ZU ERLEDIGEN“ JE ROLLE — Schlüssel wie in `aufbau.ts`
 * (Abschnitte der Rollen, Themen der Leitung), Namen für den Bogen. Ein
 * Schlüssel, der hier fehlt, lässt sich nicht ausblenden; `startseiteEinrichtung.test.ts`
 * hält die Liste und den Aufbau gleich.
 */
export const THEMEN: Record<StartRolle, { key: string; name: string }[]> = {
  monteur: [
    { key: 'tage', name: 'Tage ohne Buchung' },
    { key: 'nachtrag', name: 'Schein wartet auf Zeitbuchung' },
    { key: 'abholbereit', name: 'Material abholbereit' },
    { key: 'nachrichten', name: 'Ungelesene Nachrichten' },
    { key: 'jugendschutz', name: 'Grenzen für Jugendliche' },
  ],
  verwaltung: [
    { key: 'tage', name: 'Deine Tage ohne Buchung' },
    { key: 'eingaenge', name: 'Auftragseingang' },
    { key: 'anf-offen', name: 'Offene Anforderungen' },
    { key: 'anf-bestellt', name: 'Bestellt und überfällig' },
    { key: 'anf-alt', name: 'Seit über 3 Tagen abholbereit' },
    { key: 'knapp', name: 'Unter Mindestmenge' },
    { key: 'nachrichten', name: 'Ungelesene Nachrichten' },
    { key: 'jugendschutz', name: 'Grenzen für Jugendliche' },
  ],
  buchhaltung: [
    { key: 'firma', name: 'Keine Rechnung möglich (Firmendaten)' },
    { key: 'tage', name: 'Deine Tage ohne Buchung' },
    { key: 'mahnung', name: 'Mahnungen fällig' },
    { key: 'ueberfaellig', name: 'Überfällig, noch nicht mahnbar' },
    { key: 'ruecklass', name: 'Rücklass wird fällig' },
    { key: 'garantie', name: 'Bankgarantie endet' },
    { key: 'verrechnen', name: 'Nicht verrechnet' },
    { key: 'luecken', name: 'Personen mit Tagen ohne Buchung' },
    { key: 'basiszins', name: 'Basiszinssatz' },
    { key: 'urlaub', name: 'Urlaubsanträge' },
    { key: 'sonderurlaub', name: 'Sonderurlaub' },
    { key: 'eingaenge', name: 'Auftragseingang' },
    { key: 'nachrichten', name: 'Ungelesene Nachrichten' },
    { key: 'jugendschutz', name: 'Grenzen für Jugendliche' },
  ],
  projektleitung: [
    { key: 'tage', name: 'Deine Tage ohne Buchung' },
    { key: 'eingaenge', name: 'Auftragseingang' },
    { key: 'unbesetzt', name: 'Unbesetzte Einsätze' },
    { key: 'material', name: 'Material fehlt' },
    { key: 'budget', name: 'Baustellen über oder nahe Budget' },
    { key: 'ohne-einsatz', name: 'Ohne Einsatz in den nächsten 14 Tagen' },
    { key: 'wartung', name: 'Fällige Wartungen ohne Baustelle' },
    { key: 'eil', name: 'Eilanforderungen' },
    { key: 'ueber-link', name: 'Über Link angenommen' },
    { key: 'ende', name: 'Ende überschritten' },
    { key: 'ohne-leitung', name: 'Baustellen ohne Projektleiter' },
    { key: 'nachrichten', name: 'Ungelesene Nachrichten' },
    { key: 'jugendschutz', name: 'Grenzen für Jugendliche' },
  ],
  leitung: [
    { key: 'nachricht-meldungen', name: 'Gemeldete Nachrichten' },
    { key: 'nachrichten', name: 'Ungelesene Nachrichten' },
    { key: 'ueber-link', name: 'Über Link angenommen' },
    { key: 'eingaenge', name: 'Auftragseingang' },
    { key: 'firma', name: 'Firmendaten für Rechnungen' },
    { key: 'eigene-tage', name: 'Tage ohne eigene Buchung' },
    { key: 'rechnungen', name: 'Überfällige Rechnungen' },
    { key: 'ruecklass', name: 'Rücklass wird fällig' },
    { key: 'garantie', name: 'Bankgarantie endet' },
    { key: 'basiszins', name: 'Basiszinssatz fehlt' },
    { key: 'wartung-ueber', name: 'Wartungen ohne Baustelle' },
    { key: 'ende', name: 'Baustellen über dem Endtermin' },
    { key: 'lieferung-spaet', name: 'Bestellungen überfällig' },
    { key: 'unbesetzt', name: 'Unbesetzte Einsätze' },
    { key: 'eil', name: 'Eilanforderungen' },
    { key: 'urlaub', name: 'Urlaubsanträge' },
    { key: 'sonderurlaub', name: 'Anträge auf Sonderurlaub' },
    { key: 'lieferung-heute', name: 'Erwartete Lieferungen' },
    { key: 'material-fehlt', name: 'Material fehlt' },
    { key: 'budget', name: 'Baustellen am Budgetlimit' },
    { key: 'ohne-einsatz', name: 'Baustellen ohne Einsatz' },
    { key: 'luecken', name: 'Personen mit Tagen ohne Buchung' },
    { key: 'wartung-bald', name: 'Wartungen demnächst fällig' },
    { key: 'ohne-leitung', name: 'Baustellen ohne Projektleiter' },
    { key: 'anf-offen', name: 'Offene Anforderungen' },
    { key: 'abholbereit', name: 'Lange abholbereit' },
    { key: 'knapp', name: 'Artikel unter Mindestmenge' },
    { key: 'konten', name: 'Kontenrahmen' },
    { key: 'lehrzeit', name: 'Lehrzeit endet' },
    { key: 'leitung-mail', name: 'Nur ein Leitungskonto ohne E-Mail' },
    { key: 'firmenbuch-haken', name: '„Im Firmenbuch eingetragen“' },
    { key: 'papierkorb', name: 'Papierkorb über der Frist' },
    { key: 'jugendschutz', name: 'Grenzen für Jugendliche' },
  ],
};

/** Ist der Bereich oder das Thema ausgeblendet? */
export function ausgeblendet(wahl: StartWahl | null | undefined, key: string): boolean {
  return !!wahl?.aus?.includes(key);
}

/** „Ausgeblendet: 2 Themen mit 5 Einträgen“ — bei der Leitung ist jedes Thema eine Zeile. */
export function ausgeblendetText(themen: number, eintraege: number, nurThemen: boolean): string {
  const t = `${themen} ${themen === 1 ? 'Thema' : 'Themen'}`;
  return nurThemen || eintraege === themen
    ? `Ausgeblendet: ${t}`
    : `Ausgeblendet: ${t} mit ${eintraege} ${eintraege === 1 ? 'Eintrag' : 'Einträgen'}`;
}
