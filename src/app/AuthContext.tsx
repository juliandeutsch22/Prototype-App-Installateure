import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { doc, getDoc, getDocFromCache } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getCompany } from '@/lib/db/company';
import { applyBranding } from '@/lib/tenant';
import { mitFristOder } from '@/lib/frist';
import type { CurrentUser, Company, Role } from '@/types';

/**
 * Wie lange der Start auf das Netz wartet, bevor er den Zwischenspeicher
 * nimmt.
 *
 * Acht Sekunden sind lang genug für ein schlechtes Mobilfunknetz und kurz
 * genug, dass niemand glaubt, die App sei kaputt. Vorher gab es hier gar
 * keine Grenze: Firestore-Abfragen laufen nicht in eine Zeitgrenze, sie
 * warten. Auf der iOS-Startbildschirm-App, die nach dem Aufwecken auf einer
 * toten Verbindung sitzt, hiess das „lädt gar nicht" — unbegrenzt.
 */
const START_FRIST_MS = 8000;

/**
 * Die zuletzt bekannte Firma je Anmeldung.
 *
 * WOFÜR: Profil und Firmendaten liefen bisher NACHEINANDER — erst
 * `users/{uid}`, dann mit der darin gefundenen `companyId` das
 * Firmendokument. Zwei Netzrunden, bevor das erste Pixel erscheint. Wer sich
 * schon einmal angemeldet hat, dessen Firma kennen wir aber bereits; damit
 * laufen beide Abfragen gleichzeitig.
 *
 * Das ist reine Beschleunigung, keine Quelle der Wahrheit: stimmt der Wert
 * nicht mit dem Profil überein, wird das richtige Dokument nachgeladen.
 */
const FIRMA_MERKER = 'perl.letzteFirma';

function gemerkteFirma(uid: string): string | null {
  try {
    return localStorage.getItem(`${FIRMA_MERKER}.${uid}`);
  } catch {
    // Privates Fenster oder blockierte Website-Daten: dann eben ohne.
    return null;
  }
}

function firmaMerken(uid: string, companyId: string): void {
  try {
    localStorage.setItem(`${FIRMA_MERKER}.${uid}`, companyId);
  } catch {
    /* nicht schlimm */
  }
}

/** Die Firma aus dem lokalen Zwischenspeicher — ohne Netz. */
async function firmaAusSpeicher(companyId: string): Promise<Company | null> {
  const snap = await getDocFromCache(doc(db, 'companies', companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Company, 'id'>) };
}

/**
 * Das Firmendokument schon laden, während das Profil noch unterwegs ist.
 *
 * Gibt `null` zurück, wenn die Firma noch nicht bekannt ist (erste Anmeldung
 * auf diesem Gerät) oder die Abfrage scheitert — dann wird sie danach
 * regulär geholt. Ein Fehler hier darf den Start nicht aufhalten: es ist ein
 * Vorgriff, keine Voraussetzung.
 */
function gemerktesFirmenDokument(uid: string): Promise<Company | null> {
  const id = gemerkteFirma(uid);
  if (!id) return Promise.resolve(null);
  return mitFristOder(getCompany(id), () => firmaAusSpeicher(id), START_FRIST_MS).catch(
    () => null,
  );
}

