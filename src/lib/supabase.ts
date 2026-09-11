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
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return gemerkt;
}
