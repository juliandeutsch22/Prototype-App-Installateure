/**
 * Die Annahme eines Angebots über einen Link (M02a, A06): der Kunde öffnet
 * die Seite `/angebot/annehmen#<schlüssel>`, sie fragt hier nach dem Stand
 * des Angebots und schickt Annahme oder Ablehnung.
 *
 * OHNE ANMELDUNG — und das ist Absicht, wie beim Kalender-Abo. Der Kunde hat
 * kein Konto; der Schlüssel ist die Berechtigung. Deshalb steht in
 * `supabase/config.toml` für diese Function `verify_jwt = false`, und
 * deshalb prüft sie selbst:
 *   - die Form des Schlüssels (wie `angebot_link_erzeugen` ihn vergibt) —
 *     ein falsch geformter kommt gar nicht bis zur Datenbank,
 *   - Name, Bestätigung und Unterschrift nach `shared/angebotLink.ts`,
 *   - die Größe der Anfrage, bevor sie gelesen wird.
 * Die Datenbank kennt nur den Hashwert des Schlüssels und entscheidet bei
 * JEDER Anfrage neu, ob der Link gilt (`angebot_link_abruf`). Ein unbekannter,
 * abgelaufener, widerrufener oder sonst ungültiger Link bekommt in allen
 * Fällen dieselbe Antwort.
 *
 * DER SCHLÜSSEL KOMMT IM RUMPF, nicht in der Adresse: die Seite trägt ihn im
 * Fragment (`#…`), das der Browser nie an einen Server schickt, und hier im
 * POST-Rumpf, der in keinem Zugriffsprotokoll steht. Weder Schlüssel noch
 * Rumpf werden hier protokolliert.
 *
 * KEINE ADRESSE, KEIN GERÄT (U05): gezählt wird das Öffnen mit Zeitpunkt,
 * mehr nicht. Das Rate-Limit gilt je Link in der Datenbank; warum nicht je
 * Abrufer, steht in der Migration `20261106400000_angebot_annahme_link.sql`.
 */
import {
  alleDienstSchluessel, dienstKopfzeilen,
} from '../_shared/dienstSchluessel.ts';
import {
  ANFRAGE_MAX_BYTES, SCHLUESSEL_FORM, ablehnungFehler, annahmeFehler,
} from '../_shared/angebotLink.ts';
import { mitCors } from '../_eigen/cors.ts';

const URL_BASIS = Deno.env.get('SUPABASE_URL')!;
const SCHLUESSEL = alleDienstSchluessel(Deno.env.toObject());
const DIENST = SCHLUESSEL[0] ?? null;
const alsDienst = dienstKopfzeilen(DIENST);

function antwort(inhalt: unknown, status = 200): Response {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Nicht in fremden Zwischenspeichern: die Antwort gehört dem, der den Schlüssel hat.
      'Cache-Control': 'private, no-store',
    },
  });
}

/** Für unbekannt, abgelaufen, widerrufen, ausgeschaltet — immer genau diese Antwort. */
const UNGUELTIG = () => antwort({ zustand: 'ungueltig' }, 404);
const NICHT_ERREICHBAR = () => antwort({ zustand: 'fehler', grund: 'Der Dienst ist gerade nicht erreichbar. Bitte später erneut versuchen.' }, 503);
const fehler = (grund: string, status = 400) => antwort({ zustand: 'fehler', grund }, status);

async function hashwert(schluessel: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(schluessel));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Den Rumpf lesen, aber höchstens `grenze` Bytes behalten. Eine Angabe in
 * `Content-Length` genügt nicht: ein gestückelter Rumpf trägt keine, und
 * erst nach dem Lesen zu messen hieße, ihn schon ganz im Speicher zu haben.
 *
 * WAS DARÜBER HINAUSGEHT, WIRD GELESEN UND VERWORFEN, nicht abgebrochen.
 * Antwortet die Function, bevor der Rumpf gelesen ist (oder bricht sie ihn
 * ab), reißt die Laufzeit die Verbindung ab — örtlich nachgestellt: „error
 * reading a body from connection“, und der Aufrufer wartete ohne Antwort
 * bis zu seiner Frist. Verworfenes kostet keinen Speicher; wie groß ein
 * Rumpf überhaupt werden darf, begrenzt die Plattform davor.
 */
