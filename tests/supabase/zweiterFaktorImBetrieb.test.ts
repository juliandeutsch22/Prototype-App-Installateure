/**
 * K7 (Durchsicht 15.11.2026): eine zweite Leitung setzt den zweiten Faktor
 * eines Kollegen zurück — mit Grund und Protokoll, Sitzungen beendet.
 *
 * VORHER: nur der Support über den Notzugang, und nur für Administration,
 * Geschäftsführung, Buchhaltung. Wer nach einem Rollenwechsel (etwa von der
 * Buchhaltung in die Verwaltung) Telefon und Codes verlor, kam nicht mehr
 * hinein; einziger Weg war „Person löschen“.
 *
 * GEGENPROBE (Erwartung): ohne `20261116074000_zweiter_faktor_im_betrieb.sql`
 * gibt es `zweiter_faktor_zuruecksetzen` nicht — „setzt zurück“, „Protokoll“
 * und alle Abweisungen sind rot (die Funktion fehlt, statt mit dem
 * erwarteten Grund abzuweisen); „bleibt gleich“ ist grün.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, konto, zweitenFaktorEinrichten, type Konto } from './helfer';
import { totp } from '../totp';

const BETRIEB = 'zf-reset-a';
const FREMD = 'zf-reset-b';

let chefin: Konto & { geheimnis: string };
let admina: Konto;
let fremdeChefin: Konto;

/** Ein Konto mit eingerichtetem Faktor; seine Sitzung trägt danach `aal2`. */
async function mitFaktor(rolle: Konto['rolle'], marke: string, betrieb = BETRIEB): Promise<Konto & { geheimnis: string }> {
  const k = await konto(betrieb, rolle, marke);
  const geheimnis = await zweitenFaktorEinrichten(k.client);
  return { ...k, geheimnis };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await mitFaktor('Geschäftsführung', 'zf-reset-chefin');
  admina = await mitFaktor('Administrator', 'zf-reset-admina');
  fremdeChefin = await mitFaktor('Geschäftsführung', 'zf-reset-fremd', FREMD);
}, 240_000);

async function hatFaktor(uid: string): Promise<boolean> {
  const { data } = await admin.auth.admin.mfa.listFactors({ userId: uid });
  return (data?.factors ?? []).some((f) => f.status === 'verified');
}

