import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
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

/**
 * Firestore MIT lokalem Zwischenspeicher.
 *
 * Ohne den steht ein Monteur im Keller, im Rohbau oder in der Tiefgarage vor
 * einer leeren App, und eine Buchung schlägt fehl statt nachgereicht zu
 * werden. Für diese Zielgruppe ist fehlender Empfang kein Randfall, sondern
 * Alltag. Mit dem Zwischenspeicher bleiben bereits geladene Daten lesbar und
 * Schreibvorgänge gehen raus, sobald das Netz wieder da ist.
 *
 * `persistentMultipleTabManager` erlaubt mehrere offene Tabs — ohne ihn
 * bekommt nur der erste Tab den Speicher und die übrigen laufen ohne.
 *
 * Fällt die Einrichtung aus (privates Fenster, Browser ohne IndexedDB,
 * blockierte Website-Daten), läuft die App wie bisher rein online weiter:
 * lieber ohne Zwischenspeicher als gar nicht.
 */
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return initializeFirestore(app, {});
  }
}

export const db = createDb();
export const functions = getFunctions(app, FUNCTIONS_REGION);

// Im Dev-Modus optional gegen die lokalen Emulatoren laufen.
// 127.0.0.1 statt "localhost" vermeidet IPv6-Auflösungsprobleme (::1).
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
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

/**
 * Auth-Instanz der Secondary-App (für Benutzeranlage). Bindet im Dev-Modus
 * denselben Emulator an wie die Primär-Auth.
 */
export function getSecondaryAuth(): Auth {
  const secAuth = getAuth(getSecondaryApp());
  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    // Mehrfaches connect ist idempotent (gleiche URL); Warnungen unterdrücken.
    connectAuthEmulator(secAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return secAuth;
}
