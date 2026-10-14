import { kontoAnlage, passwortZuruecksetzen } from '@/lib/auth/sitzung';
import { createUserDocEinmalig, type UserProfileInput } from '@/lib/db/users';
import { istBenutzerkonto } from '@shared/benutzername';

// Seit 30.09.2026 in `shared/startpasswort.ts`: dieselbe Erzeugung im Browser und in der Edge Function (P1, P2).
import { generatePassword } from '@shared/startpasswort';

export { generatePassword };

export interface ProvisionResult {
  uid: string;
  /** Initialpasswort — anzeigen, falls die Willkommens-Mail nicht ankommt. */
  tempPassword: string;
  /** Nach verlorenem Vorgang wird das Passwort ausdrücklich in der Akte gesetzt. */
  startpasswortNoetig?: boolean;
  /** false = keine Mail ging hinaus, das Passwort muss weitergegeben werden. */
  mailSent: boolean;
  /**
   * Anmeldung mit Benutzername: es gibt keine Mail, und das ist kein Fehler.
   * Die Ansicht sagt dann nicht „konnte nicht gesendet werden".
   */
  benutzerkonto: boolean;
}

/**
 * Legt einen neuen Mitarbeiter an — in drei Schritten, und die Reihenfolge
 * zählt:
 *
 * 1) Das ANMELDEKONTO, ohne die eigene Sitzung zu verlieren. Beide
 *    Anmeldungen melden den gerade Angelegten sonst sofort an, und die
 *    Verwaltung stünde als der neue Mitarbeiter da. Wie das verhindert wird,
 *    unterscheidet sich je Anmeldung und steht in der Naht.
 * 2) Die ZEILE IN DER BELEGSCHAFT mit dem Betrieb aus dem Kontext der
 *    Verwaltung. Erst daraus entstehen die Ansprüche, gesetzt vom Trigger
 *    `users_ansprueche`.
 * 3) Die Willkommensmail. Sie darf scheitern: das Konto steht, und das
 *    Anfangspasswort lässt sich durchgeben.
 *
 * WARUM DAS KONTO ZUERST KOMMT: die Zeile in der Belegschaft braucht die
 * Kennung des Kontos als Schlüssel. Umgekehrt entstünde eine Zeile ohne
 * Konto — ein Mitarbeiter, der in der Liste steht und sich nicht anmelden
 * kann.
 */
export async function provisionUser(
  companyId: string,
  profile: UserProfileInput,
): Promise<ProvisionResult> {
  // Der kurzlebige Vorgang überlebt einen Seitenneustart im selben Tab.
  // Das gleiche Passwort wird erneut angezeigt, niemals das eines fremden Kontos.
  const schluessel = `senklot-anlage:${companyId}:${profile.email.trim().toLowerCase()}`;
  let versuch: { vorgang: string; passwort: string; seit: number } | null = null;
  try { versuch = JSON.parse(sessionStorage.getItem(schluessel) ?? 'null'); } catch { /* Neuer Versuch. */ }
  if (!versuch || Date.now() - versuch.seit > 86_400_000) {
    versuch = { vorgang: crypto.randomUUID(), passwort: generatePassword(), seit: Date.now() };
  }
  // Ohne haltbaren Wiederanlauf wird auch kein Konto angelegt.
  sessionStorage.setItem(schluessel, JSON.stringify(versuch));
  const { uid: newUid, startpasswortNoetig } = await kontoAnlage(profile.email, versuch.passwort, versuch.vorgang);
  const tempPassword = startpasswortNoetig ? '' : versuch.passwort;

  try {
    await createUserDocEinmalig(companyId, newUid, profile);
  } catch (e) {
    const grund = e instanceof Error ? e.message : 'Unbekannter Fehler';
    throw new Error(`Das Mitarbeiterprofil konnte nicht gespeichert werden: ${grund}. Bitte die Anlage in diesem Tab erneut versuchen; das Konto wird dabei wiederverwendet.`);
  }
  sessionStorage.removeItem(schluessel);

  // Eine Kunstadresse bekommt keine Mail — sie käme nie an.
  if (istBenutzerkonto(profile.email)) {
    return { uid: newUid, tempPassword, startpasswortNoetig, mailSent: false, benutzerkonto: true };
  }

  let mailSent = true;
  try {
    await passwortZuruecksetzen(profile.email);
  } catch {
    // Nicht kritisch (etwa ohne eingerichteten Mailversand) — die Anlage gilt
    // als erfolgt, und die Ansicht zeigt das Anfangspasswort zur Weitergabe.
    mailSent = false;
  }
  return { uid: newUid, tempPassword, startpasswortNoetig, mailSent, benutzerkonto: false };
}

/** Die Willkommensmail erneut senden. */
export function resendPasswordReset(email: string): Promise<void> {
  return passwortZuruecksetzen(email);
}
