/**
 * Die Zwei-Faktor-Anmeldung aus Sicht der Edge Functions (Runde 3, H1).
 *
 * Die Functions lesen den Aufrufer mit dem Dienstschlüssel — an den
 * Zeilenregeln, die den zweiten Faktor verlangen, kämen sie damit vorbei.
 * Deshalb fragen sie die Datenbank ausdrücklich (`zweiter_faktor_fehlt`)
 * und geben ihr dazu die Stufe der Anmeldung aus dem Token mit.
 *
 * DAS TOKEN IST GEPRÜFT, BEVOR ES HIER GELESEN WIRD: jede Function fragt
 * vorher `/auth/v1/user`, und der Anmeldedienst weist ein gefälschtes ab.
 * Hier wird nur noch abgelesen, nicht vertraut.
 */

/** `aal1` oder `aal2` aus einem JWT — ohne lesbare Angabe `null`. */
export function aalAusToken(token: string): string | null {
  const teil = token.split('.')[1];
  if (!teil) return null;
  try {
    const roh = teil.replace(/-/g, '+').replace(/_/g, '/');
    const gepolstert = roh + '='.repeat((4 - (roh.length % 4)) % 4);
    const inhalt = JSON.parse(atob(gepolstert)) as { aal?: unknown };
    return typeof inhalt.aal === 'string' ? inhalt.aal : null;
  } catch {
    return null;
  }
}

/** Die Antwort an ein Konto, dem der zweite Faktor fehlt. */
export const ZWEITER_FAKTOR_FEHLT =
  'Für dieses Konto ist die Zwei-Faktor-Anmeldung verlangt. Bitte abmelden, neu anmelden und den Code aus der Authenticator-App eingeben.';
