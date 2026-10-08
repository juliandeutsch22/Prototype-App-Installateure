import type { ReactNode } from 'react';
import { firma, benutzer } from '../../../tools/vorschau/daten';

/*
 * Ersatz für `AuthContext` in der Bestandsaufnahme (Umbau „Lot“, Phase A).
 *
 * WARUM NICHT DER STUB DER VORSCHAU. Der kennt nur die Rolle. Das Protokoll
 * verlangt aber auch Freigaben, den Lehrling, den globalen Admin und den
 * Supportmodus — alles Dinge, die die Oberfläche allein aus `useAuth()`
 * liest. Die Vorschau selbst bleibt unverändert; diese Datei hängt nur die
 * Bestandsaufnahme ein (`vite.bestand.config.ts`).
 *
 * Abfrageparameter (alle ausser `rolle` wahlweise):
 *   rolle=Verwaltung
 *   freigaben=kundenPflegen,katalogEinspielen,einkaufSehen,rechnungenLesen,fuehrtZeitkonto
 *   einstufung=lehrling
 *   betrieb=wochenplanFuerAlle,projektleitungImEinsatzplan
 *   plattform=1                 (globaler Admin: kein Betrieb, keine Rolle)
 *   einblick=ansehen|mitarbeiten (Supportmodus; Profil wie in AuthContext: Administrator)
 *
 * EIN STABILES OBJEKT, EINMAL GEBAUT — aus demselben Grund wie in
 * `tools/vorschau/AuthStub.tsx`: ein frisches Objekt je Aufruf liesse jede
 * Ansicht endlos neu laden.
 */
const q = new URLSearchParams(location.search);
const liste = (name: string) => (q.get(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const freigaben = Object.fromEntries(liste('freigaben').map((f) => [f, true]));
const betrieb = Object.fromEntries(liste('betrieb').map((f) => [f, true]));
const plattform = q.get('plattform') === '1';
const stufe = q.get('einblick');

const einblick = stufe
  ? {
      id: 'f1', company_id: 'perl', name: firma.name, grund: 'Rückfrage zur Rechnung 2026-0231',
      notzugang: false, stufe, gilt_bis: '2026-10-08T18:00:00Z',
    }
  : null;

const WERT = {
  user: plattform
    ? null
    : {
        uid: 'u1', docId: 'u1', name: benutzer[0].name, email: benutzer[0].email,
        role: einblick ? 'Administrator' : (q.get('rolle') ?? 'Administrator'),
        companyId: 'perl',
        einstufung: q.get('einstufung') ?? null,
        ...freigaben,
      },
  company: plattform ? null : { ...firma, ...betrieb },
  loading: false,
  error: null,
  plattformAdmin: plattform || !!einblick,
  einblick,
  einblickStarten: () => {},
  einblickBeenden: () => {},
  zweiterFaktor: 'keiner',
  signIn: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
  reloadCompany: async () => {},
} as never;

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Wie in AuthContext.tsx: der Ersatz muss Anbieter und Haken aus EINER Datei liefern.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return WERT;
}
