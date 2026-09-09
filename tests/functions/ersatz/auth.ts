/**
 * `firebase-admin/auth` als Ersatz.
 *
 * Hier hängt eine Sicherheitszusage: ein deaktiviertes Konto muss serverseitig
 * gesperrt UND seine Sitzungstoken müssen widerrufen werden. Das ist von
 * außen unsichtbar — es passiert bei Google, nicht in der Datenbank. Der
 * Ersatz schreibt deshalb mit, WAS gerufen wurde.
 */

export interface AuthAufruf {
  art: 'claims' | 'update' | 'revoke' | 'anlegen' | 'loeschen' | 'ruecksetzlink';
  uid: string;
  daten?: unknown;
}

/** Die Konten, die es in diesem Lauf gibt — nach Auth-Kennung. */
export interface Konto {
  uid: string;
  email?: string;
  displayName?: string;
  customClaims?: Record<string, unknown>;
}

export const konten = new Map<string, Konto>();

/** Ein Konto vorgeben, das es schon gibt. */
export function kontoAnlegen(k: Konto) {
  konten.set(k.uid, { ...k });
}

let naechsteUid = 1;

export const authAufrufe: AuthAufruf[] = [];

export function authLeeren() {
  authAufrufe.length = 0;
  fehlerBei = null;
  konten.clear();
  naechsteUid = 1;
}

let fehlerBei: string | null = null;

/** Einen Fehlschlag bei Google nachstellen. */
export function authScheitertBei(art: string) {
  fehlerBei = art;
}

export function getAuth() {
  return {
    async setCustomUserClaims(uid: string, claims: unknown) {
      if (fehlerBei === 'claims') throw new Error('Auth nicht erreichbar');
      const k = konten.get(uid);
      if (k) k.customClaims = claims as Record<string, unknown>;
      authAufrufe.push({ art: 'claims', uid, daten: claims });
    },
    async updateUser(uid: string, daten: unknown) {
      if (fehlerBei === 'update') throw new Error('Auth nicht erreichbar');
      authAufrufe.push({ art: 'update', uid, daten });
    },
    async revokeRefreshTokens(uid: string) {
      if (fehlerBei === 'revoke') throw new Error('Auth nicht erreichbar');
      authAufrufe.push({ art: 'revoke', uid });
    },
    async getUser(uid: string) {
      const k = konten.get(uid);
      // Wie bei Google: ein unbekanntes Konto ist ein Fehler, keine Leere.
      if (!k) throw new Error('auth/user-not-found');
      return k;
    },
    async getUserByEmail(email: string) {
      const k = [...konten.values()].find((x) => x.email === email);
      if (!k) throw new Error('auth/user-not-found');
      return k;
    },
    async createUser(daten: {
      email?: string;
      displayName?: string;
      emailVerified?: boolean;
      password?: string;
    }) {
      if (fehlerBei === 'anlegen') throw new Error('Auth nicht erreichbar');
      const uid = `neu${naechsteUid++}`;
      const k: Konto = { uid, email: daten.email, displayName: daten.displayName };
      konten.set(uid, k);
      authAufrufe.push({ art: 'anlegen', uid, daten });
      return k;
    },
    async deleteUser(uid: string) {
      konten.delete(uid);
      authAufrufe.push({ art: 'loeschen', uid });
    },
    async generatePasswordResetLink(email: string) {
      authAufrufe.push({ art: 'ruecksetzlink', uid: email });
      return `https://example.invalid/passwort?mail=${encodeURIComponent(email)}`;
    },
  };
}
