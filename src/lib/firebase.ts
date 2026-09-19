import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';

/**
 * Was von Firebase übrig ist: der Versandweg für Push-Meldungen.
 *
 * AM 19.09.2026 IST DER REST ABGEBAUT WORDEN — Firestore, die Anmeldung und
 * vierzehn Cloud Functions. Die Daten liegen in Postgres, die Anmeldung bei
 * Supabase Auth, und was die Functions taten, tun jetzt Datenbankfunktionen,
 * Trigger, `pg_cron` und drei Edge Functions.
 *
 * WARUM FIREBASE TROTZDEM NICHT GANZ GEHT. Eine Push-Meldung an ein Telefon
 * braucht einen Dienst, den Apple und Google akzeptieren; Supabase hat dafür
 * keinen Ersatz. Der VERSAND läuft deshalb weiter über FCM — ausgelöst von
 * einem Postgres-Trigger, verschickt von der Edge Function `push-melden`.
 *
 * WAS DIESE DATEI NOCH TUT, ist die andere Hälfte davon: der Browser muss
 * sein Gerät bei FCM anmelden und bekommt dafür eine Kennung, die in
 * `user_prefs` landet. Dafür braucht das SDK eine eingerichtete App — mehr
 * nicht. Siehe `lib/push.ts`.
 *
 * DIE KONFIGURATION KOMMT AUSSCHLIESSLICH AUS DER UMGEBUNG. Kein
 * kundenspezifischer Wert steht im Quelltext.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/*
  OHNE SCHLÜSSEL KEINE AUSNAHME, SONDERN KEIN PUSH.

  Bis zum Abbau warf diese Datei beim Laden, wenn die Konfiguration fehlte —
  richtig, solange die halbe App daran hing: eine App, die ohne Datenbank
  startet und erst beim ersten Speichern scheitert, kostet mehr Zeit.

  Jetzt hängt nur noch die Push-Anmeldung daran. Ein Betrieb, der keine
  Meldungen aufs Telefon will, soll die App deshalb nicht weniger benutzen
  können — er bekommt schlicht keine. `lib/push.ts` fragt `istEingerichtet()`
  und meldet dem Benutzer „nicht verfügbar", statt die App anzuhalten.
*/
export function istEingerichtet(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let zwischengespeichert: FirebaseApp | null = null;

/** Die eingerichtete App — `null`, wenn keine Zugangsdaten hinterlegt sind. */
export function firebaseApp(): FirebaseApp | null {
  if (!istEingerichtet()) return null;
  if (!zwischengespeichert) {
    zwischengespeichert = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return zwischengespeichert;
}
