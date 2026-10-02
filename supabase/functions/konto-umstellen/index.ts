/**
 * Ein Konto zwischen E-Mail und Benutzername umstellen (Entscheidung vom
 * 02.10.2026; offene Punkte E5).
 *
 * WARUM ES DIESE FUNCTION GIBT. Womit sich ein Konto anmeldet, steht im
 * Anmeldedienst, und den ändert nur der Dienstschlüssel. Ein neues Konto
 * statt des alten ginge auch — aber Zeiten, Urlaube, Scheine und Einsätze
 * hängen an der Kennung des alten.
 *
 * ZWEI RICHTUNGEN, ZWEI GEWICHTE:
 *   - auf die E-Mail: die Adresse wird eingetragen und gilt als bestätigt,
 *     das Passwort bleibt, nichts wird beendet. Die App schickt danach die
 *     Passwort-Mail an die neue Adresse — kommt sie an, stimmt die Adresse.
 *     Auch für das eigene Konto: genau das empfiehlt die Startseite, wenn die
 *     einzige Leitung keine E-Mail hat.
 *   - auf den Benutzernamen: Kunstadresse, ein Startpasswort, das nur jetzt
 *     zurückkommt, alle Sitzungen beendet, Pflichtgrund im Protokoll. Danach
 *     kennt die Leitung das Passwort; bei einem Konto mit E-Mail war das
 *     bisher ausgeschlossen (`passwort-vergeben`). Darum nie still, und nie
 *     für das eigene Konto.
 *
 * Wer darf, steht in der Datenbank (`konto_umstellen_pruefen`, dieselben
 * Grenzen wie `passwort-vergeben`: nur die Spitze, nur im eigenen Betrieb,
 * einen Administrator nur ein Administrator). Belegschaftszeile, Protokoll
 * und Sitzungen zieht `konto_umstellen_festhalten` nach; beide führt nur der
 * Dienstschlüssel aus.
 */
