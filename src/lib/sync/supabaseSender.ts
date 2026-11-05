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
import { istNetzfehler } from './netzfehler';

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

/** Netzfehler erkennen: `netzfehler.ts` — auch die Maske des Scheins fragt dort. */

/** Ein Fehler der Datenbank (Tabelle oder Funktion) in einen der vier Fälle. */
function einordnen(
  error: { code?: string; message?: string },
  status: number | undefined,
): Sendeergebnis {
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
}

/**
 * Ein Fehler des Dateispeichers in einen der vier Fälle (E49).
 *
 * Der Speicher spricht anders als PostgREST: keinen Datenbankcode, sondern
 * einen HTTP-Stand. Ohne Stand ist nichts angekommen; eine abgelaufene
 * Anmeldung („jwt“) heilt sich mit der nächsten Sitzung; Serverfehler,
 * Zeitüberschreitung und Drosselung sind unklar. Alles Übrige — eine
 * Speicherregel greift, die Datei ist zu groß, die Anfrage passt nicht —
 * ändert kein zweiter Versuch.
 */
function speicherEinordnen(fehler: { message?: string; status?: number; statusCode?: string }): Sendeergebnis {
  const status = fehler.status ?? (Number(fehler.statusCode) || undefined);
  const m = (fehler.message ?? '').toLowerCase();
  if (!status) {
    return istNetzfehler({ message: fehler.message })
      ? { art: 'kein-netz' }
      : { art: 'unklar', grund: fehler.message || 'Der Speicher hat nicht geantwortet.' };
  }
  if (status === 401 || m.includes('jwt')) return { art: 'kein-netz' };
  if (status >= 500 || status === 408 || status === 429) {
    return { art: 'unklar', grund: fehler.message || `Speicherfehler (${status})` };
  }
  return { art: 'abgelehnt', grund: fehler.message || `Vom Speicher abgelehnt (${status})` };
}

/**
 * DIE AUFRUFE, DIE OHNE EMPFANG VORGEMERKT WERDEN DÜRFEN (E49) — einzeln
 * aufgezählt, damit die Liste nicht still wächst.
 *
 * Nachsenden lässt sich nur, was beim zweiten Mal dasselbe tut und nichts
 * vom Stand des Servers zum Zeitpunkt des Sendens abhängig macht (siehe den
 * Kopf von `ohneEmpfang.ts`):
 *
 *   `schein_speichern` legt den Entwurf unter der Kennung vom Gerät an oder
 *   schreibt ihn; Zeiten, Material und Fotos ersetzt es jeweils als ganze
 *   Liste. Zweimal gesendet steht danach dasselbe da.
 *
 *   `schein_unterschreiben` friert den Schein ein. Ein zweites Mal weist die
 *   Datenbank ab, weil er schon eingefroren ist — trägt er GENAU DIESE
 *   Unterschriften, ist das aber die erste Zustellung, deren Antwort im
 *   Funkloch verloren ging (`schonUnterschrieben`).
 *
 * Eine Funktion, die einen Lagerstand verrechnet oder eine Nummer zieht,
 * gehört nicht hierher.
 */
export const AUFRUFE_OHNE_EMPFANG = ['schein_speichern', 'schein_unterschreiben'] as const;
/** Die Eimer, in die ohne Empfang hochgeladen werden darf — Dateien unter ihrem Inhalts-Hash. */
export const EIMER_OHNE_EMPFANG = ['scheinfotos'] as const;

interface Unterschrift { name?: string; geraetZeit?: number }

/**
 * Trägt der Schein schon genau diese Unterschriften? Dann ist ein
 * abgewiesenes zweites Unterschreiben in Wahrheit angekommen.
 *
 * Verglichen werden Name und Gerätezeit beider Unterschriften: die Zeit ist
 * die des Augenblicks vor dem Kunden, auf die Millisekunde, und kommt in
 * keiner zweiten Unterschrift wieder. Das Bild bleibt dabei auf dem Server —
 * es wiegt rund 70 KB.
 *
 * `null` heißt: nicht feststellbar (kein Netz, Serverfehler). Dann wird
 * nichts verworfen, sondern später wieder gefragt.
 */
