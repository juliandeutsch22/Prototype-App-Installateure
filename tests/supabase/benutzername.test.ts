/**
 * Anmelden mit Benutzername — gegen den laufenden Stapel.
 *
 * WAS HIER AUF DEM PRÜFSTAND STEHT. Zwei Edge Functions und der
 * Anmeldedienst dazwischen:
 *
 *   1. `mitarbeiter-anlegen` legt ein Konto unter einer Kunstadresse an und
 *      markiert das Anfangspasswort als Startpasswort.
 *   2. `passwort-vergeben` setzt einem solchen Konto ein neues Startpasswort
 *      — und NUR einem solchen. Das ist die tragende Grenze: sonst könnte
 *      die Geschäftsführung sich still in das Konto jedes Kollegen setzen,
 *      der eine eigene Adresse hat.
 *
 * Wie bei jeder Function hier zählt die ABWEISUNG so viel wie der glückliche
 * Fall.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, API, ANON, betriebAnlegen, konto, deaktivieren, type Konto } from './helfer';
import { anmeldeAdresse, kunstadresse } from '../../shared/benutzername';

const ANLEGEN = `${API}/functions/v1/mitarbeiter-anlegen`;
const VERGEBEN = `${API}/functions/v1/passwort-vergeben`;
const BETRIEB = 'benutzername-a';
const FREMD = 'benutzername-b';

let chefin: Konto;
let admina: Konto;
let monteur: Konto;
let fremdeChefin: Konto;

async function rufe(url: string, token: string | null, rumpf: unknown) {
  const kopf: Record<string, string> = { apikey: ANON, 'Content-Type': 'application/json' };
  if (token) kopf.Authorization = `Bearer ${token}`;
  const antwort = await fetch(url, { method: 'POST', headers: kopf, body: JSON.stringify(rumpf) });
  return { status: antwort.status, daten: await antwort.json().catch(() => ({})) };
}

/** Meldet sich so an, wie die Anmeldemaske es tut — mit dem getippten Namen. */
async function anmeldbar(eingabe: string, passwort: string): Promise<boolean> {
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({
    email: anmeldeAdresse(eingabe), password: passwort,
  });
  return !error;
}

const frischerName = (marke = 'monteur') => `${marke}.${crypto.randomUUID().slice(0, 8)}`;

/** Ein Benutzernamen-Konto samt Belegschaftszeile, direkt über den Dienst. */
async function benutzerkonto(betrieb: string, rolle = 'Mitarbeiter') {
  const name = frischerName();
  const email = kunstadresse(name);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'Anfang-2026!', email_confirm: true,
    app_metadata: { company_id: betrieb, role: rolle, active: true },
  });
  if (error) throw error;
  const uid = data.user!.id;
  const { error: f } = await admin.from('users').upsert({
    id: uid, company_id: betrieb, name, email, role: rolle, active: true,
  });
  if (f) throw new Error(f.message);
  return { uid, name };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  admina = await konto(BETRIEB, 'Administrator', 'admina');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'monteur');
  fremdeChefin = await konto(FREMD, 'Geschäftsführung', 'fremd');
}, 180_000);

describe('Anlegen mit Benutzername', () => {
  it('legt ein Konto an, mit dem man sich unter dem Namen anmeldet', async () => {
    const name = frischerName();
    const { status, daten } = await rufe(ANLEGEN, chefin.token, {
      email: kunstadresse(name), passwort: 'Anfang-2026!',
    });
    expect(status).toBe(200);
    // Getippt wird am Telefon gern mit grossem Anfangsbuchstaben.
    expect(await anmeldbar(name.toUpperCase(), 'Anfang-2026!')).toBe(true);

    // Das Anfangspasswort kennt das Büro — beim ersten Anmelden wird gefragt.
    const { data } = await admin.auth.admin.getUserById(String(daten.uid));
    expect(data.user?.user_metadata?.startpasswort).toBe(true);
  }, 120_000);

  it('weist einen Namen ab, den die Anmeldemaske nie treffen würde', async () => {
    // Auch wer die Function direkt ruft, bringt ihn nicht durch.
    const { status, daten } = await rufe(ANLEGEN, chefin.token, {
      email: kunstadresse('max..huber'), passwort: 'Anfang-2026!',
    });
    expect(status).toBe(400);
    expect(daten.error).toMatch(/Zwei Punkte/);
  }, 120_000);

  it('sagt „schon vergeben" — auch wenn der Name einem anderen Betrieb gehört', async () => {
    const name = frischerName();
    expect((await rufe(ANLEGEN, chefin.token, {
      email: kunstadresse(name), passwort: 'Anfang-2026!',
    })).status).toBe(200);

    const { status, daten } = await rufe(ANLEGEN, fremdeChefin.token, {
      email: kunstadresse(name), passwort: 'Anfang-2026!',
    });
    expect(status).toBe(409);
    expect(daten.error).toMatch(/gibt es schon/);
    // Mehr als den Namen selbst verrät die Meldung nicht.
    expect(daten.error).not.toMatch(new RegExp(BETRIEB));
  }, 120_000);
});

