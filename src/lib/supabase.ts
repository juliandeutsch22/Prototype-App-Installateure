/**
 * Der Supabase-Client.
 *
 * Gegenstück zu `src/lib/firebase.ts`. Solange der Umzug läuft, stehen beide
 * nebeneinander: die Ansichten sprechen weiter mit der Datenschicht, und die
 * Datenschicht sucht sich modulweise aus, wohin sie greift.
 *
 * ERST BEIM ERSTEN GEBRAUCH, nicht beim Import. Ein Modul, das schon beim
 * Laden nach Zugangsdaten verlangt, reisst jeden Test mit, der auch nur einen
 * Typ aus seiner Nachbarschaft braucht — und zwingt dazu, überall Umgebungs-
 * variablen zu setzen, wo gar keine Verbindung aufgebaut wird.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let gemerkt: SupabaseClient | null = null;

/**
 * OB DIE SITZUNG DEN BROWSER ÜBERLEBT — die Entsprechung zu Firebases
 * `browserLocalPersistence` gegen `browserSessionPersistence`.
 *
 * Auf einem geteilten Baustellen-Tablet soll sie mit dem Browser enden; auf
 * dem eigenen Telefon nicht. Supabase kennt diese Wahl nicht beim Anmelden,
 * sondern nur beim Erzeugen des Clients — deshalb entscheidet hier ein
 * Adapter bei JEDEM Zugriff neu, wohin geschrieben wird.
 *
 * Der Merker selbst liegt im `localStorage`, denn er muss den Neustart
 * überleben: sonst läge die Sitzung im `sessionStorage` und der Adapter
 * suchte sie beim nächsten Start im `localStorage`.
 */
const MERKER = 'perl.sitzungMerken';

export function merkenSetzen(merken: boolean): void {
  try {
    localStorage.setItem(MERKER, merken ? 'ja' : 'nein');
  } catch {
    /* privates Fenster: dann eben die Vorgabe */
  }
}

function zielSpeicher(): Storage {
  try {
    return localStorage.getItem(MERKER) === 'nein' ? sessionStorage : localStorage;
  } catch {
    /*
      Blockierte Website-Daten. `sessionStorage` ist hier die sichere Seite:
      schlimmstenfalls muss man sich nach dem Schliessen neu anmelden — die
      andere Richtung hiesse, eine Sitzung dort zu lassen, wo sie nicht
      hingehört.
    */
    return sessionStorage;
  }
}

/** Der Adapter, den supabase-js für die Sitzung benutzt. */
const sitzungsSpeicher = {
  getItem: (schluessel: string) => {
    try { return zielSpeicher().getItem(schluessel); } catch { return null; }
  },
  setItem: (schluessel: string, wert: string) => {
    try { zielSpeicher().setItem(schluessel, wert); } catch { /* egal */ }
  },
  removeItem: (schluessel: string) => {
    try { zielSpeicher().removeItem(schluessel); } catch { /* egal */ }
  },
};

export function supabaseClient(): SupabaseClient {
  if (gemerkt) return gemerkt;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const schluessel = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !schluessel) {
    // Sichtbarer Fehler statt stillem Abbruch: eine App, die sich ohne
    // Zugangsdaten startet und erst beim ersten Speichern scheitert, kostet
    // mehr Zeit als eine, die gleich sagt, was fehlt.
    throw new Error(
      'VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen — siehe docs/DEPLOYMENT.md',
    );
  }

  gemerkt = createClient(url, schluessel, {
    auth: {
      // Die Sitzung überlebt den Neustart der App — wie bei Firebase Auth.
      // WO sie liegt, entscheidet `sitzungsSpeicher` bei jedem Zugriff neu.
      persistSession: true,
      autoRefreshToken: true,
      storage: sitzungsSpeicher,
      /*
        DIE SITZUNG AUS DER ADRESSZEILE HOLEN. Der Link, mit dem jemand sein
        Passwort setzt, trägt das Token im Fragment. Ohne das hier landete er
        auf der Anmeldemaske und könnte nichts setzen.
      */
      detectSessionInUrl: true,
    },
  });
  return gemerkt;
}
