/**
 * Einen Betrieb endgültig löschen (Nachtest 01.10.2026, Paket D).
 *
 * NIE SOFORT, NIE MIT EINEM KLICK. Was vorher feststehen muss, prüft die
 * Datenbank (`betrieb_loeschen_pruefen`, nur mit dem Dienstschlüssel):
 *   - der Aufrufer steht in der Plattformtabelle (nicht nur im Token);
 *   - der Betrieb ist deaktiviert, die Löschung geplant und ihre Frist um;
 *   - die Kennung ist zur Bestätigung genau eingetippt, ein Grund genannt.
 *
 * DANN IN DIESER REIHENFOLGE:
 *   1. die Dateien (Scheinfotos, Baustellendokumente, eigene Sicherungen und
 *      Übergaben) — über die Schnittstelle des Speichers, in dessen Tabellen
 *      niemand direkt schreibt;
 *   2. die Zeilen, in EINER Transaktion (`betrieb_loeschen_ausfuehren`), mit
 *      Löschprotokoll ohne Inhalte; die Kennung ist danach gesperrt;
 *   3. die Anmeldekonten über den Anmeldedienst. Bis dahin sind sie seit dem
 *      Deaktivieren gesperrt und haben keine Ansprüche mehr.
 *
 * Bricht etwas mittendrin ab, lässt sich derselbe Aufruf wiederholen: Schritt
 * 1 findet dann weniger, Schritt 2 läuft erst, wenn der Speicher leer ist.
 *
 * Die Sicherung ausser Haus löscht diese Function bewusst NICHT — ihr
 * Schlüssel darf nur anlegen. Dort läuft eine Ablaufregel des Speichers ab
 * (docs/DEPLOYMENT.md, „Einen Betrieb deaktivieren oder löschen“).
 */
import {
  alleDienstSchluessel, dienstKopfzeilen, SCHLUESSEL_FEHLT,
} from '../_shared/dienstSchluessel.ts';
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

async function rpc(name: string, rumpf: unknown): Promise<{ ok: boolean; daten: unknown; grund: string; code: string }> {
  const r = await fetch(`${URL_BASIS}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: alsDienst, body: JSON.stringify(rumpf),
  });
  const daten = await r.json().catch(() => null);
  const d = daten as { message?: string; code?: string } | null;
  return { ok: r.ok, daten, grund: String(d?.message ?? ''), code: String(d?.code ?? '') };
}

const statusZu = (code: string) => (code === 'P0002' ? 404 : code === '42501' ? 403 : 409);

/** Je Aufruf höchstens so viele Pfade — die Grenze der Speicherschnittstelle. */
const JE_AUFRUF = 1000;

async function dateienLoeschen(dateien: Array<{ eimer: string; pfad: string }>): Promise<number> {
  const jeEimer = new Map<string, string[]>();
  for (const d of dateien) jeEimer.set(d.eimer, [...(jeEimer.get(d.eimer) ?? []), d.pfad]);
  let weg = 0;
  for (const [eimer, pfade] of jeEimer) {
    for (let i = 0; i < pfade.length; i += JE_AUFRUF) {
      const teil = pfade.slice(i, i + JE_AUFRUF);
      const r = await fetch(`${URL_BASIS}/storage/v1/object/${encodeURIComponent(eimer)}`, {
        method: 'DELETE', headers: alsDienst, body: JSON.stringify({ prefixes: teil }),
      });
      if (!r.ok) throw new Error(`Speicher (${eimer}): ${await r.text()}`);
      await r.body?.cancel();
      weg += teil.length;
    }
  }
  return weg;
}

Deno.serve(mitCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fehler('Nur POST.', 405);
  if (!DIENST) return fehler(SCHLUESSEL_FEHLT, 503);

  const kopf = req.headers.get('Authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  const aufrufer = token ? await werRuftAn(token) : null;
  if (!aufrufer) return fehler('Keine Anmeldung.', 401);

  let eingabe: { kennung?: unknown; bestaetigung?: unknown; grund?: unknown };
  try {
    eingabe = await req.json();
  } catch {
    return fehler('Die Anfrage enthält keine lesbaren Daten.', 400);
  }
  const kennung = String(eingabe?.kennung ?? '').trim();
  const bestaetigung = String(eingabe?.bestaetigung ?? '');
  const grund = String(eingabe?.grund ?? '').trim();
  if (!kennung) return fehler('Welcher Betrieb, steht nicht in der Anfrage.', 400);

  const pruefung = await rpc('betrieb_loeschen_pruefen', {
    p_admin: aufrufer, p_kennung: kennung, p_bestaetigung: bestaetigung, p_grund: grund,
  });
  if (!pruefung.ok) return fehler(pruefung.grund || 'Abgewiesen.', statusZu(pruefung.code));
  const plan = pruefung.daten as { dateien: Array<{ eimer: string; pfad: string }>; konten: string[] };

  let dateien = 0;
  try {
    dateien = await dateienLoeschen(plan.dateien ?? []);
  } catch (e) {
    return fehler(
      `Die Dateien ließen sich nicht vollständig löschen; die Zeilen sind unberührt. ${e instanceof Error ? e.message : ''}`.trim(),
      500,
    );
  }

  const ausfuehrung = await rpc('betrieb_loeschen_ausfuehren', {
    p_admin: aufrufer, p_kennung: kennung, p_bestaetigung: bestaetigung, p_grund: grund,
  });
  if (!ausfuehrung.ok) {
    return fehler(
      `Die Dateien sind gelöscht, die Zeilen nicht: ${ausfuehrung.grund || 'abgewiesen'}. Derselbe Aufruf lässt sich wiederholen.`,
      ausfuehrung.code === '22023' ? 409 : 500,
    );
  }
  const ergebnis = ausfuehrung.daten as { zeilen: number; konten: string[] };

  // Die Anmeldekonten zuletzt — sie sind gesperrt und ohne Ansprüche, bis sie weg sind.
  const offen: string[] = [];
  for (const uid of ergebnis.konten ?? []) {
    const r = await fetch(`${URL_BASIS}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: alsDienst });
    if (!r.ok && r.status !== 404) offen.push(uid);
    await r.body?.cancel();
  }

  return antwort({
    kennung,
    zeilen: ergebnis.zeilen,
    dateien,
    konten: (ergebnis.konten ?? []).length - offen.length,
    kontenOffen: offen,
  });
}));
