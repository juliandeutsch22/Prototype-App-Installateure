/**
 * DIE PROBEMELDUNG (E69) — `push-probe` gegen den örtlichen Stapel.
 *
 * Gesendet wird nur an ein Zeichen, das der Server für die anrufende Person
 * kennt. Bis Google geht es hier nicht (kein Dienstkonto); dass die Probe
 * bis dorthin kommt, sagt die 503 mit dem Namen des fehlenden Geheimnisses —
 * dieselbe Auskunft wie bei `push-melden`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { API, ANON, betriebAnlegen, konto, type Konto } from './helfer';

const FUNKTION = `${API}/functions/v1/push-probe`;
const BETRIEB = 'pushprobe-a';
let max: Konto;
let erna: Konto;

async function probe(token: string | null, rumpf: unknown) {
  const r = await fetch(FUNKTION, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(rumpf),
  });
  return { status: r.status, daten: await r.json().catch(() => null) };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Probebetrieb');
  max = await konto(BETRIEB, 'Mitarbeiter', 'probe-max');
  erna = await konto(BETRIEB, 'Mitarbeiter', 'probe-erna');
  expect((await max.client.rpc('push_marke_setzen', { p_token: 'geraet-max', p_an: true })).error).toBeNull();
  expect((await erna.client.rpc('push_marke_setzen', { p_token: 'geraet-erna', p_an: true })).error).toBeNull();
}, 120_000);

describe('push-probe', () => {
  it('ohne Anmeldung nichts', async () => {
    const r = await probe(null, { token: 'geraet-max' });
    expect(r.status).toBe(401);
  });

  it('ohne Zeichen eine klare Absage', async () => {
    const r = await probe(max.token, {});
    expect(r.status).toBe(400);
    expect(r.daten.error).toMatch(/Welches Gerät/);
  });

  it('an das Gerät eines anderen wird nicht gesendet', async () => {
    const r = await probe(max.token, { token: 'geraet-erna' });
    expect(r).toEqual({ status: 200, daten: { ergebnis: 'unbekannt' } });
  });

  it('das eigene Gerät kommt bis zum Versand — ohne Dienstkonto sagt die Antwort das', async () => {
    const r = await probe(max.token, { token: 'geraet-max' });
    expect(r.status).toBe(503);
    expect(r.daten.error).toMatch(/FCM_DIENSTKONTO fehlt/);
  });

  it('der Vorabflug des Browsers wird beantwortet', async () => {
    const r = await fetch(FUNKTION, {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.senklot.at', 'Access-Control-Request-Method': 'POST' },
    });
    expect(r.status).toBeLessThan(300);
    expect(r.headers.get('access-control-allow-origin')).toBeTruthy();
  });
});
