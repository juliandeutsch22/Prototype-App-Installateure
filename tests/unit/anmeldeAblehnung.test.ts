/**
 * WARUM DIE ANMELDUNG ABGELEHNT WURDE (K5, Durchsicht 15.11.2026) — die
 * Einordnung in der Anmeldeschicht, mit dem echten supabase-js und
 * nachgestellten Antworten des Anmeldedienstes.
 *
 * Die Antworten sind so geformt, wie Supabase Auth sie gibt (gemessen am
 * 15.11.2026 am lokalen Dienst, v2.197.0): ein gesperrtes Konto bekommt
 * `400 user_banned` — AUCH MIT FALSCHEM PASSWORT. Deshalb darf die Maske
 * aus `user_banned` nicht „deaktiviert“ machen; es muss dieselbe Einordnung
 * herauskommen wie bei falschen Zugangsdaten.
 *
 * Gegenprobe: vor K5 warf `anmelden` ein nacktes `Error` mit dem englischen
 * Text des Dienstes — es gab weder `AnmeldeFehler` noch `anmeldeAblehnung`,
 * jede Prüfung hier ist rot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

let antwort: () => Promise<Response> = async () => new Response('{}', { status: 200 });

const echterClient = createClient('http://anmeldung.test', 'anon-schluessel', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: () => antwort() },
});

vi.mock('@/lib/supabase', () => ({
  merkenSetzen: vi.fn(),
  supabaseClient: () => echterClient,
  pruefClient: () => echterClient,
}));

const { anmelden } = await import('@/lib/auth/pg/sitzung');
const { AnmeldeFehler } = await import('@/lib/auth/kern');

/** Eine Antwort des Anmeldedienstes in seiner Form. */
const dienst = (status: number, fehlercode: string, msg: string) => async () =>
  new Response(JSON.stringify({ code: status, error_code: fehlercode, msg }), {
    status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
  });

async function abgelehnt(): Promise<InstanceType<typeof AnmeldeFehler>> {
  const e = await anmelden('petra@perl.at', 'geheim', true).then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AnmeldeFehler);
  return e as InstanceType<typeof AnmeldeFehler>;
}

beforeEach(() => {
  antwort = async () => new Response('{}', { status: 200 });
});

describe('Die Ablehnung des Anmeldedienstes, eingeordnet', () => {
  it('falsche Zugangsdaten: zugangsdaten', async () => {
    antwort = dienst(400, 'invalid_credentials', 'Invalid login credentials');
    expect((await abgelehnt()).art).toBe('zugangsdaten');
  });

  it('gesperrtes Konto (deaktiviert oder Betrieb deaktiviert): dieselbe Einordnung — der Dienst sagt es auch bei falschem Passwort', async () => {
    antwort = dienst(400, 'user_banned', 'User is banned');
    expect((await abgelehnt()).art).toBe('zugangsdaten');
  });

  it('unbestätigte Adresse und jede unbekannte Ablehnung: zugangsdaten — nichts Neues verrät ein Konto', async () => {
    antwort = dienst(400, 'email_not_confirmed', 'Email not confirmed');
    expect((await abgelehnt()).art).toBe('zugangsdaten');
    antwort = dienst(422, 'irgendwas_neues', 'Something new');
    expect((await abgelehnt()).art).toBe('zugangsdaten');
  });

  it('kein Netz (der Abruf scheitert, auch nach einem Stillstand): netz', async () => {
    antwort = async () => { throw new TypeError('Failed to fetch'); };
    expect((await abgelehnt()).art).toBe('netz');
  });

  it('zu viele Versuche (Drosselung des Dienstes): zuViele', async () => {
    antwort = dienst(429, 'over_request_rate_limit', 'Request rate limit reached');
    expect((await abgelehnt()).art).toBe('zuViele');
  });

  it('Störung des Dienstes (5xx) und eine Antwort, die nicht vom Dienst stammt: dienst', async () => {
    antwort = dienst(500, 'unexpected_failure', 'Database error querying schema');
    expect((await abgelehnt()).art).toBe('dienst');
    antwort = async () => new Response('<html>Bad Gateway</html>', { status: 502 });
    expect((await abgelehnt()).art).toBe('dienst');
    antwort = async () => new Response('<html>Bitte im WLAN anmelden</html>', { status: 403 });
    expect((await abgelehnt()).art).toBe('dienst');
  });
});
