/**
 * Das Kalender-Abo: die Einsätze einer Person als .ics unter einer geheimen
 * Adresse (Entscheidung vom 02.10.2026; aus offene Punkte E3).
 *
 * OHNE ANMELDUNG — und das ist Absicht. Google, Apple und Outlook holen ein
 * Abo selbst ab und können keinen Anmeldekopf mitschicken. Die Adresse ist
 * die Berechtigung; deshalb steht in `supabase/config.toml` für diese
 * Function `verify_jwt = false`, und deshalb prüft sie selbst:
 *   - der Schlüssel muss die Form haben, die `kalender_abo_anlegen` vergibt,
 *   - die Datenbank kennt nur seinen Hashwert und sagt bei jedem Abruf neu,
 *     ob Konto, Betrieb und Schalter des Betriebs noch gelten
 *     (`kalender_abruf`).
 * Ein unbekannter, beendeter oder nicht mehr gültiger Link bekommt in allen
 * Fällen dieselbe Antwort — von außen ist nicht zu erkennen, ob es ihn gab.
 */
import {
  alleDienstSchluessel, dienstKopfzeilen,
} from '../_shared/dienstSchluessel.ts';
import { kalenderDatei, type KalenderEinsatz } from '../_shared/kalenderIcs.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const alsDienst = dienstKopfzeilen(DIENST);

/** 32 Bytes in Base64 ohne „+/=“ — genau das vergibt die Datenbank. */
const FORM = /^[A-Za-z0-9_-]{43}$/;

const text = (inhalt: string, status: number) =>
  new Response(inhalt, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const UNBEKANNT = () => text('Diesen Kalender gibt es nicht (mehr). Einen neuen Link gibt es in Senklot unter „Mein Einsatzplan“.', 404);

async function hashwert(schluessel: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(schluessel));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Nur GET.', 405);
  if (!DIENST) return text('Der Kalender ist gerade nicht erreichbar.', 503);

  const schluessel = new URL(req.url).searchParams.get('t') ?? '';
  if (!FORM.test(schluessel)) return UNBEKANNT();

  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/kalender_abruf`, {
    method: 'POST', headers: alsDienst,
    body: JSON.stringify({ p_schluessel_hash: await hashwert(schluessel) }),
  });
  if (!r.ok) return text('Der Kalender ist gerade nicht erreichbar.', 503);
  const daten = await r.json().catch(() => null) as
    { kennung?: string; betrieb?: string; einsaetze?: KalenderEinsatz[] } | null;
  if (!daten || !Array.isArray(daten.einsaetze)) return UNBEKANNT();

  const datei = kalenderDatei({
    person: String(daten.kennung ?? ''),
    betrieb: String(daten.betrieb ?? ''),
    einsaetze: daten.einsaetze,
    jetzt: new Date(),
  });
  return new Response(req.method === 'HEAD' ? null : datei, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="einsaetze.ics"',
      // Nicht in fremden Zwischenspeichern: die Adresse ist das Geheimnis.
      'Cache-Control': 'private, no-store',
    },
  });
});
