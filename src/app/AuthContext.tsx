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
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getCompany } from '@/lib/db/company';
import { applyBranding } from '@/lib/tenant';
import type { CurrentUser, Company, Role } from '@/types';

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
  const snap = await getDoc(doc(db, 'users', uid));
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
        const profile = await loadProfile(fbUser.uid, fbUser.email ?? '');
        if (!profile) {
          setError(
            'Kein Benutzerprofil für dieses Konto gefunden. Bitte an die Verwaltung wenden.',
          );
          await fbSignOut(auth);
          setUser(null);
          setCompany(null);
        } else {
          setUser(profile);
          const comp = await getCompany(profile.companyId);
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
          setError(e instanceof Error ? e.message : 'Profil konnte nicht geladen werden.');
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
