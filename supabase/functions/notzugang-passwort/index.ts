/**
 * Ein ausgesperrter Betrieb bekommt über den Notzugang wieder ein Passwort —
 * eng begrenzt (Testbericht 30.09.2026, P2).
 *
 * WARUM ES DAS GIBT. Hat ein Betrieb nur Leitungskonten mit Benutzername
 * (P1) und hat deren Inhaber das Passwort vergessen, gibt es kein „Passwort
 * vergessen“ per Mail, und niemand im Betrieb kann ein neues vergeben. Der
 * Notzugang allein hilft nicht: er liest und schreibt nichts.
 *
 * WAS SIE DARF — und nur das:
 *   1. nur der globale Administrator (Plattformtabelle, nicht das Token);
 *   2. nur ein Benutzernamen-Konto mit Administration oder
 *      Geschäftsführung, aktiv (Konten mit E-Mail setzen ihr Passwort selbst,
 *      alle anderen setzt danach der Betrieb zurück);
 *   3. nur solange für den Betrieb ein Notzugang offen ist;
 *   4. mit Pflichtgrund und dokumentierter Identitätsprüfung — Rückruf an die
 *      Nummer aus Firmenbuch oder Gewerberegister, nicht an die des Anrufers;
 *   5. ein EINMALIGES Startpasswort, hier erzeugt, einmal zurückgegeben; beim
 *      nächsten Anmelden verlangt die App ein eigenes;
 *   6. alle offenen Sitzungen des Kontos werden beendet;
 *   7. Eintrag im Protokoll des Betriebs, den die Leitung liest.
 *
 * Die Bedingungen 2, 3 und 6, 7 stehen in der Datenbank
 * (`notzugang_passwort_pruefen`, `notzugang_passwort_festhalten`), die nur
 * der Dienstschlüssel ausführt.
 */
import {
  alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';
import { istBenutzerkonto } from '../_shared/benutzername.ts';
import { generatePassword } from '../_shared/startpasswort.ts';
import { mitCors } from '../_eigen/cors.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const alsDienst = dienstKopfzeilen(DIENST);

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

/** Eine Datenbankfunktion mit dem Dienstschlüssel — Grund bei Ablehnung. */
async function rpc(name: string, rumpf: unknown): Promise<{ ok: boolean; daten: unknown; grund: string; code: string }> {
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify(rumpf),
  });
  const daten = await r.json().catch(() => null);
  const d = daten as { message?: string; code?: string } | null;
  return { ok: r.ok, daten, grund: String(d?.message ?? ''), code: String(d?.code ?? '') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  const aufrufer = token ? await werRuftAn(token) : null;
  if (!aufrufer) return fehler('Keine Anmeldung.', 401);

  // Die Tabelle entscheidet, nicht das Token (wie in `betrieb-anlegen`).
  const adminAntwort = await fetch(
    `${URL_BASIS}/rest/v1/platform_admins?id=eq.${aufrufer}&select=id`,
    { headers: alsDienst },
  );
  const admins = adminAntwort.ok ? await adminAntwort.json() : [];
  if (!Array.isArray(admins) || admins.length === 0) {
    return fehler('Nur der globale Administrator.', 403);
  }

  let eingabe: { uid?: unknown; grund?: unknown; rueckruf?: unknown; identitaetBestaetigt?: unknown };
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
  }
  const uid = String(eingabe?.uid ?? '');
  const grund = String(eingabe?.grund ?? '').trim();
  const rueckruf = String(eingabe?.rueckruf ?? '').trim();
  if (!UUID.test(uid)) return fehler('Wessen Passwort, steht nicht in der Anfrage.', 400);
  if (!grund) return fehler('Ohne Grund kein neues Passwort.', 400);
  if (!rueckruf || eingabe?.identitaetBestaetigt !== true) {
    return fehler(
      'Ohne Identitätsprüfung kein neues Passwort: Rückruf an die Nummer aus Firmenbuch oder Gewerberegister, und bestätigen.',
      400,
    );
  }

  // 2 und 3 — in der Datenbank, mit denselben Gründen, die sie dem Betrieb nennt.
  const pruefung = await rpc('notzugang_passwort_pruefen', { p_admin: aufrufer, p_uid: uid });
  if (!pruefung.ok) {
    const status = pruefung.code === 'P0002' ? 404 : 403;
    return fehler(pruefung.grund || 'Abgewiesen.', status);
  }

  /*
    DIE ADRESSE IM ANMELDEDIENST ENTSCHEIDET, nicht die Zeile in der
    Belegschaft — wie in `passwort-vergeben`.
  */
  const kontoAntwort = await fetch(`${URL_BASIS}/auth/v1/admin/users/${uid}`, { headers: alsDienst });
  const konto = kontoAntwort.ok ? await kontoAntwort.json() : null;
  if (!konto || typeof konto.id !== 'string') {
    return fehler('Zu diesem Konto gibt es kein Anmeldekonto.', 404);
  }
  if (!istBenutzerkonto(String(konto.email ?? ''))) {
    return fehler('Dieses Konto meldet sich mit E-Mail an — es setzt sein Passwort über „Passwort vergessen“ selbst.', 409);
  }

  const startpasswort = generatePassword(14);
  const setzen = await fetch(`${URL_BASIS}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: alsDienst,
    body: JSON.stringify({ password: startpasswort, user_metadata: { startpasswort: true } }),
  });
  if (!setzen.ok) {
    const f = await setzen.json().catch(() => ({}));
    return fehler(String(f?.msg ?? f?.message ?? 'Das Passwort ließ sich nicht setzen.'), 500);
  }

  // 6 und 7 — Sitzungen beenden und ins Protokoll des Betriebs.
  const fest = await rpc('notzugang_passwort_festhalten', {
    p_admin: aufrufer, p_uid: uid, p_grund: grund, p_rueckruf: rueckruf,
  });
  if (!fest.ok) {
    /*
      Das Passwort ist gesetzt, das Protokoll nicht — das darf nicht still
      bleiben. Die Meldung sagt es, damit der Support es dem Betrieb selbst
      mitteilt; das Startpasswort gibt es in diesem Fall nicht heraus.
    */
    return fehler(`Das Passwort wurde gesetzt, der Protokolleintrag aber abgewiesen: ${fest.grund}`, 500);
  }

  return antwort({ startpasswort });
}));
