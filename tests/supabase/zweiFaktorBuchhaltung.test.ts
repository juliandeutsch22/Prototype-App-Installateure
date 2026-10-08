import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  admin, API, ANON, betriebAnlegen, konto, plattformkonto,
  zweitenFaktorEinrichten, type Konto,
} from './helfer';

const BETRIEB = 'zf-buchhaltung';
let chef: Konto;
let buch: Konto;
let monteur: Konto;
let plattform: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'zfbchef');
  buch = await konto(BETRIEB, 'Buchhaltung', 'zfbbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'zfbmont');
  plattform = await plattformkonto('zfbplatform');
  await zweitenFaktorEinrichten(chef.client);
}, 120_000);

async function siehtSich(k: Konto) {
  const { data, error } = await k.client.from('users').select('id').eq('id', k.uid);
  expect(error).toBeNull();
  return data?.length === 1;
}

describe('Buchhaltung: vollständiger Zwei-Faktor-Weg', () => {
  it('bietet Einrichtung an, ohne ausgeschaltete Pflicht vorwegzunehmen', async () => {
    expect((await buch.client.rpc('mein_zweiter_faktor')).data)
      .toMatchObject({ angeboten: true, pflicht: false, eingerichtet: false });
    expect(await siehtSich(buch)).toBe(true);
  });

  it('verlangt bei eingeschalteter Betriebspflicht den Faktor, der Monteur bleibt unverändert', async () => {
    const { error } = await chef.client.from('companies').update({ zwei_faktor_pflicht: true }).eq('id', BETRIEB);
    expect(error).toBeNull();
    expect(await siehtSich(buch)).toBe(false);
    expect((await buch.client.rpc('mein_zweiter_faktor')).data)
      .toMatchObject({ angeboten: true, pflicht: true, eingerichtet: false });
    expect(await siehtSich(monteur)).toBe(true);
    expect((await monteur.client.rpc('mein_zweiter_faktor')).data)
      .toMatchObject({ angeboten: false, pflicht: false });
  });

  it('kann trotz gesperrter Daten einrichten und danach Daten lesen', async () => {
    await zweitenFaktorEinrichten(buch.client);
    expect(await siehtSich(buch)).toBe(true);
    expect((await buch.client.rpc('mein_zweiter_faktor')).data)
      .toMatchObject({ pflicht: true, eingerichtet: true });
  });

  it('stellt mit einem einmaligen Code wieder her und verlangt anschließend neue Einrichtung', async () => {
    const { data: codes, error } = await buch.client.rpc('zwei_faktor_codes_erzeugen');
    expect(error).toBeNull();
    const { data: benutzer } = await admin.auth.admin.getUserById(buch.uid);
    const c = createClient(API, ANON, { auth: { persistSession: false } });
    const an = await c.auth.signInWithPassword({ email: benutzer.user!.email!, password: 'stufe-eins-2026' });
    expect(an.error).toBeNull();
    const neu = { ...buch, client: c };
    expect(await siehtSich(neu)).toBe(false);
    expect((await c.rpc('zwei_faktor_code_einloesen', { p_code: codes[0] })).data).toBe(true);
    expect((await c.rpc('zwei_faktor_code_einloesen', { p_code: codes[0] })).data).toBe(false);
    await c.auth.refreshSession();
    expect((await c.rpc('mein_zweiter_faktor')).data).toMatchObject({ pflicht: true, eingerichtet: false });
    await zweitenFaktorEinrichten(c);
    expect(await siehtSich(neu)).toBe(true);
    buch = neu;
  });

  it('erlaubt Support-Rücksetzung nur mit Notzugang, Rückruf und Protokoll', async () => {
    const args = { p_uid: buch.uid, p_grund: 'Telefon verloren', p_rueckruf: '+43 1 234 567' };
    expect((await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', args)).error?.code).toBe('42501');
    expect((await plattform.client.rpc('support_notzugang', {
      p_company: BETRIEB, p_grund: 'Identität prüfen', p_stunden: 1,
    })).error).toBeNull();
    const liste = await plattform.client.rpc('plattform_leitung_mit_zweitem_faktor', { p_company: BETRIEB });
    expect(liste.error).toBeNull();
    expect(liste.data.map((k: { uid: string }) => k.uid)).toContain(buch.uid);
    expect((await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', { ...args, p_rueckruf: ' ' })).error?.code).toBe('22023');
    expect((await plattform.client.rpc('plattform_zweiter_faktor_zuruecksetzen', args)).error).toBeNull();
    const { data: faktoren } = await admin.auth.admin.mfa.listFactors({ userId: buch.uid });
    expect(faktoren?.factors).toHaveLength(0);
    const { data: protokoll } = await admin.from('support_zugriffe').select('bereich').eq('company_id', BETRIEB);
    expect(JSON.stringify(protokoll)).toContain('Rückruf an +43 1 234 567');
  });
});

afterAll(async () => {
  await admin.from('support_freigaben').update({ widerrufen_am: new Date().toISOString() })
    .eq('company_id', BETRIEB).is('widerrufen_am', null);
});