describe('Ein neues Startpasswort vergeben', () => {
  it('die Geschäftsführung: das alte gilt nicht mehr, das neue ist wieder ein Startpasswort', async () => {
    const { uid, name } = await benutzerkonto(BETRIEB);
    // Er hatte schon ein eigenes gesetzt — die Marke war weg.
    await admin.auth.admin.updateUserById(uid, { user_metadata: { startpasswort: false } });

    const { status } = await rufe(VERGEBEN, chefin.token, { uid, passwort: 'Neu-Start-2026' });
    expect(status).toBe(200);
    expect(await anmeldbar(name, 'Anfang-2026!')).toBe(false);
    expect(await anmeldbar(name, 'Neu-Start-2026')).toBe(true);

    const { data } = await admin.auth.admin.getUserById(uid);
    expect(data.user?.user_metadata?.startpasswort).toBe(true);
  }, 120_000);

  it('NICHT für ein Konto mit E-Mail-Adresse — dort setzt der Mensch sein Passwort selbst', async () => {
    /*
      DIE TRAGENDE GRENZE DIESER FUNCTION. Ohne sie könnte die
      Geschäftsführung das Passwort jedes Kollegen umstellen, sich
      anmelden, und der Betroffene merkte es erst am nächsten Morgen.
    */
    const { status, daten } = await rufe(VERGEBEN, chefin.token, {
      uid: monteur.uid, passwort: 'Uebernahme-2026',
    });
    expect(status).toBe(409);
    expect(daten.error).toMatch(/E-Mail-Adresse/);
    const { data } = await admin.auth.admin.getUserById(monteur.uid);
    expect(await anmeldbar(data.user!.email!, 'Uebernahme-2026')).toBe(false);
  }, 120_000);

  it('nicht durch einen Monteur', async () => {
    const { uid, name } = await benutzerkonto(BETRIEB);
    const { status } = await rufe(VERGEBEN, monteur.token, { uid, passwort: 'Monteur-2026!' });
    expect(status).toBe(403);
    expect(await anmeldbar(name, 'Monteur-2026!')).toBe(false);
  }, 120_000);

  it('nicht über die Betriebsgrenze — und die Antwort verrät nicht, ob es die Kennung gibt', async () => {
    const { uid, name } = await benutzerkonto(BETRIEB);
    const fremd = await rufe(VERGEBEN, fremdeChefin.token, { uid, passwort: 'Fremd-2026!!' });
    const erfunden = await rufe(VERGEBEN, fremdeChefin.token, {
      uid: crypto.randomUUID(), passwort: 'Fremd-2026!!',
    });
    expect(fremd.status).toBe(404);
    expect(fremd).toEqual(erfunden);
    expect(await anmeldbar(name, 'Fremd-2026!!')).toBe(false);
  }, 120_000);

  it('einem Administrator nur durch einen Administrator', async () => {
    const { uid, name } = await benutzerkonto(BETRIEB, 'Administrator');
    expect((await rufe(VERGEBEN, chefin.token, { uid, passwort: 'Chefin-2026!' })).status)
      .toBe(403);
    expect(await anmeldbar(name, 'Chefin-2026!')).toBe(false);

    expect((await rufe(VERGEBEN, admina.token, { uid, passwort: 'Admina-2026!' })).status)
      .toBe(200);
    expect(await anmeldbar(name, 'Admina-2026!')).toBe(true);
  }, 120_000);

  it('nicht das eigene — das gehört unter „Mein Konto"', async () => {
    const { status } = await rufe(VERGEBEN, chefin.token, {
      uid: chefin.uid, passwort: 'Selbst-2026!',
    });
    expect(status).toBe(400);
  }, 120_000);

  it('nicht ohne Anmeldung, nicht zu kurz, nicht ohne Kennung', async () => {
    const { uid } = await benutzerkonto(BETRIEB);
    expect((await rufe(VERGEBEN, null, { uid, passwort: 'Ohne-2026!!' })).status).toBe(401);
    expect((await rufe(VERGEBEN, chefin.token, { uid, passwort: 'kurz' })).status).toBe(400);
    expect((await rufe(VERGEBEN, chefin.token, { passwort: 'Ohne-2026!!' })).status).toBe(400);
  }, 120_000);

  it('nicht durch eine deaktivierte Geschäftsführung', async () => {
    const { uid, name } = await benutzerkonto(BETRIEB);
    const gesperrt = await konto(BETRIEB, 'Geschäftsführung', 'gesperrt');
    await deaktivieren(gesperrt.uid);
    const { status } = await rufe(VERGEBEN, gesperrt.token, { uid, passwort: 'Gesperrt-2026!' });
    // 401: die Sperre beendet die Sitzung, bevor die Function sie ansieht.
    expect([401, 403]).toContain(status);
    expect(await anmeldbar(name, 'Gesperrt-2026!')).toBe(false);
  }, 120_000);
});
