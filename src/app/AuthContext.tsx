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

async function loadProfile(uid: string, email: string): Promise<CurrentUser | null> {
  const ref = doc(db, 'users', uid);
  // Antwortet das Netz nicht rechtzeitig, gilt der zuletzt gespeicherte
  // Stand. Er ist besser als ein Ladebalken ohne Ende — und die harte Grenze
  // steht ohnehin serverseitig: mit einem veralteten Profil kommt niemand an
  // Daten, die ihm die Regeln verweigern.
  const snap = await mitFristOder(getDoc(ref), () => getDocFromCache(ref), START_FRIST_MS);
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setError(null);
      if (!fbUser) {
        setUser(null);
        setCompany(null);
        setLoading(false);
        return;
      }
      // Während das Profil geladen wird, "loading" halten, damit der
      // Auth-Guard nicht fälschlich auf /login zurückspringt.
      setLoading(true);
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
          loadProfile(fbUser.uid, fbUser.email ?? ''),
          gemerkt,
        ]);

        if (!profile) {
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
        } else {
          /**
           * Hierher führt vor allem ein Fall: erste Anmeldung auf diesem
           * Gerät, und das Netz antwortet nicht. Dann liegt auch nichts im
           * Zwischenspeicher, auf das man ausweichen könnte.
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
      value={{ user, company, loading, error, signIn, signOut, resetPassword, reloadCompany }}
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
