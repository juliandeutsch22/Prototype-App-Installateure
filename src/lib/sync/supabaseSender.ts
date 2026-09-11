/**
 * Der Sender: aus einer Vormerkung wird ein Aufruf an Supabase.
 *
 * Die ganze Klugheit steckt in der EINORDNUNG der Fehler. Das Ausgangsfach
 * trifft seine Entscheidungen — wegwerfen, wiederholen, liegen lassen —
 * ausschliesslich anhand dieser vier Fälle, und eine falsche Einordnung ist
 * teuer in beide Richtungen:
 *
 *   Eine Ablehnung als „kein Netz" zu lesen hiesse, für immer eine Zeile
 *   nachzusenden, die der Server nie annehmen wird.
 *
 *   Fehlendes Netz als Ablehnung zu lesen hiesse, dem Monteur eine Buchung
 *   für verloren zu erklären, die in Wahrheit nur wartet.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sendeergebnis, Sender, Sendung } from './ausgangsfach';

/**
 * PostgREST-Codes, die eine endgültige Ablehnung bedeuten.
 *
 * `42501` ist die abgewiesene Zeilenschutz-Regel, `23xxx` sind die
 * Beschränkungen der Tabelle (Fremdschlüssel, Prüfbedingung, Eindeutigkeit).
 * Alle drei ändern sich nicht dadurch, dass man es nochmal versucht.
 */
function istEndgueltig(code: string | undefined): boolean {
  if (!code) return false;
  return code === '42501' || code.startsWith('23') || code.startsWith('22');
}

/**
 * Ein Fehler ohne Code und ohne Antwort ist ein Netzfehler.
 *
 * supabase-js reicht einen gescheiterten `fetch` als Fehler ohne `code`
 * durch. Genau daran — und nicht an `navigator.onLine`, das im WLAN ohne
 * Internet fröhlich `true` meldet — hängt die Unterscheidung.
 */
function istNetzfehler(fehler: { code?: string; message?: string }): boolean {
  if (fehler.code) return false;
  const m = (fehler.message ?? '').toLowerCase();
  return m.includes('fetch') || m.includes('network') || m.includes('failed to');
}

export function supabaseSender(client: SupabaseClient): Sender {
  return async (v: Sendung): Promise<Sendeergebnis> => {
    try {
      const { error } =
        v.art === 'anlegen'
          ? // UPSERT, nicht INSERT: derselbe Vorgang darf zweimal ankommen.
            // Die Kennung kommt vom Gerät, deshalb trifft der zweite Versuch
            // dieselbe Zeile statt eine neue anzulegen.
            await client
              .from(v.tabelle)
              .upsert({ ...v.daten, id: v.zeile }, { onConflict: 'id', ignoreDuplicates: false })
          : await client.from(v.tabelle).update(v.daten).eq('id', v.zeile);

      if (!error) return { art: 'ok' };
      if (istNetzfehler(error)) return { art: 'kein-netz' };
      if (istEndgueltig(error.code)) {
        return { art: 'abgelehnt', grund: error.message || `Abgelehnt (${error.code})` };
      }
      return { art: 'unklar', grund: error.message || `Fehler (${error.code})` };
    } catch (e) {
      // Wirft der Client selbst, ist praktisch immer das Netz schuld.
      const f = e as { code?: string; message?: string };
      return istNetzfehler(f) ? { art: 'kein-netz' } : { art: 'unklar', grund: String(f.message ?? e) };
    }
  };
}
