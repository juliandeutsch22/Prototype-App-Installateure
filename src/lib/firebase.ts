import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  disableNetwork,
  enableNetwork,
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
/**
 * Läuft die App als eigene Anwendung vom Startbildschirm?
 *
 * Dann gibt es genau EIN Fenster — und die Aushandlung darüber, welcher Tab
 * den Zwischenspeicher führen darf, ist Aufwand ohne Gegenwert.
 */
function alsEigeneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // Safari auf iOS kennt `display-mode` nicht und meldet es hierüber.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function createDb() {
  try {
    /**
     * Mehrfenster-Aushandlung NUR im Browser, nicht in der Startbildschirm-App.
     *
     * `persistentMultipleTabManager` handelt über IndexedDB aus, welches
     * Fenster den Zwischenspeicher führt. Der Führende hält dafür eine
     * Reservierung, die ausläuft — wird ein Fenster ordentlich geschlossen,
     * gibt es sie zurück. iOS beendet eine App im Hintergrund aber OHNE
     * Aufräumen. Beim nächsten Start liegt die Reservierung des vorigen Laufs
     * dann noch da, und der neue Lauf wartet, bis sie verfällt, bevor er ans
     * Netz geht. Genau so sieht „lädt manchmal ewig" aus.
     *
     * In einer Startbildschirm-App gibt es ohnehin nur ein Fenster, also
     * bringt die Aushandlung dort nichts und kostet nur.
     *
     * DER PREIS, ehrlich: hat jemand am Rechner die installierte App UND
     * einen Browser-Tab derselben Adresse gleichzeitig offen, bekommt der
     * zweite keinen dauerhaften Zwischenspeicher mehr — er läuft dann rein
     * online weiter. Ein seltener Fall, und er bricht nichts.
     */
    return initializeFirestore(app, {
      localCache: persistentLocalCache(
        alsEigeneApp()
          ? { tabManager: persistentSingleTabManager(undefined) }
          : { tabManager: persistentMultipleTabManager() },
      ),
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
 * Nach dem Aufwecken die Verbindung erneuern.
 *
 * DAS PROBLEM. iOS friert eine Startbildschirm-App beim Wegschalten ein und
 * behält die Seite im Speicher. Kommt der Benutzer zurück, ist der
 * JavaScript-Zustand noch da — die Netzverbindungen sind es nicht. Firestore
 * merkt das nicht sofort: eine Abfrage, die in diesem Moment abgeschickt
 * wird, sitzt auf einem toten Kanal. Und weil Firestore-Abfragen keine
 * Zeitgrenze haben, wartet sie dort, bis der Client von selbst darauf kommt.
 *
 * Am Schreibtisch passiert das nie so — ein Browser-Tab wird eher komplett
 * neu geladen.
 *
 * DIE LÖSUNG: das Netz einmal aus- und wieder einschalten. Damit wirft der
 * Client den toten Kanal weg und baut sofort einen neuen auf, statt auf sein
 * eigenes Zeitfenster zu warten.
 *
 * NUR NACH LÄNGERER PAUSE. Beim kurzen Blick auf eine Meldung wäre das
 * unnötig — und in der Sekunde dazwischen kämen Abfragen aus dem
 * Zwischenspeicher statt vom Server.
 */
const PAUSE_BIS_NEUVERBINDUNG_MS = 30_000;

export function verbindungBeimAufwachenErneuern(): void {
  if (typeof document === 'undefined') return;
  let weggeschaltet = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      weggeschaltet = Date.now();
      return;
    }
    if (!weggeschaltet || Date.now() - weggeschaltet < PAUSE_BIS_NEUVERBINDUNG_MS) return;
    weggeschaltet = 0;
    // Fehler hier sind belanglos: schlimmstenfalls bleibt es beim alten
    // Verhalten. Der Benutzer soll davon nichts sehen.
    void disableNetwork(db)
      .then(() => enableNetwork(db))
      .catch(() => undefined);
  });
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
