/**
 * V14 (Durchsicht 15.11.2026): „Passwort vergessen“ mit Benutzername landet
 * als Aufgabe bei der Leitung — ohne zu verraten, ob es das Konto gibt.
 *
 * VORHER: die Maske sagte „das Büro vergibt ein neues“; das Büro erfuhr es
 * nur durch einen Anruf.
 *
 * GEPRÜFT gegen die echte Datenbank (und `passwort-vergeben` über die Edge
 * Function): die Bitte entsteht ohne Anmeldung; die Antwort ist immer
 * dieselbe; je Konto höchstens eine offene; nur die Spitze liest sie;
 * Verwerfen und ein neues Startpasswort erledigen sie.
 *
 * GEGENPROBE (Erwartung): ohne `20261116075000_passwort_hilfe.sql` gibt es
 * die Funktion und die Tabelle nicht — alle Fälle rot; ohne den Aufruf in
 * `passwort-vergeben` ist „ein neues Startpasswort erledigt sie“ rot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, ANON, API, betriebAnlegen, deaktivieren, konto, type Konto } from './helfer';
import { kunstadresse } from '../../shared/benutzername';

const BETRIEB = 'pw-hilfe-a';
const FREMD = 'pw-hilfe-b';
const VERGEBEN = `${API}/functions/v1/passwort-vergeben`;

let chefin: Konto;
let monteur: Konto;
let fremdeChefin: Konto;
const anon = createClient(API, ANON, { auth: { persistSession: false } });

async function benutzerkonto(betrieb = BETRIEB) {
  const name = `pwh.${crypto.randomUUID().slice(0, 8)}`;
  const email = kunstadresse(name);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'Anfang-2026!', email_confirm: true,
    app_metadata: { company_id: betrieb, role: 'Mitarbeiter', active: true },
  });
  if (error) throw error;
  const uid = data.user!.id;
  const { error: f } = await admin.from('users').upsert({
    id: uid, company_id: betrieb, name: `Max ${name}`, email, role: 'Mitarbeiter', active: true,
  });
  if (f) throw new Error(f.message);
  return { uid, name, email };
}

async function offene(uid: string) {
  const { data } = await admin.from('passwort_anfragen').select('id, erledigt_wie')
    .eq('user_id', uid).is('erledigt_am', null);
  return data ?? [];
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'pwh-chefin');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'pwh-monteur');
  fremdeChefin = await konto(FREMD, 'Geschäftsführung', 'pwh-fremd');
}, 180_000);

describe('Die Bitte aus der Anmeldemaske', () => {
  it('entsteht ohne Anmeldung — auch mit großem Anfangsbuchstaben getippt', async () => {
    const k = await benutzerkonto();
    const { error } = await anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: k.email.toUpperCase() });
    expect(error).toBeNull();
    expect(await offene(k.uid)).toHaveLength(1);
  }, 60_000);

  it('verrät nichts: unbekannter Name, deaktiviertes Konto, E-Mail-Konto — dieselbe Antwort, keine Bitte', async () => {
    const weg = await benutzerkonto();
    await deaktivieren(weg.uid);
    const antworten = await Promise.all([
      anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: kunstadresse('gibt.es.nicht.v14') }),
      anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: weg.email }),
      anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: 'chefin@perl.at' }),
    ]);
    for (const a of antworten) {
      expect(a.error).toBeNull();
      expect(a.data).toBeNull();
    }
    expect(await offene(weg.uid)).toHaveLength(0);
  }, 60_000);

  it('je Konto höchstens eine offene Bitte — und gleich danach keine neue', async () => {
    const k = await benutzerkonto();
    for (let i = 0; i < 3; i += 1) await anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: k.email });
    expect(await offene(k.uid)).toHaveLength(1);
  }, 60_000);

  it('nur die Spitze des eigenen Betriebs liest sie', async () => {
    const k = await benutzerkonto();
    await anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: k.email });
    const sicht = async (wer: Konto) =>
      ((await wer.client.from('passwort_anfragen').select('id').eq('user_id', k.uid)).data ?? []).length;
    expect(await sicht(chefin)).toBe(1);
    expect(await sicht(monteur)).toBe(0);
    expect(await sicht(fremdeChefin)).toBe(0);
    expect(((await anon.from('passwort_anfragen').select('id')).data ?? []).length).toBe(0);
  }, 60_000);

  it('die Spitze verwirft sie; eine fremde Leitung kann das nicht', async () => {
    const k = await benutzerkonto();
    await anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: k.email });
    const [{ id }] = await offene(k.uid);
    await fremdeChefin.client.rpc('passwort_anfrage_verwerfen', { p_id: id });
    expect(await offene(k.uid)).toHaveLength(1);
    expect((await monteur.client.rpc('passwort_anfrage_verwerfen', { p_id: id })).error?.code).toBe('42501');
    expect((await chefin.client.rpc('passwort_anfrage_verwerfen', { p_id: id })).error).toBeNull();
    expect(await offene(k.uid)).toHaveLength(0);
    const { data } = await admin.from('passwort_anfragen').select('erledigt_wie, erledigt_von').eq('id', id).single();
    expect(data).toEqual({ erledigt_wie: 'verworfen', erledigt_von: chefin.uid });
  }, 60_000);

  it('ein neues Startpasswort erledigt sie', async () => {
    const k = await benutzerkonto();
    await anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: k.email });
    const antwort = await fetch(VERGEBEN, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${chefin.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: k.uid, passwort: 'Neu-Start-2026' }),
    });
    expect(antwort.status).toBe(200);
    await antwort.body?.cancel();
    expect(await offene(k.uid)).toHaveLength(0);
    const { data } = await admin.from('passwort_anfragen').select('erledigt_wie, erledigt_von').eq('user_id', k.uid).single();
    expect(data).toEqual({ erledigt_wie: 'startpasswort', erledigt_von: chefin.uid });
  }, 120_000);

  it('niemand schreibt direkt in die Tabelle', async () => {
    const { error } = await chefin.client.from('passwort_anfragen').insert({ company_id: BETRIEB, user_id: monteur.uid });
    expect(error).not.toBeNull();
  }, 30_000);

  it('steht in der Datenauskunft der Person und geht mit ihrer Löschung', async () => {
    const k = await benutzerkonto();
    await anon.rpc('passwort_hilfe_anfragen', { p_anmeldung: k.email });
    const { data: auskunft } = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: k.uid });
    expect((auskunft as { daten: { passwort_anfragen: unknown[] } }).daten.passwort_anfragen).toHaveLength(1);

    await deaktivieren(k.uid);
    const { data: bericht, error } = await chefin.client.rpc('person_loeschen', {
      p_art: 'mitarbeiter', p_id: k.uid, p_nur_pruefen: false,
    });
    expect(error).toBeNull();
    expect((bericht as { sofort: Record<string, number> }).sofort.passwort_anfragen).toBe(1);
    const { data: rest } = await admin.from('passwort_anfragen').select('id').eq('user_id', k.uid);
    expect(rest ?? []).toHaveLength(0);
  }, 120_000);
});
