/**
 * Ein Anmeldekonto für einen Mitarbeiter anlegen.
 *
 * WARUM ES DIESE FUNCTION GIBT. Die App legte Konten bis hierher mit
 * `auth.signUp` an — aus dem BROWSER, mit dem öffentlichen Schlüssel. Das
 * verlangt im Projekt den Schalter „Allow new users to sign up", und der ist
 * aus. Zu Recht: der öffentliche Schlüssel steht im ausgelieferten
 * JavaScript, und eingeschaltet könnte sich jeder, der ihn dort abliest,
 * selbst ein Konto anlegen. Ein Betrieb, dessen Anmeldung offen steht, ist
 * kein Betrieb mehr.
 *
 * Der Weg ist deshalb nicht der Schalter, sondern diese Stelle: der
 * Dienstschlüssel liegt hier und nicht im Browser, und wer anlegen darf,
 * entscheidet die Belegschaftstabelle.
 *
 * WAS SIE TUT UND WAS AUSDRÜCKLICH NICHT. Sie legt das KONTO an — mehr nicht.
 * Die Zeile in der Belegschaft schreibt weiterhin der Browser, und das ist
 * kein Rest, sondern die wichtigste Entscheidung an dieser Datei:
 *
 *   Auf `users` liegen `users_anlegen` (verlangt `app.ist_spitze()`) und der
 *   Trigger `users_adminrolle` (die Rolle Administrator vergibt nur ein
 *   Administrator). Beide lesen den Anspruch aus dem Token des Aufrufers.
 *   Schriebe diese Function die Zeile mit dem Dienstschlüssel, gälte keine
 *   der beiden Regeln mehr — aus einer Absicherung würde ein Loch, und zwar
 *   eines, das niemandem auffiele, weil alles weiter funktioniert.
 *
 * Bleibt ein Konto ohne Belegschaftszeile zurück, wenn der Browser danach
 * scheitert. Das ist so wie bisher und in `lib/auth/provisionUser.ts`
 * begründet: der Betroffene kann sich anmelden und sieht nichts — das fällt
 * beim ersten Versuch auf. Eine Zeile ohne Konto fiele niemandem auf.
 *
 * OHNE FERNIMPORT, aus demselben Grund wie bei `betrieb-anlegen`: eine
 * Function ohne Fernimport startet auch dann, wenn die Registry gerade nicht
 * erreichbar ist.
 */
import {
  alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';
import { mitCors } from '../_eigen/cors.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const alsDienst = dienstKopfzeilen(DIENST);

/** Wer einen Mitarbeiter anlegen darf — dieselbe Spitze wie in `app.ist_spitze()`. */
const SPITZE = ['Geschäftsführung', 'Administrator'];

function antwort(inhalt: unknown, status = 200): Response {
  return new Response(JSON.stringify(inhalt), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

const fehler = (text: string, status: number) => antwort({ error: text }, status);

/** Die Kennung hinter einem Anmeldetoken — geprüft vom Anmeldedienst. */
async function werRuftAn(token: string): Promise<string | null> {
  const r = await fetch(`${URL_BASIS}/auth/v1/user`, {
    headers: { apikey: DIENST ?? '', Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const nutzer = await r.json();
  return typeof nutzer?.id === 'string' ? nutzer.id : null;
}

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  const aufrufer = token ? await werRuftAn(token) : null;
  if (!aufrufer) return fehler('Keine Anmeldung.', 401);

  /*
    DIE TABELLE ENTSCHEIDET, NICHT DAS TOKEN — dieselbe Überlegung wie in
    `betrieb-anlegen`. Im Token steht die Rolle, gesetzt von einem Trigger;
    ein bereits ausgestelltes Token trägt sie aber bis zu einer Stunde
    weiter. Wer heute früh zurückgestuft oder deaktiviert wurde, legte sonst
    noch bis Mittag Konten an.
  */
  const wer = await fetch(
    `${URL_BASIS}/rest/v1/users?id=eq.${aufrufer}&select=role,active,company_id`,
    { headers: alsDienst },
  );
  const zeilen = wer.ok ? await wer.json() : [];
  const ich = Array.isArray(zeilen) ? zeilen[0] : null;

  if (!ich || ich.active === false) return fehler('Kein aktives Konto.', 403);
  if (!SPITZE.includes(String(ich.role))) {
    return fehler('Mitarbeiter anlegen darf nur die Geschäftsführung oder die Administration.', 403);
  }

  let eingabe: { email?: unknown; passwort?: unknown };
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
  }

  const email = String(eingabe?.email ?? '').trim().toLowerCase();
  const passwort = String(eingabe?.passwort ?? '');
  if (!email.includes('@')) return fehler('Die E-Mail-Adresse fehlt oder ist unbrauchbar.', 400);
  if (passwort.length < 8) return fehler('Das Anfangspasswort ist zu kurz.', 400);

  /*
    `email_confirm: true` — DIE ADRESSE GILT ALS BESTÄTIGT.

    Im Projekt steht „Confirm email" an, und das soll so bleiben: wer sich
    selbst anmeldet, bestätigt seine Adresse. Hier legt aber die
    Geschäftsführung das Konto für einen Mitarbeiter an, den sie kennt.
    Ohne diese Zeile käme er bis zu seinem Klick in einer Mail nicht hinein —
    und die Willkommensmail, die gleich darauf folgt, ist ohnehin der Weg zu
    seinem eigenen Passwort.
  */
  const kontoAntwort = await fetch(`${URL_BASIS}/auth/v1/admin/users`, {
    method: 'POST',
    headers: alsDienst,
    body: JSON.stringify({ email, password: passwort, email_confirm: true }),
  });
  const konto = await kontoAntwort.json();

  if (!kontoAntwort.ok || typeof konto?.id !== 'string') {
    const text = String(konto?.msg ?? konto?.message ?? konto?.error_description ?? '');
    const schonDa = kontoAntwort.status === 422 || /already|registered|exists/i.test(text);
    return fehler(
      schonDa
        ? `Zu ${email} gibt es schon ein Konto.`
        : (text || 'Das Konto liess sich nicht anlegen.'),
      schonDa ? 409 : 500,
    );
  }

  return antwort({ uid: konto.id });
}));
