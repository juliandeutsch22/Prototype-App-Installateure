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
  /** Das Zugangstoken der Sitzung — woran zwei Meldungen derselben Sitzung zu erkennen sind. */
  sitzung?: string;
}

/**
 * Ein deaktiviertes Konto.
 *
 * Deaktivieren ist in diesem Bestand der Ersatz fürs Löschen: die Daten
 * bleiben, der Zugang geht. Ohne diese Prüfung könnte sich ein
 * ausgeschiedener Mitarbeiter weiter anmelden.
 *
 * SIE IST NICHT DIE GRENZE, sondern die Anzeige. Die Grenze steht
 * serverseitig, in `app.aktiv()` — und das fragt die Belegschaft, nicht das
 * Token.
 */
export class InactiveUserError extends Error {
  constructor() {
    super('Dieses Konto ist deaktiviert.');
    this.name = 'InactiveUserError';
  }
}

/**
 * Warum der Anmeldedienst die Anmeldung abgelehnt hat — so weit, wie die
 * Anmeldemaske es sagen darf (K5, Durchsicht 15.11.2026).
 *
 *   - `zugangsdaten`: alles, was am Konto hängt. Dazu gehört auch das
 *     gesperrte Konto (deaktiviert, oder der ganze Betrieb deaktiviert): der
 *     Anmeldedienst meldet die Sperre VOR der Prüfung des Passworts
 *     (gemessen am 15.11.2026, Supabase Auth v2.197.0: falsches Passwort an
 *     ein gesperrtes Konto ergibt `user_banned`). Die Maske dürfte daraus
 *     nicht „deaktiviert“ machen, ohne jedem, der eine Adresse ausprobiert,
 *     zu verraten, dass es das Konto gibt.
 *   - `netz`: der Dienst war nicht erreichbar — ob die Daten stimmen, ist
 *     nicht geprüft.
 *   - `zuViele`: die Drosselung des Dienstes; sie gilt je Anschluss, nicht
 *     je Konto, und verrät nichts über ein Konto.
 *   - `dienst`: eine Störung des Dienstes selbst.
 */
export type AnmeldeAblehnung = 'zugangsdaten' | 'netz' | 'zuViele' | 'dienst';

export class AnmeldeFehler extends Error {
  readonly art: AnmeldeAblehnung;
  constructor(art: AnmeldeAblehnung, meldung: string) {
    super(meldung);
    this.name = 'AnmeldeFehler';
    this.art = art;
  }
}
