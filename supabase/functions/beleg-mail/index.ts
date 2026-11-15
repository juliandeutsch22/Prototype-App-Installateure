/**
 * Rechnung oder Angebot per Mail (Durchsicht 15.11.2026, F16; Roadmap 11.2 Nr. 1).
 *
 * DER ABLAUF:
 *   1. Ist der Versand eingerichtet (`SMTP_*`-Secrets, `docs/DEPLOYMENT.md`)?
 *      Wenn nicht: 503 mit `code: nicht_eingerichtet` — die App bietet dann
 *      den bisherigen Weg an (PDF laden, Mailprogramm).
 *   2. Eingaben prüfen mit denselben Regeln wie die Maske (`shared/belegMail.ts`).
 *   3. `beleg_versand_vorbereiten` MIT DEM TOKEN DER PERSON: Rolle, Betrieb,
 *      Beleg, Antwortadresse und Rate-Limit entscheidet die Datenbank mit
 *      genau den Rechten, die die Person auch in der App hat.
 *   4. Über SMTP senden: von der Adresse der Plattform (SPF/DKIM), mit dem
 *      Namen des Betriebs, Antwort an den Betrieb, Kopie an den Betrieb als
 *      Blindkopie.
 *   5. `beleg_versand_festhalten` MIT DEM DIENSTSCHLÜSSEL: „versendet“ heißt
 *      dann, der Mailserver hat angenommen — kein Konto kann das von Hand
 *      eintragen.
 *
 * DAS PDF ERZEUGT DIE APP wie beim „PDF laden“ aus dem gespeicherten Beleg;
 * hier wird nur geprüft, dass es ein PDF ist und wie groß, und seine
 * Prüfsumme kommt ins Protokoll.
 */
