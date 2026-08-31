import { doc, getDoc, setDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserPrefs } from '@/types';

/**
 * Persönliche Einstellungen, per uid geschlüsselt (userPrefs/{uid}).
 *
 * Getrennt von `users`, weil dort nur die Geschäftsführung schreiben darf.
 * Was jemand an Meldungen bekommen will und auf welchen Geräten, entscheidet
 * er selbst — die Rules erlauben deshalb genau das eigene Dokument.
 */

const COLLECTION = 'userPrefs';

/** Vorgabe für jemanden, der noch nie etwas eingestellt hat. */
export const PREFS_DEFAULTS: Pick<UserPrefs, 'notifyNewOrder' | 'notifyOrderReady'> = {
  // Beide an: wer nichts einstellt, soll nichts verpassen. Abschalten ist
  // ein bewusster Schritt, Einschalten sollte keiner sein.
  notifyNewOrder: true,
  notifyOrderReady: true,
};

export async function getPrefs(uid: string): Promise<UserPrefs | null> {
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<UserPrefs, 'id'>) };
}

export function subscribePrefs(
  uid: string,
  cb: (p: UserPrefs | null) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, COLLECTION, uid),
    (snap) =>
      cb(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<UserPrefs, 'id'>) } : null),
    (e) => onError?.(e),
  );
}

/** Schreibt die Auswahl. `merge`, damit die Gerätetokens unangetastet bleiben. */
export async function savePrefs(
  companyId: string,
  uid: string,
  prefs: Pick<UserPrefs, 'notifyNewOrder' | 'notifyOrderReady'>,
): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, uid),
    { companyId, userId: uid, ...prefs, updatedAt: Date.now() },
    { merge: true },
  );
}

/**
 * Gerät für Push registrieren. arrayUnion statt Lesen-Ändern-Schreiben:
 * meldet sich jemand auf Telefon und Rechner gleichzeitig an, gingen sonst
 * je nach Reihenfolge Tokens verloren.
 */
export async function addPushToken(companyId: string, uid: string, token: string): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, uid),
    { companyId, userId: uid, pushTokens: arrayUnion(token), updatedAt: Date.now() },
    { merge: true },
  );
}

/** Gerät abmelden — beim Abschalten der Benachrichtigungen oder beim Logout. */
export async function removePushToken(uid: string, token: string): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, uid),
    { pushTokens: arrayRemove(token), updatedAt: Date.now() },
    { merge: true },
  );
}
