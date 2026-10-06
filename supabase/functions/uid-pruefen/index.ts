/**
 * Die UID-Nummer eines Kunden bei VIES prüfen und das Ergebnis als Nachweis
 * festhalten (Entscheidung vom 02.10.2026; offene Punkte E2).
 *
 * WARUM AUF DEM SERVER. VIES braucht keinen Schlüssel, aber der Browser
 * darf die EU-Seite nicht direkt fragen (fremde Herkunft), und der Nachweis
 * soll nicht davon abhängen, was ein Gerät meldet: gefragt wird mit der UID,
 * die am Kunden GESPEICHERT ist, nicht mit dem, was im Formular steht.
 *
 * Wer darf, steht in der Datenbank (`uid_pruefung_vorbereiten`: wer die
 * Kunden lesen darf, im eigenen Betrieb). Festgehalten wird nur eine echte
 * Antwort — „gültig“ oder „nicht gültig“. Ist VIES oder der Dienst eines
 * Landes gerade nicht erreichbar, gibt es nichts nachzuweisen; dann sagt die
 * Antwort, dass es später noch einmal versucht werden soll.
 */
import {
  alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';
import { VIES_ADRESSE, viesPruefen, beiViesPruefbar } from '../_shared/vies.ts';
import { mitCors } from '../_eigen/cors.ts';
import { zweiterFaktorFehlt } from '../_eigen/zweiterFaktor.ts';
import { ZWEITER_FAKTOR_FEHLT } from '../_shared/zweiFaktor.ts';

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

async function rpc(name: string, rumpf: unknown): Promise<{ ok: boolean; daten: unknown; grund: string; code: string }> {
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify(rumpf),
  });
  const daten = await r.json().catch(() => null);
  const d = daten as { message?: string; code?: string } | null;
  return { ok: r.ok, daten, grund: String(d?.message ?? ''), code: String(d?.code ?? '') };
}

/** VIES fragen — mit Zeitgrenze: ein hängender Landesdienst soll die App nicht festhalten. */
async function viesFragen(rumpf: unknown): Promise<unknown> {
  const r = await fetch(VIES_ADRESSE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(rumpf),
    signal: AbortSignal.timeout(20_000),
  });
  return await r.json();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  const aufrufer = token ? await werRuftAn(token) : null;
  if (!aufrufer) return fehler('Keine Anmeldung.', 401);
  // Runde 3, H1: wer einen zweiten Faktor braucht, kommt ohne ihn auch hier nicht weiter.
  if (await zweiterFaktorFehlt(URL_BASIS, alsDienst, aufrufer, token)) return fehler(ZWEITER_FAKTOR_FEHLT, 403);

  let eingabe: { kunde?: unknown };
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
  }
  const kunde = String(eingabe?.kunde ?? '');
  if (!UUID.test(kunde)) return fehler('Welcher Kunde, steht nicht in der Anfrage.', 400);

  const vorbereitet = await rpc('uid_pruefung_vorbereiten', { p_aufrufer: aufrufer, p_kunde: kunde });
  if (!vorbereitet.ok) {
    const status = vorbereitet.code === 'P0002' ? 404 : vorbereitet.code === '22023' ? 400 : 403;
    return fehler(vorbereitet.grund || 'Abgewiesen.', status);
  }
  const zeile = (vorbereitet.daten as { uid?: string; eigene_uid?: string | null }[] | null)?.[0];
  const uid = String(zeile?.uid ?? '');
  const eigene = zeile?.eigene_uid ?? null;
  if (!beiViesPruefbar(uid)) {
    return fehler('VIES kennt nur UID-Nummern aus der EU und aus Nordirland.', 400);
  }

  let lauf;
  try {
    lauf = await viesPruefen(uid, eigene, viesFragen);
  } catch {
    return fehler('VIES ist gerade nicht erreichbar. Bitte später noch einmal prüfen.', 503);
  }
  const { ergebnis, eigeneGeschickt, ohneIdGrund } = lauf;
  if (ergebnis.art === 'fehler') return fehler(ergebnis.text, 503);

  const fest = await rpc('uid_pruefung_festhalten', {
    p_aufrufer: aufrufer,
    p_kunde: kunde,
    p_uid: uid,
    p_gueltig: ergebnis.gueltig,
    p_name: ergebnis.name,
    p_adresse: ergebnis.adresse,
    p_abfrage_id: ergebnis.abfrageId,
    p_eigene_uid: eigeneGeschickt,
    p_abgefragt_am: ergebnis.zeitpunkt,
  });
  if (!fest.ok) {
    return fehler(fest.grund || 'Das Ergebnis ließ sich nicht festhalten.', fest.code === '40001' ? 409 : 500);
  }
  return antwort({ ok: true, pruefung: fest.daten, ...(ohneIdGrund ? { hinweis: ohneIdGrund } : {}) });
}));
