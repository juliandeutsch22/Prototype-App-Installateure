/**
 * Aus einer fälligen Wartung eine Baustelle machen.
 *
 * WARUM DAS FEHLTE UND WARUM ES ZÄHLT. Die Wartungsliste sagte, was fällig
 * ist — und hörte dort auf. Alles Weitere lief von Hand: Baustelle anlegen,
 * Kundennamen abtippen, Adresse abtippen, einplanen, und nach getaner Arbeit
 * die Projektnummer in den Erledigt-Dialog zurücktippen. Vier Wege durch die
 * App für einen Vorgang, der aus der Liste heraus einer sein sollte.
 *
 * Schlimmer als die Tipparbeit war, dass die Liste den Fortschritt NICHT
 * kannte. Wer sie am Montag durchgeht und drei Baustellen anlegt, sieht am
 * Dienstag dieselben drei Zeilen im selben Rot: „fällig" hiess sowohl „noch
 * nichts passiert" als auch „steht längst im Einsatzplan". Beim zweiten
 * Durchgang entsteht die Baustelle ein zweites Mal.
 *
 * Die Baustelle selbst legt die Datenbank an (`wartung_einplanen`: Anlagen-
 * vor Kundenadresse, Name aus dem Kundenstamm, Abrechnungsart offen, geprüft
 * in `tests/supabase/robusteAblaeufe.test.ts`). Hier bleibt nur die Prüfung
 * einer selbst eingegebenen Nummer vor dem Absenden.
 */

/*
 * DIE NUMMER KOMMT NICHT MEHR VON HIER. Bis zum 23.09.2026 stand hier ein
 * eigener Vorschlag nach dem Muster „2026-014" — ohne den Vorsatz, den der
 * Betrieb eingestellt hat. Die Wartung nutzt jetzt denselben Weg wie „Neue
 * Baustelle": Vorschlag nach dem Schema des Betriebs, verbindlich aus dem
 * Zähler, eine eigene Nummer bleibt erlaubt (siehe `WartungenView`).
 */

/** Ist die Nummer noch frei? Gross-/Kleinschreibung und Leerraum ignoriert. */
export function nummerFrei(nummer: string, vorhandene: string[]): boolean {
  const gesucht = nummer.trim().toLowerCase();
  if (!gesucht) return false;
  return !vorhandene.some((n) => n.trim().toLowerCase() === gesucht);
}
