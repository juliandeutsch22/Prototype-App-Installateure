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
/*
 * ZUSÄTZLICHE SCHALTER FÜR EINE PRÜFUNG (`?module=zeiterfassung.timer,…`):
 * so lässt sich etwa der Arbeitstag (Start/Stopp) in der Vorschau zeigen,
 * ohne die Beispielfirma für alle anderen Aufnahmen zu ändern.
 */
const MODULE = (new URLSearchParams(location.search).get('module') ?? '').split(',').filter(Boolean);
/*
 * EIN LOGO FÜR DIE PRÜFUNG (`?logo=data:image/png;base64,…`, E100): so
 * zeigt die Vorschau den Kopf mit hinterlegtem Logo, ohne die Beispielfirma
 * für alle anderen Aufnahmen zu ändern.
 */
const LOGO = new URLSearchParams(location.search).get('logo');
const FIRMA = {
  ...firma,
  ...(MODULE.length ? { modules: { ...firma.modules, ...Object.fromEntries(MODULE.map((m) => [m, true])) } } : {}),
  ...(LOGO ? { logoUrl: LOGO } : {}),
};

const WERT = {
  user: { uid: 'u1', name: benutzer[0].name, email: benutzer[0].email, role: ROLLE, companyId: 'perl' },
  company: FIRMA,
  loading: false,
  error: null,
  plattformAdmin: ROLLE === 'Plattformadministrator',
  einblickStarten: async () => {},
  // Runde 3, H1: in der Vorschau verlangt niemand einen zweiten Faktor.
  zweiterFaktor: 'keiner',
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
