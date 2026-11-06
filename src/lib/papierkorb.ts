/**
 * Der Papierkorb für Entwürfe (M01d, U06) — was „seit wann“ und „über der
 * Frist“ heißt, an einer Stelle für Datenschicht, Papierkorb und Startseite.
 *
 * Ohne Oberfläche und ohne Datenbank, damit sich die Rechnung prüfen lässt.
 */

const TAG_MS = 86_400_000;

/**
 * SEIT WANN DER PAPIERKORB ZÄHLT: 06.11.2026, 00:00 Wiener Zeit.
 *
 * Scheine, die vorher verworfen wurden, tragen keinen Zeitpunkt
 * (`verworfen_am` leer, Altdaten) — er wird nicht geraten. Für die Frist
 * zählen sie ab hier: früher konnte niemand sehen, dass sie „seit X Tagen“
 * liegen, und eine Frist, die am Tag ihrer Einführung schon abgelaufen wäre,
 * stellte alle alten Entwürfe auf einmal zur Entscheidung.
 */
export const PAPIERKORB_SEIT = Date.parse('2026-11-06T00:00:00+01:00');

/** Ab wann etwas als verworfen gilt — der bekannte Zeitpunkt oder die Einführung. */
export function verworfenAbMs(verworfenAm: number | null | undefined): number {
  return typeof verworfenAm === 'number' ? verworfenAm : PAPIERKORB_SEIT;
}

/** Ganze Tage im Papierkorb (abgerundet, nie unter null). */
export function tageImPapierkorb(verworfenAm: number | null | undefined, jetzt: number): number {
  return Math.max(0, Math.floor((jetzt - verworfenAbMs(verworfenAm)) / TAG_MS));
}

/**
 * Bis wann verworfen sein muss, was über der Frist liegt — `null` ohne Frist.
 *
 * „Länger als X Tage“: genau X mal 24 Stunden vor jetzt und früher.
 */
export function fristStichtag(fristTage: number | null | undefined, jetzt: number): number | null {
  if (!fristTage || fristTage <= 0) return null;
  return jetzt - fristTage * TAG_MS;
}

/** Liegt es länger als die Frist im Papierkorb? Ohne Frist nie. */
export function ueberFrist(
  verworfenAm: number | null | undefined,
  fristTage: number | null | undefined,
  jetzt: number,
): boolean {
  const stichtag = fristStichtag(fristTage, jetzt);
  return stichtag !== null && verworfenAbMs(verworfenAm) <= stichtag;
}

/** Zählen die Scheine ohne Zeitpunkt bei diesem Stichtag mit? */
export function ohneZeitpunktUeberFrist(stichtag: number): boolean {
  return PAPIERKORB_SEIT <= stichtag;
}
