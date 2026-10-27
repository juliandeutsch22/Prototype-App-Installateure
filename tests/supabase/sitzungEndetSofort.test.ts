/**
 * Abgemeldet heißt sofort abgemeldet — auf jedem Gerät (Testbericht Runde 6,
 * Abschnitt 8.4 Schritt 5; 27.10.2026).
 *
 * „Abmelden“ beendet beim Anmeldedienst alle Sitzungen des Kontos. Bis
 * hierher prüfte die Datenbank aber nur das Token: ein zweites Gerät las mit
 * seinem Token bis zu dessen Ablauf weiter, bis zu einer Stunde. Seit
 * `20261027600200_sitzung_endet_sofort.sql` fragt `app.aktiv` (und für die
 * Plattform `app.ist_plattform`) auch, ob die Sitzung des Tokens noch lebt.
 *
 * GEGENPROBE: ohne die Migration liest das zweite Gerät nach dem Abmelden
 * weiter (rot); mit ihr nichts mehr (grün). Was gleich bleiben muss: das
 * zweite Gerät liest VOR dem Abmelden, ein lokales Abmelden (nur dieses
 * Gerät) lässt das andere in Ruhe, und der Dienstschlüssel ohne Sitzung
 * arbeitet weiter.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { admin, API, ANON, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';

const BETRIEB = 'sitzung-r6';
const PASSWORT = 'sitzung-endet-2026';

let chef: Konto;
let email: string;

/** Ein weiteres Gerät desselben Kontos: eigene Anmeldung, eigene Sitzung. */
async function geraet(): Promise<SupabaseClient> {
  const c = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORT });
  if (error) throw error;
  return c;
}

async function liestBaustellen(c: SupabaseClient): Promise<number> {
  const { data } = await c.from('projects').select('id').eq('company_id', BETRIEB);
  return (data ?? []).length;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB, 'Sitzung GmbH');
  chef = await konto(BETRIEB, 'Geschäftsführung', 'sitzchef');
  const { data } = await admin.auth.admin.getUserById(chef.uid);
  email = data.user!.email!;
  await admin.auth.admin.updateUserById(chef.uid, { password: PASSWORT });
  const { error } = await admin.from('projects').insert({
    company_id: BETRIEB, project_number: 'SZ-1', customer_name: 'Familie Huber', status: 'Aktiv',
  });
  if (error) throw new Error(error.message);
}, 120_000);

describe('Abmelden beendet die Sitzungen auf allen Geräten sofort', () => {
  it('das andere Gerät liest vorher', async () => {
    const telefon = await geraet();
    expect(await liestBaustellen(telefon)).toBe(1);
  });

  it('nach dem Abmelden am Rechner liest das Telefon mit seinem noch gültigen Token nichts mehr', async () => {
    const telefon = await geraet();
    const rechner = await geraet();
    expect(await liestBaustellen(telefon)).toBe(1);
    // Wie der Knopf „Abmelden“ der App: supabase-js meldet ohne Angabe überall ab.
    const { error } = await rechner.auth.signOut();
    expect(error).toBeNull();
    expect(await liestBaustellen(telefon)).toBe(0);
    const { error: schreiben } = await telefon.from('projects').insert({
      company_id: BETRIEB, project_number: 'SZ-2', customer_name: 'Nach dem Abmelden', status: 'Aktiv',
    });
    expect(schreiben).not.toBeNull();
  });

  it('nur dieses Gerät abmelden lässt das andere in Ruhe', async () => {
    const telefon = await geraet();
    const rechner = await geraet();
    await rechner.auth.signOut({ scope: 'local' });
    expect(await liestBaustellen(telefon)).toBe(1);
  });

  it('der Dienstschlüssel trägt keine Sitzung und arbeitet weiter', async () => {
    const { data } = await admin.from('projects').select('id').eq('company_id', BETRIEB);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

describe('auch das Plattformkonto', () => {
  it('nach dem Abmelden auf einem Gerät kommt das andere an keine Plattformfunktion mehr', async () => {
    const plattform = await plattformkonto('sitzplatt');
    const vorher = await plattform.client.rpc('plattform_betriebe');
    expect(vorher.error).toBeNull();
    // Die Sitzung beenden, wie es das Abmelden auf einem anderen Gerät tut.
    const { error } = await admin.auth.admin.signOut(plattform.token, 'global');
    expect(error).toBeNull();
    const nachher = await plattform.client.rpc('plattform_betriebe');
    expect(nachher.error?.message).toMatch(/nur die Plattform/);
  });
});
