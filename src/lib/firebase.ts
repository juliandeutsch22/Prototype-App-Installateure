import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

/**
 * Firebase-Initialisierung — Konfiguration AUSSCHLIESSLICH aus ENV.
 * Kein kundenspezifischer Wert ist hartkodiert (vgl. Spec §11).
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west3';

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // Sichtbarer Fehler statt stillem Abbruch.
  throw new Error(
    'Firebase-Konfiguration fehlt. Bitte .env aus .env.example erstellen und die VITE_FIREBASE_*-Werte setzen.',
  );
}

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

// Im Dev-Modus optional gegen die lokalen Emulatoren laufen.
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

/**
 * Erzeugt eine zweite, isolierte Firebase-App-Instanz. Wird gebraucht, um
 * neue Benutzer per createUserWithEmailAndPassword anzulegen, OHNE die
 * aktuelle Admin-Session abzumelden (vgl. Legacy "secApp"-Muster).
 */
export function getSecondaryApp(name = 'secondary'): FirebaseApp {
  const existing = getApps().find((a) => a.name === name);
  return existing ?? initializeApp(firebaseConfig, name);
}
