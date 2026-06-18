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
} from 'firebase/auth';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { applyBranding } from '@/lib/tenant';
import type { CurrentUser, Company, Role } from '@/types';

interface AuthState {
  user: CurrentUser | null;
  company: Company | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Lädt das App-Profil (Rolle, companyId) zur Firebase-Auth-UID.
 * Die Legacy-App fragt `users` per `where('uid','==', ...)` ab — beibehalten.
 */
async function loadProfile(uid: string, email: string): Promise<CurrentUser | null> {
  const snap = await getDocs(query(collection(db, 'users'), where('uid', '==', uid)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data() as { name?: string; role?: Role; companyId?: string; email?: string };
  if (!data.companyId || !data.role) return null;
  return {
    uid,
    email: data.email ?? email,
    name: data.name ?? email,
    role: data.role,
    companyId: data.companyId,
    docId: d.id,
  };
}

async function loadCompany(companyId: string): Promise<Company | null> {
  const ref = doc(db, 'companies', companyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Company, 'id'>) };
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
          const comp = await loadCompany(profile.companyId);
          setCompany(comp);
          if (comp) applyBranding(comp);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Profil konnte nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider value={{ user, company, loading, error, signIn, signOut }}>
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
