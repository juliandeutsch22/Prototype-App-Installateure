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
  return (
    code === '42501' ||
    code.startsWith('23') ||
    code.startsWith('22') ||
    /*
      DIE ANFRAGE PASST NICHT ZUM SCHEMA — auch das ändert kein zweiter
      Versuch. `PGRST1xx` sind Anfragefehler, `PGRST2xx` Schemafehler
      („Spalte gibt es nicht", PGRST204); 42703 und 42P01 sagen dasselbe aus
      der Datenbank selbst. Bis zum 23.09.2026 landeten sie unter „unklar":
      die Maske meldete „gespeichert, wird gesendet", das Fach versuchte es
      fünfmal und gab dann still auf. So ging jede Fremdbuchung der
      Buchhaltung verloren (siehe `bearbeitungsvermerk.ts`).

      NICHT dabei: `PGRST0xx` (Verbindung zur Datenbank, Schemacache lädt
      noch) und `PGRST3xx` (abgelaufene Anmeldung) — die heilen sich.
    */
    /^PGRST[12]\d\d$/.test(code) ||
    code === '42703' ||
    code === '42P01'
  );
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
      const { error, status, count } =
        v.art === 'anlegen'
          ? // UPSERT, nicht INSERT: derselbe Vorgang darf zweimal ankommen.
            // Die Kennung kommt vom Gerät, deshalb trifft der zweite Versuch
            // dieselbe Zeile statt eine neue anzulegen.
            await client
              .from(v.tabelle)
              .upsert({ ...v.daten, id: v.zeile }, { onConflict: 'id', ignoreDuplicates: false })
          : // Mit Trefferzahl — siehe unten.
            await client.from(v.tabelle).update(v.daten, { count: 'exact' }).eq('id', v.zeile);

      /*
        EIN „ÄNDERN" OHNE TREFFER IST KEINE BESTÄTIGUNG (Prüflauf 25.09.2026,
        P1-22). Der Zeilenschutz antwortet auf eine Zeile, die man nicht
        ändern darf — oder die es nicht gibt —, nicht mit einem Fehler,
        sondern mit null getroffenen Zeilen. Das Fach räumte die Vormerkung
        dann als „gesendet" weg, und die Änderung war still verloren. Wie
        `kern.aendern`: null heisst abgelehnt, und das wird gemeldet.
      */
      if (!error && v.art === 'aendern' && count === 0) {
        return {
          art: 'abgelehnt',
          grund: `Kein Datensatz in ${v.tabelle} geändert — es gibt ihn nicht, oder er darf nicht geändert werden.`,
        };
      }
      if (!error) return { art: 'ok' };
      if (istNetzfehler(error)) return { art: 'kein-netz' };
      /*
        OHNE GÜLTIGE ANMELDUNG IST NICHTS ANGEKOMMEN (Prüflauf 25.09.2026,
        P1-05). PostgREST antwortet einem Aufruf ohne Sitzung mit 401 — auch
        dann, wenn der Code 42501 lautet, der sonst eine endgültige Ablehnung
        ist. Endgültig ist daran nichts: mit der Sitzung ihres Besitzers geht
        die Vormerkung durch. Also wie fehlendes Netz: liegen lassen, nicht
        zählen, später wieder.
      */
      if (status === 401) return { art: 'kein-netz' };
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