import {
  alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';
import {
  ANHANG_MAX_BYTES, NICHT_EINGERICHTET, TEXT_MAX, betreffFehler, empfaengerLesen, textFehler, type BelegArt,
} from '../_shared/belegMail.ts';
import { ausBase64, mimeNachricht, smtpEinstellung, smtpFehlerText, smtpSenden, SmtpFehler } from '../_shared/smtp.ts';
import { mitCors } from '../_eigen/cors.ts';
import { verbinden } from '../_eigen/smtpVerbindung.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const alsDienst = dienstKopfzeilen(DIENST);

/** Base64 ist ein Drittel größer; dazu Betreff, Text und Rand. */
const ANFRAGE_MAX_ZEICHEN = Math.ceil(ANHANG_MAX_BYTES * 4 / 3) + TEXT_MAX * 4 + 16_384;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function antwort(inhalt: unknown, status = 200): Response {
  return new Response(JSON.stringify(inhalt), { status, headers: { 'Content-Type': 'application/json' } });
}
const fehler = (text: string, status: number, code?: string) => antwort({ error: text, ...(code ? { code } : {}) }, status);

/** Was die Datenbank sagt, als HTTP-Status — Meldung bleibt ihre. */
function statusAus(code: string, http: number): number {
  if (http === 401) return 401;
  return ({ '42501': 403, P0002: 404, '22023': 400, '55000': 409, P0429: 429 } as Record<string, number>)[code] ?? 500;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const roh = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(roh), (x) => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);

  const kopf = req.headers.get('Authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  // Der öffentliche Schlüssel, mit dem die App selbst anfragt — mit ihm und dem Token fragt die Function als diese Person.
  const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!token || !apikey) return fehler('Keine Anmeldung.', 401);

  const roh = await req.text();
  if (roh.length > ANFRAGE_MAX_ZEICHEN) return fehler('Der Anhang ist größer als 6 MB — bitte das PDF selbst senden.', 413);
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(roh);
  } catch {
    return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
  }

  const { einstellung, fehler: halb } = smtpEinstellung(Deno.env.toObject());
  // Nur nachfragen: ob die App den Knopf zeigt oder gleich den bisherigen Weg.
  if (e?.pruefen === true) {
    return antwort({ eingerichtet: !!einstellung, ...(einstellung ? { absender: einstellung.absender } : {}) });
  }
  if (!einstellung) {
    // Was fehlt, steht im Protokoll der Function — für den Betreiber, nicht für den Betrieb.
    if (halb) console.error('beleg-mail: SMTP falsch eingerichtet —', halb);
    return fehler(
      halb
        ? 'Der Mailversand ist nicht vollständig eingerichtet. Bitte dem Betreiber melden; bis dahin das PDF selbst senden.'
        : 'Der Mailversand aus der App ist noch nicht eingerichtet. Bitte das PDF selbst senden.',
      503, NICHT_EINGERICHTET,
    );
  }
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const art = e.art as BelegArt;
  if (art !== 'rechnung' && art !== 'angebot') return fehler('Per Mail gehen Rechnungen und Angebote.', 400);
  const beleg = String(e.beleg ?? '');
  if (!UUID.test(beleg)) return fehler('Welcher Beleg, steht nicht in der Anfrage.', 400);
  const empfaenger = empfaengerLesen(Array.isArray(e.an) ? e.an.map(String).join(',') : '');
  if (empfaenger.fehler) return fehler(empfaenger.fehler, 400);
  const betreff = String(e.betreff ?? '').trim();
  const text = String(e.text ?? '');
  const ungueltig = betreffFehler(betreff) ?? textFehler(text);
  if (ungueltig) return fehler(ungueltig, 400);
  let pdf: Uint8Array<ArrayBuffer>;
  try {
    pdf = ausBase64(String(e.anhang ?? ''));
  } catch {
    return fehler('Der Anhang ist nicht lesbar.', 400);
  }
  // „%PDF-“ am Anfang: was hinausgeht, ist ein PDF — kein anderes Dokument unter dem Namen des Belegs.
  if (pdf.length < 5 || new TextDecoder().decode(pdf.subarray(0, 5)) !== '%PDF-') return fehler('Der Anhang ist kein PDF.', 400);
  if (pdf.length > ANHANG_MAX_BYTES) return fehler('Der Anhang ist größer als 6 MB — bitte das PDF selbst senden.', 413);

  const vorbereitet = await fetch(`${URL_BASIS}/rest/v1/rpc/beleg_versand_vorbereiten`, {
    method: 'POST',
    headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_art: art, p_beleg: beleg, p_an: empfaenger.adressen, p_kopie: e.kopie === true, p_betreff: betreff,
      p_anhang_bytes: pdf.length, p_anhang_sha256: await sha256(pdf), p_mit_link: e.mitLink === true,
    }),
  });
  const v = await vorbereitet.json().catch(() => null) as
    | { id: string; nummer: string; firma: string; antwort: string; kopie: string | null; dateiname: string; message?: string; code?: string }
    | null;
  if (!vorbereitet.ok || !v?.id) {
    return fehler(String(v?.message ?? 'Abgewiesen.'), statusAus(String(v?.code ?? ''), vorbereitet.status));
  }

  const nachricht = mimeNachricht({
    von: { adresse: einstellung.absender, name: v.firma },
    antwortAn: v.antwort,
    an: empfaenger.adressen,
    betreff,
    text,
    anhang: { name: v.dateiname, mime: 'application/pdf', inhalt: pdf },
    datum: new Date(),
    kennung: v.id,
  });

  let ok = false;
  let gescheitert: unknown = null;
  let grund = '';
  let serverAntwort = '';
  let verbindung: Awaited<ReturnType<typeof verbinden>> | null = null;
  try {
    verbindung = await verbinden(einstellung);
    serverAntwort = await smtpSenden(
      verbindung, einstellung,
      { von: einstellung.absender, an: [...empfaenger.adressen, ...(v.kopie ? [v.kopie] : [])] },
      nachricht,
    );
    ok = true;
  } catch (f) {
    gescheitert = f;
    grund = f instanceof SmtpFehler ? f.message : `Verbindung: ${(f as Error).message}`;
    console.error('beleg-mail', v.id, grund);
  } finally {
    verbindung?.schliessen();
  }

  const fest = await fetch(`${URL_BASIS}/rest/v1/rpc/beleg_versand_festhalten`, {
    method: 'POST', headers: alsDienst,
    body: JSON.stringify({ p_id: v.id, p_ok: ok, p_fehler: grund || null, p_server_antwort: serverAntwort || null }),
  });
  const festgehalten = await fest.json().catch(() => null) as { angebot_vorher?: string | null } | null;

  if (!ok) return fehler(smtpFehlerText(gescheitert), 502);
  return antwort({
    ok: true,
    versand: v.id,
    an: empfaenger.adressen,
    kopie: v.kopie,
    ...(festgehalten?.angebot_vorher === 'Entwurf' ? { angebotVersendet: true } : {}),
    ...(fest.ok ? {} : { hinweis: 'Die Mail ist versendet; der Eintrag im Verlauf ließ sich nicht speichern.' }),
  });
}));
