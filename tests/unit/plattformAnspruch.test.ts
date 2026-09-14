/**
 * Nur der WÖRTLICHE Anspruch zählt — in beiden Anmeldungen.
 *
 * WARUM DAS EIGENS GEPRÜFT WIRD. Der Plattform-Anspruch entscheidet, ob
 * jemand die Seite zu sehen bekommt, auf der Betriebe entstehen. Er ist eine
 * ANZEIGEFRAGE und keine Sicherheitsgrenze — die steht in den Zeilenregeln
 * und in der Edge Function. Trotzdem: ein `'ja'`, eine `1` oder ein
 * `'false'` als Zeichenkette sind alle wahrheitswertig wahr, und ein
 * `if (anspruch)` liesse sie durch. Verglichen wird deshalb gegen `true`.
 *
 * Beide Fassungen einzeln, weil sie die Angabe an verschiedenen Stellen
 * lesen: Firebase im Token-Ergebnis, Supabase im `app_metadata` der Sitzung.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let claims: Record<string, unknown> = {};
let appMetadata: Record<string, unknown> = {};

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  setPersistence: vi.fn(),
  browserLocalPersistence: {},
  browserSessionPersistence: {},
  createUserWithEmailAndPassword: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn(), getDocFromCache: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({
  db: {},
  getSecondaryAuth: vi.fn(),
  auth: {
    get currentUser() {
      return { getIdTokenResult: () => Promise.resolve({ claims }) };
    },
  },
}));
vi.mock('@/lib/supabase', () => ({
  merkenSetzen: vi.fn(),
  supabaseClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { app_metadata: appMetadata } } } }),
    },
  }),
}));

const firebase = await import('@/lib/auth/fs/sitzung');
const postgres = await import('@/lib/auth/pg/sitzung');

beforeEach(() => {
  claims = {};
  appMetadata = {};
});

describe('Der Plattform-Anspruch auf Firebase', () => {
  it('gilt bei `true`', async () => {
    claims = { plattformAdmin: true };
    expect(await firebase.istPlattformAdmin()).toBe(true);
  });

  it('gilt NICHT bei einem wahrheitswertig wahren Wert', async () => {
    for (const wert of ['ja', 1, 'true', {}, [1]]) {
      claims = { plattformAdmin: wert };
      expect({ wert, anspruch: await firebase.istPlattformAdmin() })
        .toEqual({ wert, anspruch: false });
    }
  });

  it('gilt nicht, wenn er fehlt', async () => {
    expect(await firebase.istPlattformAdmin()).toBe(false);
  });
});

describe('Der Plattform-Anspruch auf Supabase', () => {
  it('gilt bei `true`', async () => {
    appMetadata = { plattform_admin: true };
    expect(await postgres.istPlattformAdmin()).toBe(true);
  });

  it('gilt NICHT bei einem wahrheitswertig wahren Wert', async () => {
    for (const wert of ['ja', 1, 'true', {}, [1]]) {
      appMetadata = { plattform_admin: wert };
      expect({ wert, anspruch: await postgres.istPlattformAdmin() })
        .toEqual({ wert, anspruch: false });
    }
  });

  it('gilt nicht, wenn er fehlt', async () => {
    expect(await postgres.istPlattformAdmin()).toBe(false);
  });
});
