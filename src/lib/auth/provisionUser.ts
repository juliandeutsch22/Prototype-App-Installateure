import { kontoAnlegen, passwortZuruecksetzen } from '@/lib/auth/sitzung';
import { createUserDoc, type UserProfileInput } from '@/lib/db/users';

const PW_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Zufälliges Initialpasswort. Bewusst über crypto.getRandomValues statt
 * Math.random (nicht kryptografisch sicher und damit vorhersagbar).
 * Verwechselbare Zeichen (0/O, 1/l/I) sind ausgelassen, weil das Passwort
 * am Telefon durchgegeben werden kann, wenn die Mail nicht ankommt.
 */
function generatePassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += PW_ALPHABET[b % PW_ALPHABET.length];
  return `${out}A1!`;
}

export interface ProvisionResult {
  uid: string;
  /** Initialpasswort — anzeigen, falls die Willkommens-Mail nicht ankommt. */
  tempPassword: string;
  /** false = Mailversand schlug fehl, Passwort muss weitergegeben werden. */
  mailSent: boolean;
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
  const tempPassword = generatePassword();
  const newUid = await kontoAnlegen(profile.email, tempPassword);

  try {
    await createUserDoc(companyId, newUid, profile);
  } catch (e) {
    /*
      AUFRÄUMEN GEHT HIER NICHT, UND DAS GEHÖRT GESAGT.

      Das Anmeldekonto steht schon; es wieder zu entfernen bräuchte
      Dienstrechte, die der Browser nicht hat und nicht haben soll. Zurück
      bleibt also ein Konto ohne Zeile in der Belegschaft — jemand, der sich
      anmelden kann und nichts sieht.

      Das ist der ehrlichere der beiden schlechten Ausgänge: die Alternative
      wäre, die Zeile zuerst zu schreiben und bei einem Fehlschlag am Konto
      eine Belegschaftszeile ohne Anmeldung zurückzulassen — und die STEHT in
      der Mitarbeiterliste und sieht richtig aus. Ein Konto ohne Zeile fällt
      beim ersten Anmeldeversuch auf; eine Zeile ohne Konto fällt niemandem
      auf.

      Die Meldung nennt deshalb die Adresse: der zweite Versuch mit derselben
      scheitert an ihr, und ohne diesen Hinweis wüsste niemand, warum.
    */
    const grund = e instanceof Error ? e.message : 'Unbekannter Fehler';
    throw new Error(
      `Das Konto zu ${profile.email} wurde angelegt, das Profil aber nicht: ${grund}. ` +
        'Bitte an die Entwicklung wenden — mit dieser Adresse lässt sich kein zweites anlegen.',
    );
  }

  let mailSent = true;
  try {
    await passwortZuruecksetzen(profile.email);
  } catch {
    // Nicht kritisch (etwa ohne eingerichteten Mailversand) — die Anlage gilt
    // als erfolgt, und die Ansicht zeigt das Anfangspasswort zur Weitergabe.
    mailSent = false;
  }
  return { uid: newUid, tempPassword, mailSent };
}

/** Die Willkommensmail erneut senden. */
export function resendPasswordReset(email: string): Promise<void> {
  return passwortZuruecksetzen(email);
}
