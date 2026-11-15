/**
 * K10 (Paket 8, 16.11.2026): offene Bitten um ein neues Passwort gehen mit,
 * wenn ein Konto oder ein ganzer Betrieb deaktiviert wird.
 *
 * VORHER (nachgestellt in einer zurückgerollten Transaktion): nach
 * `active = false` blieb die Bitte offen — nach einem Aktivieren tauchte sie
 * wieder auf, als hätte jemand gerade gefragt.
 *
 * GEGENPROBE (Erwartung): ohne `20261116078000_passwort_bitten_beim_sperren.sql`
 * sind „Konto deaktiviert“ und „Betrieb deaktiviert“ rot (Bitte bleibt
 * offen); „der Kollege“ ist in beiden Fassungen grün.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, deaktivieren, plattformkonto } from './helfer';
import { kunstadresse } from '../../shared/benutzername';

const BETRIEB = 'k10-bitten';
const RUHT = 'k10-bitten-ruht';
const anon = createClient(API, ANON, { auth: { persistSession: false } });

async function mitBitte(betrieb: string) {
  const email = kunstadresse(`k10.${crypto.randomUUID().slice(0, 8)}`);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'Anfang-2026!', email_confirm: true,
    app_metadata: { company_id: betrieb, role: 'Mitarbeiter', active: true },
  });
  if (error) throw error;
  const uid = data.user!.id;
  const { error: f } = await admin.from('users').upsert({
    id: uid, company_id: betrieb, name: email, email, role: 'Mitarbeiter', active: true,
  });
  if (f) throw new Error(f.message);
  await anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: email });
  return uid;
}

async function stand(uid: string): Promise<string | null | undefined> {
  const { data } = await admin.from('passwort_anfragen').select('erledigt_wie').eq('user_id', uid).maybeSingle();
  return data ? (data.erledigt_wie as string | null) : undefined;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(RUHT);
}, 60_000);

describe('Gesperrt heißt: keine offene Bitte mehr', () => {
  it('Konto deaktiviert: die Bitte ist erledigt — „deaktiviert“', async () => {
    const uid = await mitBitte(BETRIEB);
    expect(await stand(uid)).toBeNull();
    await deaktivieren(uid);
    expect(await stand(uid)).toBe('deaktiviert');
  }, 60_000);

  it('bleibt gleich: der Kollege behält seine offene Bitte', async () => {
    const weg = await mitBitte(BETRIEB);
    const bleibt = await mitBitte(BETRIEB);
    await deaktivieren(weg);
    expect(await stand(bleibt)).toBeNull();
  }, 60_000);

  it('Betrieb deaktiviert: jede offene Bitte ist erledigt', async () => {
    const plattform = await plattformkonto('k10-plattform');
    const uid = await mitBitte(RUHT);
    const { error } = await plattform.client.rpc('plattform_betrieb_deaktivieren', { p_kennung: RUHT, p_grund: 'Prüfung K10' });
    expect(error).toBeNull();
    expect(await stand(uid)).toBe('deaktiviert');
    await plattform.client.rpc('plattform_betrieb_aktivieren', { p_kennung: RUHT, p_grund: 'Prüfung K10 Ende' });
    // Nach dem Aktivieren taucht sie nicht wieder auf.
    expect(await stand(uid)).toBe('deaktiviert');
  }, 120_000);
});
