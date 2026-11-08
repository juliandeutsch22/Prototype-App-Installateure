/**
 * Entfernt Dateien der Nachrichten aus dem Speicher (M10/B09, E63).
 *
 * WARUM ES DAFÜR EINE FUNCTION BRAUCHT. Die Datenbank kann eine Datei im
 * Speicher nicht selbst entfernen: eine Zeile in `storage.objects` per SQL zu
 * löschen ist gesperrt, und es ließe die Datei selbst liegen — ohne Zeile,
 * die auf sie zeigt. Löschen heißt bei Nachrichten aber wirklich löschen
 * (D2, „Löschen löscht“). Also geht es über die Speicher-Schnittstelle, mit
 * dem Dienstschlüssel, und den hat nur eine Edge Function.
 *
 * WAS SIE ENTFERNT, entscheidet die Datenbank (`nachrichten_dateien_offen`):
 * vorgemerkte Anhänge gelöschter Nachrichten, Runden und Personen, dazu
 * verwaiste Dateien älter als sieben Tage — nie eine Datei, an der noch ein
 * Anhang oder eine Meldung hängt. Hier steht nur das Handwerk: holen,
 * entfernen, zurückmelden.
 *
 * ANGESTOSSEN gleich nach dem Löschen (`app.nachrichten_aufraeumen_anstossen`)
 * und jede Nacht (`nachrichten-nachtlauf`) — scheitert der erste Anstoß,
 * holt es der zweite nach. Sie liest und schreibt keinen Nachrichtentext,
 * und sie protokolliert keinen Pfad.
 */
import {
  alleDienstSchluessel, dienstKopfzeilen, rufDerMaschine, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const alsDienst = dienstKopfzeilen(DIENST);

/** Je Lauf höchstens so viele Runden zu je 200 Dateien — der Rest kommt mit dem nächsten Anstoß. */
const RUNDEN = 10;

const antwort = (inhalt: unknown, status = 200) =>
  new Response(JSON.stringify(inhalt), { status, headers: { 'Content-Type': 'application/json' } });

interface Datei { eimer: string; pfad: string }

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return antwort({ error: 'Nur POST.' }, 405);
  if (!DIENST) return antwort({ error: SCHLUESSEL_FEHLT }, 503);
  // Angestossen wird ausschliesslich von der Datenbank, mit dem Dienstschlüssel.
  if (!rufDerMaschine(req.headers.get('Authorization') ?? '', req.headers.get('apikey') ?? '', SCHLUESSEL)) {
    return antwort({ error: 'Nur der Dienst.' }, 401);
  }
  await req.body?.cancel().catch(() => undefined);

  let entfernt = 0;
  for (let runde = 0; runde < RUNDEN; runde += 1) {
    const liste = await fetch(`${URL_BASIS}/rest/v1/rpc/nachrichten_dateien_offen`, {
      method: 'POST', headers: alsDienst, body: JSON.stringify({ p_anzahl: 200 }),
    });
    if (!liste.ok) {
      await liste.body?.cancel();
      return antwort({ error: 'Die Liste der Dateien ließ sich nicht lesen.', entfernt }, 502);
    }
    const dateien = (await liste.json()) as Datei[];
    if (dateien.length === 0) break;

    const jeEimer = new Map<string, string[]>();
    for (const d of dateien) jeEimer.set(d.eimer, [...(jeEimer.get(d.eimer) ?? []), d.pfad]);
    const erledigt: Datei[] = [];
    for (const [eimer, pfade] of jeEimer) {
      const r = await fetch(`${URL_BASIS}/storage/v1/object/${encodeURIComponent(eimer)}`, {
        method: 'DELETE', headers: alsDienst, body: JSON.stringify({ prefixes: pfade }),
      });
      await r.body?.cancel();
      /*
        Auch eine schon fehlende Datei ist erledigt: der Speicher antwortet
        dann mit 200 und einer kürzeren Liste. Nur ein Fehler des Speichers
        lässt die Vormerkung stehen — der nächste Anstoß versucht es wieder.
      */
      if (r.ok) for (const pfad of pfade) erledigt.push({ eimer, pfad });
    }
    if (erledigt.length === 0) return antwort({ error: 'Der Speicher hat nichts entfernt.', entfernt }, 502);

    const quittung = await fetch(`${URL_BASIS}/rest/v1/rpc/nachrichten_dateien_erledigt`, {
      method: 'POST', headers: alsDienst, body: JSON.stringify({ p_dateien: erledigt }),
    });
    await quittung.body?.cancel();
    entfernt += erledigt.length;
    if (dateien.length < 200) break;
  }
  return antwort({ entfernt });
});
