/**
 * Zwei-Faktor-Anmeldung auch für die Buchhaltung (11.10.2026, Plan 17 C) —
 * gegen die echte Datenbank und den echten Anmeldedienst.
 *
 * Die Buchhaltung sieht dasselbe Geld wie die Leitung. Jetzt: angeboten, von
 * der Pflicht des Betriebs erfasst, und über den Notzugang zurücksetzbar.
 *
 * Gegenprobe: ohne `20261011200000_zwei_faktor_buchhaltung.sql` ist die
 * Buchhaltung weder angeboten noch erfasst, und das Zurücksetzen wird
 * abgewiesen (rot). Gleich bleiben: Verwaltung und Monteur bleiben aussen
 * vor, die Leitung wie bisher.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  admin, API, ANON, betriebAnlegen, konto, plattformkonto, zweitenFaktorEinrichten, type Konto,
} from './helfer';

const BETRIEB = 'zf-buchhaltung';
const PASSWORT = 'stufe-eins-2026';

let plattform: Konto;
let chefin: Konto;
let buchhaltung: Konto;
let verwaltung: Konto;

async function nurPasswort(uid: string): Promise<SupabaseClient> {
  const { data } = await admin.auth.admin.getUserById(uid);
  const client = createClient(API, ANON, { auth: { persistSession: false } });
  const an = await client.auth.signInWithPassword({ email: data.user!.email!, password: PASSWORT });
  if (an.error) throw an.error;
  return client;
}

async function siehtSichSelbst(client: SupabaseClient, uid: string): Promise<boolean> {
  const { data } = await client.from('users').select('id').eq('id', uid);
  return (data ?? []).length === 1;
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  plattform = await plattformkonto('zfb');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'zfbgf');
  buchhaltung = await konto(BETRIEB, 'Buchhaltung', 'zfbbuch');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'zfbverw');
}, 120_000);

afterAll(async () => {
  await admin.from('support_freigaben').update({ widerrufen_am: new Date().toISOString() })
    .eq('company_id', BETRIEB).is('widerrufen_am', null);
});

describe('Buchhaltung: zweiter Faktor', () => {
  it('ohne Pflicht: angeboten, nicht verlangt — der Verwaltung nicht angeboten', async () => {
    expect((await buchhaltung.client.rpc('mein_zweiter_faktor')).data)
      .toMatchObject({ angeboten: true, pflicht: false, eingerichtet: false });
    expect((await verwaltung.client.rpc('mein_zweiter_faktor')).data)
      .toMatchObject({ angeboten: false, pflicht: false });
    expect(await siehtSichSelbst(await nurPasswort(buchhaltung.uid), buchhaltung.uid)).toBe(true);
  });

  it('mit Pflicht im Betrieb: ohne zweiten Faktor sieht sie nichts, die Verwaltung weiter alles', async () => {
    await zweitenFaktorEinrichten(chefin.client);
    const an = await chefin.client.from('companies').update({ zwei_faktor_pflicht: true }).eq('id', BETRIEB);
    expect(an.error).toBeNull();

    const buch = await nurPasswort(buchhaltung.uid);
    expect(await siehtSichSelbst(buch, buchhaltung.uid)).toBe(false);
    expect((await buch.rpc('mein_zweiter_faktor')).data)
      .toMatchObject({ angeboten: true, pflicht: true, eingerichtet: false, betrieb_pflicht: true });
    // Auch die Edge Functions fragen dasselbe.
    expect((await admin.rpc('zweiter_faktor_fehlt', { p_uid: buchhaltung.uid, p_aal: 'aal1' })).data).toBe(true);

    const verw = await nurPasswort(verwaltung.uid);
    expect(await siehtSichSelbst(verw, verwaltung.uid)).toBe(true);
    expect((await admin.rpc('zweiter_faktor_fehlt', { p_uid: verwaltung.uid, p_aal: 'aal1' })).data).toBe(false);

    // Einrichten geht ohne Zugriff auf die Daten — danach ist sie wieder drin.
    await zweitenFaktorEinrichten(buch);
    expect(await siehtSichSelbst(buch, buchhaltung.uid)).toBe(true);
  });

  it('der Support setzt ihn über den Notzugang zurück — für die Verwaltung gibt es nichts zurückzusetzen', async () => {
    const auf = await plattform.client.rpc('support_notzugang', { p_company: BETRIEB, p_grund: 'Telefon verloren', p_stunden: 2 });
    expect(auf.error).toBeNull();
    const { data: liste } = await plattform.client.rpc('plattform_leitung_mit_zweitem_faktor', { p_company: BETRIEB });
    expect((liste as { uid: string; rolle: string }[]).map((k) => [k.uid, k.rolle])).toEqual(
      expect.arrayContaining([[buchhaltung.uid, 'Buchhaltung'], [chefin.uid, 'Geschäftsführung']]),
    );

    const verw = await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', {
      p_uid: verwaltung.uid, p_grund: 'x', p_rueckruf: '+43 1',
    });
    expect(verw.error?.code).toBe('42501');

    const r = await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', {
      p_uid: buchhaltung.uid, p_grund: 'Telefon verloren', p_rueckruf: '+43 1 234 56 78',
    });
    expect(r.error).toBeNull();
    const { data: faktoren } = await admin.auth.admin.mfa.listFactors({ userId: buchhaltung.uid });
    expect(faktoren?.factors ?? []).toHaveLength(0);
  });
});