describe('Zurücksetzen durch eine zweite Leitung', () => {
  it('nach dem Rollenwechsel: Faktor weg, Codes ungültig, Sitzung beendet, Protokoll da', async () => {
    const buch = await mitFaktor('Buchhaltung', 'zf-reset-buch');
    await admin.from('users').update({ role: 'Verwaltung' }).eq('id', buch.uid);
    await admin.from('user_prefs').upsert({ user_id: buch.uid, company_id: BETRIEB, push_tokens: ['telefon-weg'] });
    expect(await chefin.client.rpc('zweiter_faktor_von', { p_uid: buch.uid })).toMatchObject({ data: true });

    const { error } = await chefin.client.rpc('zweiter_faktor_zuruecksetzen', {
      p_uid: buch.uid, p_grund: 'Telefon verloren, jetzt Verwaltung',
    });
    expect(error).toBeNull();
    expect(await hatFaktor(buch.uid)).toBe(false);
    const { data: codes } = await admin.from('zwei_faktor_codes').select('id')
      .eq('user_id', buch.uid).is('ungueltig_am', null).is('verbraucht_am', null);
    expect(codes ?? []).toHaveLength(0);
    // K2: mit den Sitzungen gehen die Push-Anmeldungen.
    const { data: prefs } = await admin.from('user_prefs').select('push_tokens').eq('user_id', buch.uid).single();
    expect(prefs!.push_tokens).toEqual([]);

    const { data: protokoll } = await chefin.client.from('zwei_faktor_ruecksetzungen')
      .select('user_id, grund, durch, durch_name').eq('user_id', buch.uid);
    expect(protokoll).toEqual([{
      user_id: buch.uid, grund: 'Telefon verloren, jetzt Verwaltung', durch: chefin.uid, durch_name: expect.any(String),
    }]);
    const { data: verlauf } = await chefin.client.from('objekt_verlauf').select('art, aenderungen')
      .eq('objektart', 'benutzer').eq('objekt_id', buch.uid).eq('art', 'zweiter_faktor_zurueckgesetzt');
    expect(verlauf).toEqual([{ art: 'zweiter_faktor_zurueckgesetzt', aenderungen: { grund: 'Telefon verloren, jetzt Verwaltung' } }]);

    // Danach kommt sie ohne Faktor hinein (Verwaltung hat keine Pflicht).
    const neu = createClient(API, ANON, { auth: { persistSession: false } });
    const { data: profil } = await admin.from('users').select('email').eq('id', buch.uid).single();
    const an = await neu.auth.signInWithPassword({ email: profil!.email, password: 'stufe-eins-2026' });
    expect(an.error).toBeNull();
    const { data: ich } = await neu.from('users').select('id').eq('id', buch.uid);
    expect(ich).toHaveLength(1);
  }, 120_000);

  it('ohne Grund nicht', async () => {
    const m = await mitFaktor('Mitarbeiter', 'zf-reset-m1');
    const { error } = await chefin.client.rpc('zweiter_faktor_zuruecksetzen', { p_uid: m.uid, p_grund: '  ' });
    expect(error?.code).toBe('22023');
    expect(await hatFaktor(m.uid)).toBe(true);
  }, 60_000);

  it('nicht den eigenen', async () => {
    const { error } = await chefin.client.rpc('zweiter_faktor_zuruecksetzen', { p_uid: chefin.uid, p_grund: 'x' });
    expect(error?.code).toBe('22023');
    expect(await hatFaktor(chefin.uid)).toBe(true);
  }, 60_000);

  it('einen Administrator nur durch einen Administrator', async () => {
    const zweiterAdmin = await mitFaktor('Administrator', 'zf-reset-admin2');
    const { error } = await chefin.client.rpc('zweiter_faktor_zuruecksetzen', { p_uid: zweiterAdmin.uid, p_grund: 'x' });
    expect(error?.code).toBe('42501');
    expect(await hatFaktor(zweiterAdmin.uid)).toBe(true);
    const { error: e2 } = await admina.client.rpc('zweiter_faktor_zuruecksetzen', { p_uid: zweiterAdmin.uid, p_grund: 'Telefon defekt' });
    expect(e2).toBeNull();
    expect(await hatFaktor(zweiterAdmin.uid)).toBe(false);
  }, 120_000);

  it('nicht über die Betriebsgrenze — und die Antwort verrät nicht, ob es die Kennung gibt', async () => {
    const m = await mitFaktor('Mitarbeiter', 'zf-reset-m2');
    const fremd = await fremdeChefin.client.rpc('zweiter_faktor_zuruecksetzen', { p_uid: m.uid, p_grund: 'x' });
    const unbekannt = await fremdeChefin.client.rpc('zweiter_faktor_zuruecksetzen', { p_uid: crypto.randomUUID(), p_grund: 'x' });
    expect(fremd.error?.code).toBe('P0002');
    expect(fremd.error?.message).toBe(unbekannt.error?.message);
    expect(await hatFaktor(m.uid)).toBe(true);
  }, 60_000);

  it('nicht durch Buchhaltung, Verwaltung oder Monteur', async () => {
    const m = await mitFaktor('Mitarbeiter', 'zf-reset-m3');
    for (const rolle of ['Buchhaltung', 'Verwaltung', 'Mitarbeiter'] as const) {
      const k = await konto(BETRIEB, rolle, `zf-reset-${rolle.toLowerCase()}`);
      if (rolle === 'Buchhaltung') await zweitenFaktorEinrichten(k.client);
      const { error } = await k.client.rpc('zweiter_faktor_zuruecksetzen', { p_uid: m.uid, p_grund: 'x' });
      expect(error?.code, rolle).toBe('42501');
    }
    expect(await hatFaktor(m.uid)).toBe(true);
  }, 120_000);

  it('bleibt gleich: wer keinen hat, bekommt eine klare Antwort; der Code der anderen gilt weiter', async () => {
    const ohne = await konto(BETRIEB, 'Mitarbeiter', 'zf-reset-ohne');
    const { error } = await chefin.client.rpc('zweiter_faktor_zuruecksetzen', { p_uid: ohne.uid, p_grund: 'x' });
    expect(error?.message).toMatch(/kein zweiter Faktor/);
    expect(totp(chefin.geheimnis)).toMatch(/^\d{6}$/);
  }, 60_000);
});
