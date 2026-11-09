/**
 * PROBEMELDUNG AN DIESES GERÄT (E69, 09.11.2026: „Push-Benachrichtigungen für
 * Nachrichten funktionieren immer noch nicht“).
 *
 * Eine Push-Meldung, die nicht ankommt, merkt niemand — und wo es hakt, war
 * von außen nicht zu sehen: am Gerät, bei Google oder im Versand. Hier
 * schickt jemand sich selbst eine Meldung, auf demselben Weg wie jede andere
 * (`_eigen/fcm.ts`), und bekommt Googles Antwort zurück.
 *
 * NUR AN DAS EIGENE GERÄT: gesendet wird nur an ein Zeichen, das der Server
 * für die anrufende Person kennt. Wer das Zeichen eines anderen kennt, kann
 * ihm damit nichts schicken.
 */
import { alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT } from '../_shared/dienstSchluessel.ts';
import { type Dienstkonto } from '../_shared/fcmVersand.ts';
import { toteTokens } from '../_shared/notifyLogic.ts';
import { ZWEITER_FAKTOR_FEHLT } from '../_shared/zweiFaktor.ts';
import { mitCors } from '../_eigen/cors.ts';
import { anEinGeraet, zugangstoken } from '../_eigen/fcm.ts';
import { zweiterFaktorFehlt } from '../_eigen/zweiterFaktor.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const alsDienst = dienstKopfzeilen(DIENST);
const DIENSTKONTO = Deno.env.get('FCM_DIENSTKONTO') ?? '';

const antwort = (inhalt: unknown, status = 200) =>
  new Response(JSON.stringify(inhalt), { status, headers: { 'Content-Type': 'application/json' } });
const fehler = (text: string, status: number) => antwort({ error: text }, status);

async function werRuftAn(token: string): Promise<string | null> {
  const r = await fetch(`${URL_BASIS}/auth/v1/user`, {
    headers: { apikey: DIENST ?? '', Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const nutzer = await r.json();
  return typeof nutzer?.id === 'string' ? nutzer.id : null;
}

/** Die Meldung selbst — sie führt zurück in „Mein Konto“, wo sie ausgelöst wurde. */
const PROBE = {
  title: 'Senklot',
  body: 'Probemeldung: Meldungen kommen auf diesem Gerät an.',
  link: '/settings/meldungen',
  tag: 'senklot-probe',
};

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  const anmeldung = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  const aufrufer = anmeldung ? await werRuftAn(anmeldung) : null;
  if (!aufrufer) return fehler('Keine Anmeldung.', 401);
  if (await zweiterFaktorFehlt(URL_BASIS, alsDienst, aufrufer, anmeldung)) return fehler(ZWEITER_FAKTOR_FEHLT, 403);

  const eingabe = await req.json().catch(() => null) as { token?: unknown } | null;
  const zeichen = typeof eingabe?.token === 'string' ? eingabe.token : '';
  if (!zeichen || zeichen.length > 4096) return fehler('Welches Gerät, steht nicht in der Anfrage.', 400);

  const r = await fetch(
    `${URL_BASIS}/rest/v1/user_prefs?select=push_tokens&user_id=eq.${encodeURIComponent(aufrufer)}`,
    { headers: alsDienst },
  );
  if (!r.ok) return fehler('Die Geräte ließen sich nicht nachsehen.', 500);
  const zeile = ((await r.json()) as Array<{ push_tokens?: string[] | null }>)[0];
  if (!(zeile?.push_tokens ?? []).includes(zeichen)) return antwort({ ergebnis: 'unbekannt' });

  // Wie in `push-melden`: ohne Dienstkonto wird nicht still nichts getan.
  if (!DIENSTKONTO) return fehler('FCM_DIENSTKONTO fehlt — es wurde nichts verschickt.', 503);

  const konto = JSON.parse(DIENSTKONTO) as Dienstkonto;
  let zugang: string;
  try {
    zugang = await zugangstoken(konto);
  } catch (e) {
    return fehler(`Google gibt keinen Zugang: ${String((e as Error).message).slice(0, 200)}`, 502);
  }
  const ergebnis = await anEinGeraet(konto.project_id, zeichen, zugang, PROBE);
  if (!ergebnis.error) return antwort({ ergebnis: 'gesendet' });

  // Ein totes Gerät räumt die Probe ab wie jeder Versand — die App meldet es dann neu an.
  if (toteTokens([zeichen], [ergebnis]).length > 0) {
    await fetch(`${URL_BASIS}/rest/v1/rpc/push_token_entfernen`, {
      method: 'POST', headers: alsDienst, body: JSON.stringify({ p_token: zeichen }),
    }).catch(() => undefined);
    return antwort({ ergebnis: 'abgemeldet', code: ergebnis.error.code });
  }
  return antwort({ ergebnis: 'abgelehnt', code: ergebnis.error.code });
}));
