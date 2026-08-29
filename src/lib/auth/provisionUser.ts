import { createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth, getSecondaryAuth } from '@/lib/firebase';
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
 * Legt einen neuen Benutzer an (Legacy "secApp"-Muster, docs §6):
 * 1) Auth-Konto auf einer Secondary-App erstellen, damit die Admin-Session
 *    der Primär-App unberührt bleibt.
 * 2) Secondary sofort abmelden.
 * 3) users/{uid}-Dokument mit companyId aus dem Admin-Kontext schreiben
 *    (die Cloud Function syncUserClaims setzt daraufhin die Custom Claims).
 * 4) Passwort-Reset-/Willkommens-Mail senden (best effort).
 */
export async function provisionUser(
  companyId: string,
  profile: UserProfileInput,
): Promise<ProvisionResult> {
  const secAuth = getSecondaryAuth();
  const tempPassword = generatePassword();
  const cred = await createUserWithEmailAndPassword(secAuth, profile.email, tempPassword);
  const newUid = cred.user.uid;
  await signOut(secAuth); // nur die Secondary-Session abmelden

  await createUserDoc(companyId, newUid, profile);

  let mailSent = true;
  try {
    await sendPasswordResetEmail(auth, profile.email);
  } catch {
    // Nicht kritisch (z. B. Emulator ohne Mailversand) — Anlage gilt als erfolgt,
    // das UI zeigt dann das Initialpasswort zur Weitergabe.
    mailSent = false;
  }
  return { uid: newUid, tempPassword, mailSent };
}

/** Passwort-Reset-Mail erneut senden (Legacy:8163-8177). */
export function resendPasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}