async function rumpfMitGrenze(req: Request, grenze: number): Promise<string | null> {
  if (!req.body) return '';
  const leser = req.body.getReader();
  const teile: Uint8Array[] = [];
  let gelesen = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    gelesen += value.byteLength;
    if (gelesen <= grenze) teile.push(value);
  }
  if (gelesen > grenze) return null;
  const alles = new Uint8Array(gelesen);
  let stelle = 0;
  for (const t of teile) {
    alles.set(t, stelle);
    stelle += t.byteLength;
  }
  return new TextDecoder().decode(alles);
}

async function rpc(name: string, rumpf: unknown): Promise<{ ok: boolean; daten: unknown }> {
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify(rumpf),
  });
  const daten = await r.json().catch(() => undefined);
  return { ok: r.ok, daten };
}

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);
  if (!DIENST) return NICHT_ERREICHBAR();

  const roh = await rumpfMitGrenze(req, ANFRAGE_MAX_BYTES);
  if (roh === null) return fehler('Die Anfrage ist zu groß.', 413);
  let eingabe: Record<string, unknown>;
  try {
    const gelesen = JSON.parse(roh) as unknown;
    if (typeof gelesen !== 'object' || gelesen === null || Array.isArray(gelesen)) return fehler('Ungültige Anfrage.');
    eingabe = gelesen as Record<string, unknown>;
  } catch {
    return fehler('Ungültige Anfrage.');
  }

  const schluessel = typeof eingabe.schluessel === 'string' ? eingabe.schluessel : '';
  if (!SCHLUESSEL_FORM.test(schluessel)) return UNGUELTIG();
  const aktion = eingabe.aktion;
  if (aktion !== 'abruf' && aktion !== 'annehmen' && aktion !== 'ablehnen') return fehler('Unbekannte Aktion.');

  let ergebnis: { ok: boolean; daten: unknown };
  if (aktion === 'abruf') {
    ergebnis = await rpc('angebot_link_abruf', { p_hash: await hashwert(schluessel) });
  } else if (aktion === 'annehmen') {
    const name = typeof eingabe.name === 'string' ? eingabe.name.trim() : '';
    const unterschrift = typeof eingabe.unterschrift === 'string' ? eingabe.unterschrift : null;
    const bestaetigt = eingabe.bestaetigt === true;
    const grund = annahmeFehler({ name, bestaetigt, unterschrift });
    if (grund) return fehler(grund, 422);
    ergebnis = await rpc('angebot_link_annehmen', {
      p_hash: await hashwert(schluessel), p_name: name, p_unterschrift: unterschrift, p_bestaetigt: bestaetigt,
    });
  } else {
    const name = typeof eingabe.name === 'string' ? eingabe.name.trim() : '';
    const begruendung = typeof eingabe.grund === 'string' ? eingabe.grund.trim() : '';
    const grund = ablehnungFehler({ name, grund: begruendung });
    if (grund) return fehler(grund, 422);
    ergebnis = await rpc('angebot_link_ablehnen', {
      p_hash: await hashwert(schluessel), p_name: name, p_grund: begruendung,
    });
  }

  if (!ergebnis.ok) return NICHT_ERREICHBAR();
  const daten = ergebnis.daten as { zustand?: unknown } | null | undefined;
  if (!daten || typeof daten !== 'object') return UNGUELTIG();
  if (daten.zustand === 'zu_viele') {
    return antwort({ zustand: 'zu_viele', grund: 'Dieser Link wurde in der letzten Stunde zu oft aufgerufen. Bitte später erneut versuchen.' }, 429);
  }
  return antwort(daten, 200);
}));
