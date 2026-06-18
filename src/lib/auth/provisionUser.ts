import { createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth, getSecondaryAuth } from '@/lib/firebase';
import { createUserDoc, type UserProfileInput } from '@/lib/db/users';

/** Zufälliges Initialpasswort (wird nie angezeigt; Nutzer setzt eigenes per Mail). */
function generatePassword(): string {
  return Math.random().toString(36).slice(-10) + 'A1!';
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
export async function provisionUser(companyId: string, profile: UserProfileInput): Promise<string> {
  const secAuth = getSecondaryAuth();
  const tempPassword = generatePassword();
  const cred = await createUserWithEmailAndPassword(secAuth, profile.email, tempPassword);
  const newUid = cred.user.uid;
  await signOut(secAuth); // nur die Secondary-Session abmelden

  await createUserDoc(companyId, newUid, profile);

  try {
    await sendPasswordResetEmail(auth, profile.email);
  } catch {
    // Nicht kritisch (z. B. Emulator ohne Mailversand) — Anlage gilt als erfolgt.
  }
  return newUid;
}
