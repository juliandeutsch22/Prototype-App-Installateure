// @vitest-environment jsdom
/**
 * Abmelden: dieses Gerät, oder auf allen Geräten — durch die Naht der App
 * (`@/lib/auth/sitzung`) gegen den laufenden Stapel (Testbericht Runde 6,
 * Abschnitt 8.4 Schritt 5; 27.10.2026).
 *
 * Vorher meldete der Knopf „Abmelden“ ohne Angabe ÜBERALL ab (so macht es
 * supabase-js): wer sich am geteilten Baustellen-Tablet abmeldete, beendete
 * nebenbei sein Telefon. Jetzt: „Abmelden“ meldet nur dieses Gerät ab, „Auf
 * allen Geräten abmelden“ jedes — und ein Gerät, dessen Anmeldung anderswo
 * beendet wurde, merkt es beim nächsten Nachsehen und meldet sich selbst ab.
 *
 * GEGENPROBE (ausgeführt): mit dem alten `abmelden()` ist „das andere Gerät
 * bleibt angemeldet“ rot; ohne `sitzungAnderswoBeendet` gibt es den Weg nicht.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { admin, API, ANON, betriebAnlegen } from './helfer';

const sitzung = await import('@/lib/auth/sitzung');
const { supabaseClient } = await import('@/lib/supabase');

const BETRIEB = 'abmelden-r6';
const PASSWORT = 'abmelden-geraete-2026';
let email: string;
let uid: string;

async function anderesGeraet(): Promise<SupabaseClient> {
  const c = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORT });
  if (error) throw error;
  return c;
}

async function liest(c: SupabaseClient): Promise<number> {
  const { data } = await c.from('projects').select('id').eq('company_id', BETRIEB);
  return (data ?? []).length;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Abmelden GmbH');
  email = `abmelden-${crypto.randomUUID().slice(0, 8)}@abmelden.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORT, email_confirm: true });
  if (error) throw error;
  uid = data.user!.id;
  await admin.from('users').upsert({
    id: data.user!.id, company_id: BETRIEB, name: 'Abmelden', email, role: 'Geschäftsführung', active: true,
  });
  const r = await admin.from('projects').insert({ company_id: BETRIEB, project_number: 'AB-1', customer_name: 'Familie Berger', status: 'Aktiv' });
  if (r.error) throw new Error(r.error.message);
}, 120_000);

afterEach(async () => {
  await sitzung.abmelden().catch(() => undefined);
  localStorage.clear();
  sessionStorage.clear();
});

describe('Abmelden', () => {
  it('meldet nur dieses Gerät ab — das andere bleibt angemeldet', async () => {
    const telefon = await anderesGeraet();
    await sitzung.anmelden(email, PASSWORT);
    await sitzung.abmelden();
    expect((await supabaseClient().auth.getSession()).data.session).toBeNull();
    expect(await liest(telefon)).toBe(1);
  });

  it('auf allen Geräten: auch das andere liest sofort nichts mehr', async () => {
    const telefon = await anderesGeraet();
    expect(await liest(telefon)).toBe(1);
    await sitzung.anmelden(email, PASSWORT);
    await sitzung.abmelden(true);
    expect(await liest(telefon)).toBe(0);
  });
});

/*
  K2 (Durchsicht 15.11.2026): „Auf allen Geräten“ nimmt auch die
  Push-Anmeldungen weg — sonst zeigte das verlorene Telefon weiter
  Meldungen. GEGENPROBE (Erwartung): mit dem `abmelden()` ohne
  `push_geraete_abmelden` ist der erste Fall rot, der zweite grün.
*/
describe('Abmelden und die Geräte für Meldungen', () => {
  async function geraete(): Promise<string[]> {
    const { data } = await admin.from('user_prefs').select('push_tokens').eq('user_id', uid).maybeSingle();
    return (data?.push_tokens as string[] | undefined) ?? [];
  }
  async function geraeteSetzen() {
    const r = await admin.from('user_prefs').upsert({ user_id: uid, company_id: BETRIEB, push_tokens: ['telefon', 'rechner'] });
    if (r.error) throw new Error(r.error.message);
  }

  it('auf allen Geräten: keine Push-Anmeldung bleibt stehen', async () => {
    await geraeteSetzen();
    await sitzung.anmelden(email, PASSWORT);
    await sitzung.abmelden(true);
    expect(await geraete()).toEqual([]);
  });

  it('bleibt gleich: nur dieses Gerät lässt die Anmeldungen der anderen stehen', async () => {
    await geraeteSetzen();
    await sitzung.anmelden(email, PASSWORT);
    await sitzung.abmelden();
    expect(await geraete()).toEqual(['telefon', 'rechner']);
  });
});

describe('Anderswo abgemeldet', () => {
  it('solange die Anmeldung lebt: nichts geschieht', async () => {
    await sitzung.anmelden(email, PASSWORT);
    expect(await sitzung.sitzungAnderswoBeendet()).toBe(false);
    expect((await supabaseClient().auth.getSession()).data.session).not.toBeNull();
  });

  it('nach „Auf allen Geräten abmelden“ anderswo meldet sich dieses Gerät selbst ab', async () => {
    await sitzung.anmelden(email, PASSWORT);
    const rechner = await anderesGeraet();
    await rechner.auth.signOut({ scope: 'global' });
    expect(await sitzung.sitzungAnderswoBeendet()).toBe(true);
    expect((await supabaseClient().auth.getSession()).data.session).toBeNull();
  });

  it('nicht angemeldet: nichts zu prüfen', async () => {
    expect(await sitzung.sitzungAnderswoBeendet()).toBe(false);
  });
});
