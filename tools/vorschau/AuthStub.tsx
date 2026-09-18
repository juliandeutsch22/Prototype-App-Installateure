import type { ReactNode } from 'react';
import { firma, benutzer } from './daten';

/*
 * EIN STABILES OBJEKT, EINMAL GEBAUT.
 *
 * Gaebe `useAuth` bei jedem Aufruf ein frisches Objektliteral zurueck, aendert
 * sich die Identitaet von `user` bei jedem Render — und jede Ansicht haengt
 * ihre Effekte daran. Die Abos liefen dann endlos neu auf und setzten
 * `loading` immer wieder auf wahr; die Listen blieben im Ladezustand stehen,
 * obwohl die Daten laengst da waren. Genau darauf bin ich beim Bauen dieser
 * Vorschau hereingefallen.
 */
const ROLLE = new URLSearchParams(location.search).get('rolle') ?? 'Administrator';

const WERT = {
  user: { uid: 'u1', name: benutzer[0].name, email: benutzer[0].email, role: ROLLE, companyId: 'perl' },
  company: firma,
  loading: false,
  error: null,
  plattformAdmin: false,
  signIn: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
  reloadCompany: async () => {},
} as never;

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  return WERT;
}
