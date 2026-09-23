/**
 * Ein neues Startpasswort für ein BENUTZERNAMEN-Konto — vergeben vom Büro.
 *
 * WARUM ES DIESE FUNCTION GIBT. Wer sich mit einem Benutzernamen anmeldet,
 * hat keine Adresse, an die ein Rücksetzlink gehen könnte (die Kunstadresse
 * endet auf `.invalid`, siehe `shared/benutzername.ts`). „Passwort vergessen"
 * heisst für ihn: das Büro vergibt ein neues. Das kann nur der
 * Dienstschlüssel, und der gehört nicht in den Browser.
 *
 * WAS SIE AUSDRÜCKLICH NICHT TUT: ein Konto MIT E-Mail-Adresse umstellen.
 * Sonst könnte die Geschäftsführung sich still in das Konto jedes Kollegen
 * setzen — Passwort neu, anmelden, und der Betroffene erfährt es erst, wenn
 * seines nicht mehr geht. Wer eine Adresse hat, setzt sein Passwort über den
 * Link selbst; das Büro schickt ihn höchstens los.
 *
 * DIESELBEN GRENZEN WIE ÜBERALL SONST:
 *   - vergeben darf nur die Spitze (Geschäftsführung, Administration), und
 *     gefragt wird die Belegschaftstabelle, nicht das Token — wie in
 *     `mitarbeiter-anlegen`;
 *   - nur im eigenen Betrieb;
 *   - einem Administrator nur ein Administrator (wie `users_adminrolle`);
 *   - das eigene Passwort nicht hier, sondern unter „Mein Konto" — dort mit
 *     zweiter Eingabe und ohne dass das Büro es je kennt.
 *
 * Das neue Passwort ist wieder ein STARTPASSWORT: beim nächsten Anmelden
 * fragt die App nach einem eigenen.
 *
 * ANGEMELDETE GERÄTE BLEIBEN ANGEMELDET. Das ist beim vergessenen Passwort
 * richtig; bei einem verlorenen Telefon ist das Mittel „Konto deaktivieren",
 * das die offenen Sitzungen sofort beendet (`app.konto_sperren`).
 */
import {
  alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';
import { istBenutzerkonto } from '../_shared/benutzername.ts';
import { mitCors } from '../_eigen/cors.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const alsDienst = dienstKopfzeilen(DIENST);

const SPITZE = ['Geschäftsführung', 'Administrator'];

function antwort(inhalt: unknown, status = 200): Response {
  return new Response(JSON.stringify(inhalt), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

const fehler = (text: string, status: number) => antwort({ error: text }, status);

async function werRuftAn(token: string): Promise<string | null> {
  const r = await fetch(`${URL_BASIS}/auth/v1/user`, {
    headers: { apikey: DIENST ?? '', Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const nutzer = await r.json();
  return typeof nutzer?.id === 'string' ? nutzer.id : null;
}

async function belegschaftszeile(uid: string) {
  const r = await fetch(
    `${URL_BASIS}/rest/v1/users?id=eq.${encodeURIComponent(uid)}&select=role,active,company_id`,
    { headers: alsDienst },
  );
  const zeilen = r.ok ? await r.json() : [];
  return Array.isArray(zeilen) ? (zeilen[0] ?? null) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  const aufrufer = token ? await werRuftAn(token) : null;
  if (!aufrufer) return fehler('Keine Anmeldung.', 401);

  const ich = await belegschaftszeile(aufrufer);
  if (!ich || ich.active === false) return fehler('Kein aktives Konto.', 403);
  if (!SPITZE.includes(String(ich.role))) {
    return fehler('Ein Passwort vergibt nur die Geschäftsführung oder die Administration.', 403);
  }

  let eingabe: { uid?: unknown; passwort?: unknown };
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
  }
  const uid = String(eingabe?.uid ?? '');
  const passwort = String(eingabe?.passwort ?? '');
  if (!UUID.test(uid)) return fehler('Wessen Passwort, steht nicht in der Anfrage.', 400);
  if (passwort.length < 8) return fehler('Das Startpasswort ist zu kurz.', 400);
  if (uid === aufrufer) {
    return fehler('Das eigene Passwort bitte unter „Mein Konto" ändern.', 400);
  }

  /*
    FREMDER BETRIEB UND UNBEKANNTE KENNUNG SAGEN DASSELBE. Sonst liesse sich
    hier abfragen, ob es eine Kennung anderswo gibt.
  */
  const ziel = await belegschaftszeile(uid);
  if (!ziel || ziel.company_id !== ich.company_id) {
    return fehler('Diesen Benutzer gibt es im eigenen Betrieb nicht.', 404);
  }
  if (ziel.role === 'Administrator' && ich.role !== 'Administrator') {
    return fehler('Das Passwort eines Administrators vergibt nur ein Administrator.', 403);
  }

  /*
    DIE ADRESSE KOMMT AUS DEM ANMELDEDIENST, nicht aus der Belegschaft: die
    Zeile dort schreibt der Browser, und entscheidend ist, womit sich das
    Konto tatsächlich anmeldet.
  */
  const kontoAntwort = await fetch(`${URL_BASIS}/auth/v1/admin/users/${uid}`, {
    headers: alsDienst,
  });
  const konto = kontoAntwort.ok ? await kontoAntwort.json() : null;
  if (!konto || typeof konto.id !== 'string') {
    return fehler('Zu diesem Benutzer gibt es kein Anmeldekonto.', 404);
  }
  if (!istBenutzerkonto(String(konto.email ?? ''))) {
    return fehler(
      'Dieser Benutzer meldet sich mit seiner E-Mail-Adresse an. '
        + 'Ein neues Passwort setzt er über „Passwort-Mail senden" selbst.',
      409,
    );
  }

  const setzen = await fetch(`${URL_BASIS}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: alsDienst,
    body: JSON.stringify({
      password: passwort,
      // Was sonst in `user_metadata` steht, bleibt: der Dienst mischt ein.
      user_metadata: { startpasswort: true },
    }),
  });
  if (!setzen.ok) {
    const f = await setzen.json().catch(() => ({}));
    return fehler(String(f?.msg ?? f?.message ?? 'Das Passwort liess sich nicht setzen.'), 500);
  }
  return antwort({ ok: true });
}));
