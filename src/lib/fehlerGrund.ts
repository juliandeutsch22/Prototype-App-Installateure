/**
 * Was der Server ablehnt, in Worten für den Betrieb.
 *
 * VORHER stand an fast jeder Maske ein fester Satz: „… konnte nicht
 * gespeichert werden. Bitte erneut versuchen." Das klingt nach einer Störung,
 * die beim zweiten Versuch vorbei ist. Eine doppelte Nummer, ein fehlendes
 * Recht oder ein Supportzugang, der nur lesen darf, sind aber keine Störung —
 * der zweite Versuch scheitert genauso, und niemand erfährt warum. Gefunden
 * im Prüflauf vom 24.09.2026 (Befunde F4, F8, F18).
 *
 * WAS DURCHGEHT UND WAS NICHT. Die Gründe, die unsere Datenbank selbst nennt
 * („Urlaub wird beantragt und genehmigt, nicht direkt gebucht"), sind für
 * Menschen geschrieben und gehen unverändert durch. Die Meldungen von
 * Postgres und PostgREST sind Englisch und für Entwickler; die bekannten
 * werden übersetzt, alle anderen weichen dem festen Satz der Maske — ein
 * „violates foreign key constraint" hilft im Büro niemandem.
 */

/*
  EIN MERKER STATT EINES PARAMETERS AN JEDER MASKE. Ob gerade ein Einblick
  der Stufe „ansehen" läuft, weiss nur die Anmeldung; die vierzig Masken, die
  eine Ablehnung anzeigen, müssten es sonst alle durchreichen. Gesetzt wird er
  in `AuthContext`, sobald ein Einblick beginnt oder endet.
*/
let nurLesend = false;

export function einblickNurLesend(ja: boolean): void {
  nurLesend = ja;
}

const EINBLICK = 'Im Einblick wird nur gelesen — ändern kann das der Betrieb selbst.';

// Wörter, die in unseren deutschen Gründen nicht vorkommen, in den
// technischen Meldungen von Postgres, PostgREST und dem Browser aber fast
// immer.
const TECHNISCH =
  /\b(the|of|for|violates|does not|failed|error|invalid|column|relation|function|constraint|null value|row|policy|request|fetch|timeout|unexpected|undefined|cannot)\b/i;

export interface Zusatz {
  /** Was bei einem doppelten Wert gesagt wird — die Maske weiss, welcher es war. */
  doppelt?: string;
}

export function grundAus(fehler: unknown, ersatz: string, zusatz: Zusatz = {}): string {
  const text =
    fehler instanceof Error ? fehler.message : typeof fehler === 'string' ? fehler : '';
  if (!text.trim()) return ersatz;

  if (/duplicate key value/i.test(text)) {
    return zusatz.doppelt ?? 'Das gibt es schon — ein Wert, der nur einmal vorkommen darf, ist bereits vergeben.';
  }
  if (/row-level security|permission denied/i.test(text)) {
    return nurLesend ? EINBLICK : 'Dafür fehlt die Berechtigung — das darf diese Rolle nicht.';
  }
  // Im Einblick trifft ein Ändern keine Zeile — die Datenschicht meldet das
  // als „kein Datensatz geändert", und das wäre hier irreführend.
  if (nurLesend && /^Kein Datensatz in /.test(text)) return EINBLICK;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) {
    return `${ersatz} Keine Verbindung zum Server — bitte noch einmal, sobald das Netz wieder da ist.`;
  }
  if (/jwt expired|invalid jwt|refresh token/i.test(text)) {
    return 'Die Anmeldung ist abgelaufen — bitte neu anmelden.';
  }
  if (/not-null constraint|check constraint|invalid input syntax|value too long/i.test(text)) {
    return `${ersatz} Eine Angabe fehlt oder hat die falsche Form.`;
  }
  if (TECHNISCH.test(text)) return ersatz;
  return text;
}