import {
  alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';
import {
  benutzernameFehler, istBenutzerkonto, kunstadresse, mailAdresseFehler,
} from '../_shared/benutzername.ts';
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
async function rpc(name: string, rumpf: unknown): Promise<{ ok: boolean; grund: string; code: string }> {
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify(rumpf),
  });
  const daten = await r.json().catch(() => null);
  const d = daten as { message?: string; code?: string } | null;
  return { ok: r.ok, grund: String(d?.message ?? ''), code: String(d?.code ?? '') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  const aufrufer = token ? await werRuftAn(token) : null;
  if (!aufrufer) return fehler('Keine Anmeldung.', 401);

  let eingabe: { uid?: unknown; nach?: unknown; email?: unknown; benutzername?: unknown; grund?: unknown };
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
  }
  const uid = String(eingabe?.uid ?? '');
  const nach = String(eingabe?.nach ?? '');
  const grund = String(eingabe?.grund ?? '').trim();
  if (!UUID.test(uid)) return fehler('Wessen Konto, steht nicht in der Anfrage.', 400);
  if (nach !== 'mail' && nach !== 'benutzername') return fehler('Die Richtung fehlt.', 400);

  // Was die neue Anmeldung ist — nach denselben Regeln wie beim Anlegen.
  let anmeldung: string;
  if (nach === 'mail') {
    anmeldung = String(eingabe?.email ?? '').trim().toLowerCase();
    if (!anmeldung.includes('@')) return fehler('Die E-Mail-Adresse fehlt oder ist unbrauchbar.', 400);
    const falsch = mailAdresseFehler(anmeldung);
    if (falsch) return fehler(falsch, 400);
    if (istBenutzerkonto(anmeldung)) return fehler('Das ist keine E-Mail-Adresse, sondern ein Benutzername.', 400);
  } else {
    const roh = String(eingabe?.benutzername ?? '').trim();
    const falsch = benutzernameFehler(roh);
    if (falsch) return fehler(falsch, 400);
    if (!grund) return fehler('Ohne Grund keine Umstellung auf einen Benutzernamen.', 400);
    anmeldung = kunstadresse(roh);
  }

  // Wer darf — in der Datenbank, mit den Gründen, die sie selbst nennt.
  const pruefung = await rpc('konto_umstellen_pruefen', { p_aufrufer: aufrufer, p_uid: uid, p_nach: nach });
  if (!pruefung.ok) {
    return fehler(pruefung.grund || 'Abgewiesen.', pruefung.code === 'P0002' ? 404 : 403);
  }

  /*
    DIE ADRESSE IM ANMELDEDIENST ENTSCHEIDET, wovon umgestellt wird — nicht
    die Zeile in der Belegschaft (wie in `passwort-vergeben`).
  */
  const kontoAntwort = await fetch(`${URL_BASIS}/auth/v1/admin/users/${uid}`, { headers: alsDienst });
  const konto = kontoAntwort.ok ? await kontoAntwort.json() : null;
  if (!konto || typeof konto.id !== 'string') {
    return fehler('Zu diesem Benutzer gibt es kein Anmeldekonto.', 404);
  }
  const jetztBenutzername = istBenutzerkonto(String(konto.email ?? ''));
  if (nach === 'mail' && !jetztBenutzername) {
    return fehler('Dieses Konto meldet sich schon mit E-Mail an.', 409);
  }
  if (nach === 'benutzername' && jetztBenutzername) {
    return fehler('Dieses Konto meldet sich schon mit Benutzername an.', 409);
  }

  const startpasswort = nach === 'benutzername' ? generatePassword(14) : null;
  const setzen = await fetch(`${URL_BASIS}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: alsDienst,
    body: JSON.stringify({
      email: anmeldung,
      // Die Leitung trägt sie ein, wie beim Anlegen (`mitarbeiter-anlegen`);
      // die Passwort-Mail danach zeigt, ob sie stimmt.
      email_confirm: true,
      ...(startpasswort ? { password: startpasswort, user_metadata: { startpasswort: true } } : {}),
    }),
  });
  if (!setzen.ok) {
    const f = await setzen.json().catch(() => ({}));
    const text = String(f?.msg ?? f?.message ?? f?.error_description ?? '');
    /*
      Beim Anlegen sagt der Anmeldedienst 422 „already registered“, beim
      Ändern reicht er die Verletzung des eindeutigen Schlüssels durch (500,
      Code 23505). Beides heißt: die Anmeldung gehört schon jemandem.
    */
    const schonDa = setzen.status === 422 || f?.code === '23505'
      || /already|registered|exists|duplicate/i.test(text);
    /*
      ALLGEMEIN GEHALTEN wie beim Anlegen (Testbericht G12): nicht sagen, ob
      es Namen oder Adresse anderswo schon gibt.
    */
    if (schonDa) {
      return fehler(
        nach === 'mail'
          ? `Mit ${anmeldung} lässt sich dieses Konto nicht verbinden — bitte eine andere Adresse verwenden.`
          : 'Diesen Benutzernamen kann Senklot nicht vergeben — bitte einen anderen wählen.',
        409,
      );
    }
    return fehler(text || 'Das Konto ließ sich nicht umstellen.', 500);
  }

  const fest = await rpc('konto_umstellen_festhalten', {
    p_aufrufer: aufrufer, p_uid: uid, p_nach: nach, p_anmeldung: anmeldung, p_grund: grund,
  });
  if (!fest.ok) {
    /*
      Die Anmeldung ist umgestellt, Belegschaft und Protokoll aber nicht —
      das darf nicht still bleiben. Ein Startpasswort gibt es dann nicht
      heraus: erst muss der Rest stimmen.
    */
    return fehler(`Die Anmeldung wurde umgestellt, die Belegschaft aber nicht nachgezogen: ${fest.grund}`, 500);
  }

  return antwort({ ok: true, anmeldung, ...(startpasswort ? { startpasswort } : {}) });
}));
