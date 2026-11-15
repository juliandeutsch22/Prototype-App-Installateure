/**
 * K2 (Durchsicht 15.11.2026): ein verlorenes Telefon bekommt keine Meldungen
 * mehr — gegen die echte Datenbank.
 *
 * WAS VORHER GESCHAH (gemessen in der Durchsicht): nach `active = false`
 * standen die Push-Anmeldungen weiter in `user_prefs`; erst „Person löschen“
 * nahm sie weg. Das verlorene Telefon zeigte also weiter Nachrichten,
 * Einsatzplan und Abwesenheiten am Sperrbildschirm.
 *
 * GEPRÜFT wird die Regel aus `20261116070000_push_anmeldungen_abraeumen.sql`
 * an jedem Weg, der Sitzungen gewaltsam beendet oder ein Konto sperrt —
 * und dass ein Kollege dabei nichts verliert.
 *
 * GEGENPROBE (Erwartung): ohne die Migration sind „Deaktivieren“,
 * „Rollenwechsel“, „Betrieb deaktivieren“ und die drei neuen Funktionen rot;
 * die „bleibt gleich“-Fälle (Kollege, Aktivieren) sind in beiden Fassungen grün.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, ANON, API, betriebAnlegen, konto, plattformkonto, type Konto } from './helfer';
import { createClient } from '@supabase/supabase-js';

const BETRIEB = 'push-weg-a';
const RUHT = 'push-weg-ruht';

let chefin: Konto;

async function geraeteSetzen(k: Konto, ...marken: string[]) {
  const { error } = await admin.from('user_prefs').upsert({
    user_id: k.uid, company_id: k.betrieb, push_tokens: marken,
  });
  if (error) throw new Error(error.message);
}

async function geraete(uid: string): Promise<string[]> {
  const { data, error } = await admin.from('user_prefs').select('push_tokens').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.push_tokens as string[] | undefined) ?? [];
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(RUHT);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'push-weg-chefin');
}, 120_000);

describe('Wo die Datenbank ein Konto sperrt, gehen seine Push-Anmeldungen mit', () => {
  it('Deaktivieren: keine Anmeldung bleibt stehen', async () => {
    const monteur = await konto(BETRIEB, 'Mitarbeiter', 'push-weg-m1');
    await geraeteSetzen(monteur, 'telefon-verloren', 'tablet');
    await admin.from('users').update({ active: false }).eq('id', monteur.uid);
    expect(await geraete(monteur.uid)).toEqual([]);
  }, 60_000);

  it('bleibt gleich: der Kollege behält seine Anmeldungen', async () => {
    const a = await konto(BETRIEB, 'Mitarbeiter', 'push-weg-m2');
    const b = await konto(BETRIEB, 'Mitarbeiter', 'push-weg-m3');
    await geraeteSetzen(a, 'geraet-a');
    await geraeteSetzen(b, 'geraet-b');
    await admin.from('users').update({ active: false }).eq('id', a.uid);
    expect(await geraete(b.uid)).toEqual(['geraet-b']);
  }, 60_000);

  it('bleibt gleich: Aktivieren und Speichern eines aktiven Kontos nehmen nichts weg', async () => {
    const m = await konto(BETRIEB, 'Mitarbeiter', 'push-weg-m4');
    await geraeteSetzen(m, 'geraet-m4');
    await admin.from('users').update({ name: 'Neuer Name' }).eq('id', m.uid);
    expect(await geraete(m.uid)).toEqual(['geraet-m4']);
  }, 60_000);

  it('Rollenwechsel beendet die Sitzungen — und die Anmeldungen', async () => {
    const m = await konto(BETRIEB, 'Mitarbeiter', 'push-weg-m5');
    await geraeteSetzen(m, 'geraet-m5');
    await admin.from('users').update({ role: 'Verwaltung' }).eq('id', m.uid);
    expect(await geraete(m.uid)).toEqual([]);
  }, 60_000);

  it('ein deaktivierter Betrieb: jedes Konto verliert seine Anmeldungen', async () => {
    const plattform = await plattformkonto('push-weg-plattform');
    const m = await konto(RUHT, 'Mitarbeiter', 'push-weg-ruht');
    await geraeteSetzen(m, 'geraet-ruht');
    const { error } = await plattform.client.rpc('plattform_betrieb_deaktivieren', {
      p_kennung: RUHT, p_grund: 'Prüfung K2',
    });
    expect(error).toBeNull();
    expect(await geraete(m.uid)).toEqual([]);
    await plattform.client.rpc('plattform_betrieb_aktivieren', { p_kennung: RUHT, p_grund: 'Prüfung K2 Ende' });
  }, 120_000);
});

describe('„Auf allen Geräten abmelden“: push_geraete_abmelden', () => {
  it('nimmt die eigenen Anmeldungen weg — nur die eigenen', async () => {
    const m = await konto(BETRIEB, 'Mitarbeiter', 'push-weg-m6');
    const kollege = await konto(BETRIEB, 'Mitarbeiter', 'push-weg-m7');
    await geraeteSetzen(m, 'eigen-1', 'eigen-2');
    await geraeteSetzen(kollege, 'kollege');
    const { error } = await m.client.rpc('push_geraete_abmelden');
    expect(error).toBeNull();
    expect(await geraete(m.uid)).toEqual([]);
    expect(await geraete(kollege.uid)).toEqual(['kollege']);
  }, 60_000);

  it('ohne Anmeldung nicht', async () => {
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('push_geraete_abmelden');
    expect(error).not.toBeNull();
  }, 30_000);
});

describe('Nur der Dienst: push_geraete_vergessen und push_vorgaben', () => {
  it('push_geraete_vergessen ruft kein angemeldetes Konto — auch nicht die Spitze', async () => {
    const m = await konto(BETRIEB, 'Mitarbeiter', 'push-weg-m8');
    await geraeteSetzen(m, 'geraet-m8');
    const { error } = await chefin.client.rpc('push_geraete_vergessen', { p_uid: m.uid });
    expect(error).not.toBeNull();
    expect(await geraete(m.uid)).toEqual(['geraet-m8']);

    const { error: dienst } = await admin.rpc('push_geraete_vergessen', { p_uid: m.uid });
    expect(dienst).toBeNull();
    expect(await geraete(m.uid)).toEqual([]);
  }, 60_000);

  it('push_vorgaben liefert nur aktive Konten eines Betriebs, der nicht ruht', async () => {
    const aktiv = await konto(BETRIEB, 'Projektleiter', 'push-weg-pl1');
    const weg = await konto(BETRIEB, 'Projektleiter', 'push-weg-pl2');
    await geraeteSetzen(aktiv, 'pl-aktiv');
    await geraeteSetzen(weg, 'pl-weg');
    /*
      ALTDATEN NACHGESTELLT: ein Konto, das vor dieser Migration deaktiviert
      wurde, hat seine Anmeldungen noch. Erst deaktivieren, dann die Marke
      wieder hineinschreiben — so steht die Zeile in der Produktion.
    */
    await admin.from('users').update({ active: false }).eq('id', weg.uid);
    await geraeteSetzen(weg, 'pl-weg');

    const { data, error } = await admin.rpc('push_vorgaben', { p_uids: [aktiv.uid, weg.uid] });
    expect(error).toBeNull();
    const zeilen = (data ?? []) as Array<{ user_id: string; push_tokens: string[] }>;
    expect(zeilen.map((z) => z.user_id)).toEqual([aktiv.uid]);
    expect(zeilen[0].push_tokens).toEqual(['pl-aktiv']);

    const { error: mensch } = await chefin.client.rpc('push_vorgaben', { p_uids: [aktiv.uid] });
    expect(mensch).not.toBeNull();
  }, 60_000);
});
