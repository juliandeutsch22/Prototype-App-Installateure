/**
 * Was beide Anmeldungen gemeinsam haben.
 *
 * Kennt weder Firebase noch Supabase — sonst zöge jede Ansicht, die nur den
 * Fehlertyp braucht, ein SDK in ihren Typgraphen. Derselbe Grund wie bei
 * `lib/db/core.ts`.
 */

/** Wer angemeldet ist — mehr weiss die Anmeldung selbst nicht. */
export interface Angemeldet {
  uid: string;
  email: string;
}

/**
 * Ein deaktiviertes Konto.
 *
 * Deaktivieren ist in diesem Bestand der Ersatz fürs Löschen: die Daten
 * bleiben, der Zugang geht. Ohne diese Prüfung könnte sich ein
 * ausgeschiedener Mitarbeiter weiter anmelden.
 *
 * SIE IST NICHT DIE GRENZE, sondern die Anzeige. Die Grenze steht
 * serverseitig — unter Firestore in den Regeln, unter Postgres in
 * `app.aktiv()`, das die Belegschaft fragt und nicht das Token.
 */
export class InactiveUserError extends Error {
  constructor() {
    super('Dieses Konto ist deaktiviert.');
    this.name = 'InactiveUserError';
  }
}
