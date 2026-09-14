/**
 * Die Anmeldung auf Firebase Auth.
 *
 * Unverändert das, was bis zum 14.09.2026 in `AuthContext.tsx` stand — nur
 * herausgezogen, damit die Ansicht nicht mehr weiss, wer sie anmeldet.
 */
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDocFromCache, getDoc } from 'firebase/firestore';
import { auth, db, getSecondaryAuth } from '@/lib/firebase';
import { mitFristOder } from '@/lib/frist';
import type { Company, CurrentUser, Role } from '@/types';
import { InactiveUserError, type Angemeldet } from '../kern';

/**
 * Wie lange der Start auf das Netz wartet, bevor er den Zwischenspeicher
 * nimmt.
 *
 * Acht Sekunden sind lang genug für ein schlechtes Mobilfunknetz und kurz
 * genug, dass niemand glaubt, die App sei kaputt. Firestore-Abfragen laufen
 * nicht in eine Zeitgrenze, sie warten — auf der iOS-Startbildschirm-App nach
 * dem Aufwecken auf einer toten Verbindung hiess das „lädt gar nicht",
 * unbegrenzt.
 */
const START_FRIST_MS = 8000;

export function beiAenderung(ruf: (wer: Angemeldet | null) => void): () => void {
  return onAuthStateChanged(auth, (fbUser) => {
    ruf(fbUser ? { uid: fbUser.uid, email: fbUser.email ?? '' } : null);
  });
}

export async function anmelden(
  email: string, passwort: string, merken: boolean,
): Promise<void> {
  // Auf einem geteilten Baustellen-Tablet soll die Sitzung mit dem Browser
  // enden — deshalb ist die Dauer wählbar und nicht fest.
  await setPersistence(auth, merken ? browserLocalPersistence : browserSessionPersistence);
  await signInWithEmailAndPassword(auth, email, passwort);
}

export const abmelden = (): Promise<void> => fbSignOut(auth);

export const passwortZuruecksetzen = (email: string): Promise<void> =>
  sendPasswordResetEmail(auth, email);

/**
 * Trägt das vorliegende Token den Plattform-Anspruch?
 *
 * `getIdTokenResult()` liest das bereits ausgestellte Token; ohne
 * `forceRefresh` kostet das keine Netzrunde.
 */
export function istPlattformAdmin(): Promise<boolean> {
  const fbUser = auth.currentUser;
  if (!fbUser) return Promise.resolve(false);
  return fbUser.getIdTokenResult()
    .then((t) => t.claims.plattformAdmin === true)
    .catch(() => false);
}

/**
 * Ein Konto anlegen, OHNE die eigene Sitzung zu verlieren.
 *
 * Firebase meldet den gerade Angelegten sofort an — auf der Primär-App wäre
 * die Verwaltung damit ausgeloggt und stünde als der neue Mitarbeiter da.
 * Deshalb eine zweite App, die gleich darauf wieder abgemeldet wird.
 */
export async function kontoAnlegen(email: string, passwort: string): Promise<string> {
  const zweite = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(zweite, email, passwort);
  await fbSignOut(zweite);
  return cred.user.uid;
}

function profilAus(
  snap: { exists: () => boolean; id: string; data: () => unknown },
  uid: string,
  email: string,
): CurrentUser | null {
  if (!snap.exists()) return null;
  const data = snap.data() as {
    name?: string; role?: Role; companyId?: string; email?: string; active?: boolean;
  };
  if (!data.companyId || !data.role) return null;
  if (data.active === false) throw new InactiveUserError();
  return {
    uid,
    email: data.email ?? email,
    name: data.name ?? email,
    role: data.role,
    companyId: data.companyId,
    docId: snap.id,
  };
}

/**
 * Das Profil aus dem lokalen Zwischenspeicher — ohne Netz, in Millisekunden.
 *
 * WARUM DAS ZUERST KOMMT. Vorher wartete der Start bis zu acht Sekunden auf
 * eine Antwort des Servers und sah erst DANN im Zwischenspeicher nach. Genau
 * der lag aber schon die ganze Zeit bereit. Auf einer zähen Verbindung —
 * Keller, Baustelle, Tiefgarage — war das die gesamte gefühlte Ladezeit, bei
 * jedem einzelnen Start.
 */
export async function profilSchnell(
  uid: string, email: string,
): Promise<CurrentUser | null> {
  try {
    return profilAus(await getDocFromCache(doc(db, 'users', uid)), uid, email);
  } catch (e) {
    // Ein deaktiviertes Konto muss auch aus dem Speicher heraus greifen —
    // sonst käme ein Ausgeschiedener offline noch einmal hinein.
    if (e instanceof InactiveUserError) throw e;
    return null;
  }
}

export async function profilVomServer(
  uid: string, email: string,
): Promise<CurrentUser | null> {
  const ref = doc(db, 'users', uid);
  const snap = await mitFristOder(getDoc(ref), () => getDocFromCache(ref), START_FRIST_MS);
  return profilAus(snap, uid, email);
}

/** Die Firma aus dem lokalen Zwischenspeicher — ohne Netz. */
export async function firmaSchnell(companyId: string): Promise<Company | null> {
  const snap = await getDocFromCache(doc(db, 'companies', companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Company, 'id'>) };
}

/**
 * Nichts zu tun: das Firestore-SDK legt jedes gelesene Dokument von selbst in
 * seinen Zwischenspeicher. Die Postgres-Seite hat keinen solchen und führt
 * ihn selbst — deshalb steht die Funktion in beiden Fassungen.
 */
export function profilMerken(): void {
  /* der Zwischenspeicher des SDK erledigt das */
}
