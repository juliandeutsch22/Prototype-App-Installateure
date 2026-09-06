/**
 * `firebase-admin/auth` als Ersatz.
 *
 * Hier hängt eine Sicherheitszusage: ein deaktiviertes Konto muss serverseitig
 * gesperrt UND seine Sitzungstoken müssen widerrufen werden. Das ist von
 * außen unsichtbar — es passiert bei Google, nicht in der Datenbank. Der
 * Ersatz schreibt deshalb mit, WAS gerufen wurde.
 */

export interface AuthAufruf {
  art: 'claims' | 'update' | 'revoke';
  uid: string;
  daten?: unknown;
}

export const authAufrufe: AuthAufruf[] = [];

export function authLeeren() {
  authAufrufe.length = 0;
  fehlerBei = null;
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
  };
}