async function schonUnterschrieben(
  client: SupabaseClient,
  id: string,
  monteur: Unterschrift,
  kunde: Unterschrift,
): Promise<boolean | null> {
  const { data, error } = await client
    .from('work_sheets')
    .select(
      'status, monteur_name:unterschrift_monteur->>name, monteur_zeit:unterschrift_monteur->geraetZeit, ' +
        'kunde_name:unterschrift_kunde->>name, kunde_zeit:unterschrift_kunde->geraetZeit',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  const s = data as unknown as {
    status: string; monteur_name: string | null; monteur_zeit: number | null;
    kunde_name: string | null; kunde_zeit: number | null;
  } | null;
  return (
    !!s &&
    s.status === 'Unterschrieben' &&
    s.monteur_name === monteur.name &&
    Number(s.monteur_zeit) === monteur.geraetZeit &&
    s.kunde_name === kunde.name &&
    Number(s.kunde_zeit) === kunde.geraetZeit
  );
}

async function aufrufSenden(client: SupabaseClient, v: Sendung): Promise<Sendeergebnis> {
  const { funktion, parameter } = v.daten as { funktion?: string; parameter?: Record<string, unknown> };
  if (!funktion || !parameter || !(AUFRUFE_OHNE_EMPFANG as readonly string[]).includes(funktion)) {
    return { art: 'abgelehnt', grund: `Der Aufruf „${funktion ?? '?'}“ wird nicht nachgesendet.` };
  }
  const { error, status } = await client.rpc(funktion, parameter);
  if (!error) return { art: 'ok' };
  const ergebnis = einordnen(error, status);
  if (funktion === 'schein_unterschreiben' && ergebnis.art === 'abgelehnt') {
    const schon = await schonUnterschrieben(
      client,
      String(parameter.p_id),
      parameter.p_monteur as Unterschrift,
      parameter.p_kunde as Unterschrift,
    );
    if (schon === true) return { art: 'ok' };
    if (schon === null) return { art: 'unklar', grund: ergebnis.grund };
  }
  return ergebnis;
}

async function dateiSenden(client: SupabaseClient, v: Sendung): Promise<Sendeergebnis> {
  const d = v.daten as { eimer?: string; pfad?: string; pfade?: string[]; inhalt?: ArrayBuffer; inhaltsart?: string };
  if (!d.eimer || !(EIMER_OHNE_EMPFANG as readonly string[]).includes(d.eimer)) {
    return { art: 'abgelehnt', grund: `In den Eimer „${d.eimer ?? '?'}“ wird nicht nachgesendet.` };
  }
  const eimer = client.storage.from(d.eimer);
  if (v.art === 'hochladen') {
    if (!d.pfad || !d.inhalt) return { art: 'abgelehnt', grund: 'Die vorgemerkte Datei fehlt.' };
    const datei = new Blob([d.inhalt], { type: d.inhaltsart });
    // `upsert`: ein zweites Hochladen nach einem Abbruch schreibt dieselbe Datei an dieselbe Stelle.
    const { error } = await eimer.upload(d.pfad, datei, { contentType: d.inhaltsart, upsert: true });
    return error ? speicherEinordnen(error) : { art: 'ok' };
  }
  const { error } = await eimer.remove(d.pfade ?? []);
  if (!error) return { art: 'ok' };
  const ergebnis = speicherEinordnen(error);
  /*
    EIN BILD, DAS SICH NICHT ENTFERNEN LÄSST, IST KEIN VERLUST. So hielt es
    die Maske schon vorher: der Monteur wollte es aus dem Schein haben, und
    dort ist es nicht mehr. Nur ohne Netz bleibt das Entfernen liegen.
  */
  return ergebnis.art === 'abgelehnt' ? { art: 'ok' } : ergebnis;
}

export function supabaseSender(client: SupabaseClient): Sender {
  return async (v: Sendung): Promise<Sendeergebnis> => {
    try {
      // Während der Tabsperre kann das Konto gewechselt worden sein. Fremde
      // Vormerkungen bleiben dann liegen, statt durch RLS endgültig zu scheitern.
      if (v.uid) {
        const { data } = await client.auth.getSession();
        if (data.session?.user.id !== v.uid) return { art: 'kein-netz' };
      }
      if (v.art === 'aufruf') return await aufrufSenden(client, v);
      if (v.art === 'hochladen' || v.art === 'entfernen') return await dateiSenden(client, v);
      const { error, status, count } =
        v.art === 'anlegen'
          ? // Wiederholte Anlagen dürfen spätere Änderungen nicht überschreiben.
            await client
              .from(v.tabelle)
              .upsert({ ...v.daten, id: v.zeile }, { onConflict: 'id', ignoreDuplicates: true })
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
      return einordnen(error, status);
    } catch (e) {
      // Wirft der Client selbst, ist praktisch immer das Netz schuld.
      const f = e as { code?: string; message?: string };
      return istNetzfehler(f) ? { art: 'kein-netz' } : { art: 'unklar', grund: String(f.message ?? e) };
    }
  };
}