interface AuthState {
  user: CurrentUser | null;
  company: Company | null;
  loading: boolean;
  error: string | null;
  /** `remember: false` meldet beim Schließen des Browsers ab (Gemeinschaftsgerät). */
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Lädt die Mandanten-Stammdaten neu — nach dem Speichern in den Einstellungen. */
  reloadCompany: () => Promise<void>;
  /**
   * Ein globaler Administrator — angemeldet, aber in KEINEM Betrieb.
   *
   * Er hat kein `users`-Dokument und damit weder `companyId` noch Rolle;
   * `user` bleibt hier `null`, und jede Ansicht der App, die auf `user`
   * prüft, bleibt ihm folglich verschlossen. Er sieht genau eine Seite, und
   * die kann nur eines: Betriebe anlegen. Warum das so gebaut ist, steht in
   * `shared/plattform.ts`.
   */
  plattformAdmin: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Lädt das App-Profil (Rolle, companyId) zur Firebase-Auth-UID.
 *
 * Wichtig: users-Dokumente sind per `uid` als Dokument-ID geschlüsselt
 * (users/{uid}). Das ist nötig, damit der erste Profil-Load ein einzelnes
 * `get` ist — eine Query `where('uid','==',...)` ohne companyId-Filter würde
 * von firestore.rules abgelehnt (Mandanten-Constraint nicht erfüllbar).
 */
/** Deaktivierte Konten sollen sich nicht mehr anmelden können. */
export class InactiveUserError extends Error {
  constructor() {
    super('Dieses Konto ist deaktiviert.');
    this.name = 'InactiveUserError';
  }
}

/** Ein Profil aus einem Schnappschuss — gleich, ob er vom Netz oder aus dem
 *  Zwischenspeicher kommt. */
function profilAus(
  snap: { exists: () => boolean; id: string; data: () => unknown },
  uid: string,
  email: string,
): CurrentUser | null {
  if (!snap.exists()) return null;
  const data = snap.data() as {
    name?: string;
    role?: Role;
    companyId?: string;
    email?: string;
    active?: boolean;
  };
  if (!data.companyId || !data.role) return null;
  // Deaktivieren ist im Legacy der Ersatz fürs Löschen (Daten bleiben erhalten).
  // Ohne diese Prüfung könnte sich ein ausgeschiedener Mitarbeiter weiter anmelden.
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
 * Das Profil vom Server — mit Frist und Rückfall auf den Zwischenspeicher.
 */
async function profilVomServer(uid: string, email: string): Promise<CurrentUser | null> {
  const ref = doc(db, 'users', uid);
  const snap = await mitFristOder(getDoc(ref), () => getDocFromCache(ref), START_FRIST_MS);
  return profilAus(snap, uid, email);
}

/**
 * Das Profil aus dem lokalen Zwischenspeicher — ohne Netz, in Millisekunden.
 *
 * WARUM DAS ZUERST KOMMT. Vorher wartete der Start bis zu ACHT SEKUNDEN auf
 * eine Antwort des Servers und sah erst DANN im Zwischenspeicher nach.
 * Genau der lag aber schon die ganze Zeit bereit. Auf einer zähen Verbindung
 * — Keller, Baustelle, Tiefgarage — war das die gesamte gefühlte Ladezeit,
 * bei jedem einzelnen Start.
 *
 * Jetzt erscheint die App sofort mit dem letzten bekannten Stand und zieht
 * den aktuellen im Hintergrund nach. Ein veraltetes Profil ist dabei
 * ungefährlich: die harte Grenze steht serverseitig in den Regeln, und ein
 * deaktiviertes Konto wird auch hier abgewiesen.
 */
async function profilAusSpeicher(uid: string, email: string): Promise<CurrentUser | null> {
  try {
    return profilAus(await getDocFromCache(doc(db, 'users', uid)), uid, email);
  } catch (e) {
    // Ein deaktiviertes Konto muss auch aus dem Speicher heraus greifen —
    // sonst käme ein Ausgeschiedener offline noch einmal hinein.
    if (e instanceof InactiveUserError) throw e;
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [plattformAdmin, setPlattformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setError(null);
      if (!fbUser) {
        setUser(null);
        setCompany(null);
        setPlattformAdmin(false);
        setLoading(false);
        return;
      }
      setPlattformAdmin(false);
      // Während das Profil geladen wird, "loading" halten, damit der
      // Auth-Guard nicht fälschlich auf /login zurückspringt.
      setLoading(true);

      /**
       * DER GLOBALE ADMINISTRATOR WIRD GEPRÜFT, BEVOR IRGENDETWAS GELESEN
       * WIRD — und das ist keine Beschleunigung, sondern der Kern.
       *
       * Er hat absichtlich kein `users`-Dokument. Die Regel dafür lautet
       * `allow read: if ownsExisting()`, und `ownsExisting()` liest
       * `resource.data.companyId`. Bei einem Dokument, das es NICHT GIBT, ist
       * `resource` leer: die Regel ist damit nicht erfüllt, und Firestore
       * antwortet mit PERMISSION_DENIED. `getDoc` liefert also keinen leeren
       * Schnappschuss, sondern WIRFT.
       *
       * Genau daran ist der erste Anlauf gescheitert: die Prüfung stand
       * hinter dem Abruf, im Zweig „kein Profil gefunden". Dorthin kam der
       * globale Administrator nie — der Fehler landete im Auffangblock, und
       * auf dem Anmeldebildschirm stand „Das liegt meist am Empfang". Eine
       * Meldung, die auf ein Netzproblem zeigt, wo keines ist.
       *
       * `getIdTokenResult()` liest das bereits vorliegende Token; ohne
       * `forceRefresh` kostet das keine Netzrunde. Für alle anderen ändert
       * sich damit nichts ausser einem aufgelösten Promise.
       *
       * Das ist eine ANZEIGEFRAGE, keine Sicherheitsgrenze: die steht in den
       * firestore.rules und in der Function, die den Betrieb anlegt. Ein
       * gefälschter Claim brächte hier nur eine Seite zum Vorschein, auf der
       * jeder Knopf serverseitig abgewiesen würde.
       */
      const plattformMarke = await fbUser
        .getIdTokenResult()
        .then((t) => t.claims.plattformAdmin === true)
        .catch(() => false);
      if (plattformMarke) {
        setPlattformAdmin(true);
        setUser(null);
        setCompany(null);
        setLoading(false);
        return;
      }

      /**
       * ERST ZEIGEN, WAS DA IST — DANN NACHZIEHEN.
       *
       * Der Zwischenspeicher antwortet in Millisekunden, das Netz im Keller
       * in Sekunden. Wer sich gestern angemeldet hat, ist damit sofort drin;
       * der aktuelle Stand kommt still hinterher. Erst bei der ALLERERSTEN
       * Anmeldung auf einem Gerät gibt es nichts zu zeigen, und nur dann
       * wartet man noch.
       */
      let sofortDa = false;
      try {
        const schnell = await profilAusSpeicher(fbUser.uid, fbUser.email ?? '');
        if (schnell) {
          setUser(schnell);
          const firma = await firmaAusSpeicher(schnell.companyId).catch(() => null);
          if (firma) {
            setCompany(firma);
            applyBranding(firma);
          }
          setLoading(false);
          sofortDa = true;
        }
      } catch (e) {
        if (e instanceof InactiveUserError) {
          setError('Dieses Konto ist deaktiviert. Bitte an die Verwaltung wenden.');
          await fbSignOut(auth);
          setUser(null);
          setCompany(null);
          setLoading(false);
          return;
        }
      }

      try {
        /**
         * Beide Abfragen GLEICHZEITIG, wenn die Firma schon bekannt ist.
         *
         * Vorher liefen sie nacheinander: zwei volle Netzrunden, bevor
         * irgendetwas erschien. Auf dem Telefon im Keller ist das der
         * Unterschied zwischen „kurz" und „lange".
         */
        const gemerkt = gemerktesFirmenDokument(fbUser.uid);
        const [profile, firmaVorab] = await Promise.all([
          profilVomServer(fbUser.uid, fbUser.email ?? ''),
          gemerkt,
        ]);

        if (!profile) {
          /*
            Hier landet nur noch, wessen users-Dokument zwar LESBAR ist, aber
            keine companyId oder Rolle trägt. Der globale Administrator kommt
            nicht mehr hierher — er ist oben schon abgebogen, bevor überhaupt
            gelesen wurde.
          */
          setError(
            'Kein Benutzerprofil für dieses Konto gefunden. Bitte an die Verwaltung wenden.',
          );
          await fbSignOut(auth);
          setUser(null);
          setCompany(null);
        } else {
          setUser(profile);
          firmaMerken(profile.uid, profile.companyId);
          // Der vorab geladene Stand zählt nur, wenn er zum Profil passt —
          // sonst hätte ein Firmenwechsel die falschen Stammdaten gezeigt.
          const comp =
            firmaVorab && firmaVorab.id === profile.companyId
              ? firmaVorab
              : await mitFristOder(
                  getCompany(profile.companyId),
                  () => firmaAusSpeicher(profile.companyId),
                  START_FRIST_MS,
                );
          setCompany(comp);
          if (comp) applyBranding(comp);
        }
      } catch (e) {
        if (e instanceof InactiveUserError) {
          setError('Dieses Konto ist deaktiviert. Bitte an die Verwaltung wenden.');
          await fbSignOut(auth);
          setUser(null);
          setCompany(null);
        } else if (!sofortDa) {
          /**
           * Hierher führt vor allem ein Fall: erste Anmeldung auf diesem
           * Gerät, und das Netz antwortet nicht. Dann liegt auch nichts im
           * Zwischenspeicher, auf das man ausweichen könnte.
           *
           * `sofortDa` ist der Grund, warum diese Meldung fast nie mehr
           * erscheint: wer schon einmal angemeldet war, ARBEITET bereits,
           * während dieser Versuch noch läuft. Ihn dann mit einer Fehlertafel
           * zu unterbrechen wäre falsch — er hat ja alles, was er braucht.
           *
           * Die Firebase-Meldung wäre hier englisch und technisch („Failed
           * to get document because the client is offline"). Sie sagt dem
           * Monteur im Keller nichts — was er wissen muss, ist: es liegt am
           * Empfang, und Nachladen hilft.
           */
          setError(
            'Die Anmeldedaten konnten nicht geladen werden. Das liegt meist am Empfang — bitte erneut versuchen.',
          );
        }
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const signIn = useCallback(async (email: string, password: string, remember = true) => {
    setError(null);
    // Auf einem geteilten Baustellen-Tablet soll die Sitzung mit dem Browser
    // enden — deshalb ist die Dauer wählbar und nicht fest.
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  // Die Stammdaten liegen bewusst nicht auf einem Live-Abo: sie ändern sich
  // selten, und ein Abo auf `companies` hinge an jeder Sitzung. Nach dem
  // Speichern in den Einstellungen wird stattdessen gezielt nachgeladen.
  const reloadCompany = useCallback(async () => {
    if (!user) return;
    const comp = await getCompany(user.companyId);
    setCompany(comp);
    if (comp) applyBranding(comp);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        loading,
        error,
        signIn,
        signOut,
        resetPassword,
        reloadCompany,
        plattformAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden.');
  return ctx;
}
