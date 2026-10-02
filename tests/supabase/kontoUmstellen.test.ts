/**
 * Konto umstellen zwischen E-Mail und Benutzername — gegen den laufenden
 * Stapel (Entscheidung vom 02.10.2026).
 *
 * Geprüft wird die Edge Function `konto-umstellen` samt der beiden
 * Datenbankfunktionen dahinter. Jede Grenze mit ihrer Gegenprobe:
 *   - wer darf (nur die Spitze, einen Administrator nur ein Administrator,
 *     nur im eigenen Betrieb, das eigene Konto nur auf die E-Mail),
 *   - was geschieht (Anmeldung, Belegschaftszeile, Sitzungen, Protokoll),
 *   - wer das Protokoll liest, und dass es in die Datenauskunft geht.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, API, ANON, betriebAnlegen, konto, type Konto } from './helfer';
import { anmeldeAdresse, kunstadresse } from '../../shared/benutzername';

const UMSTELLEN = `${API}/functions/v1/konto-umstellen`;
const BETRIEB = 'umstellen-a';
const FREMD = 'umstellen-b';
const PASSWORT = 'Anfang-2026!';

let chefin: Konto;
let admina: Konto;
let buch: Konto;
let fremdeChefin: Konto;

async function rufe(token: string | null, rumpf: unknown) {
  const kopf: Record<string, string> = { apikey: ANON, 'Content-Type': 'application/json' };
  if (token) kopf.Authorization = `Bearer ${token}`;
  const antwort = await fetch(UMSTELLEN, { method: 'POST', headers: kopf, body: JSON.stringify(rumpf) });
  return { status: antwort.status, daten: await antwort.json().catch(() => ({})) };
}

async function anmeldbar(eingabe: string, passwort: string): Promise<boolean> {
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: anmeldeAdresse(eingabe), password: passwort });
  return !error;
}

const frisch = (marke: string) => `${marke}.${crypto.randomUUID().slice(0, 8)}`;

/** Ein Konto samt Belegschaftszeile, direkt über den Dienst — mit Benutzername oder E-Mail. */
async function person(betrieb: string, art: 'benutzername' | 'mail', rolle = 'Mitarbeiter') {
  const name = frisch(art === 'mail' ? 'mail' : 'monteur');
  const email = art === 'mail' ? `${name}@perl.at` : kunstadresse(name);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORT, email_confirm: true,
    app_metadata: { company_id: betrieb, role: rolle, active: true },
  });
  if (error) throw error;
  const uid = data.user!.id;
  const { error: f } = await admin.from('users').upsert({ id: uid, company_id: betrieb, name, email, role: rolle, active: true });
  if (f) throw new Error(f.message);
  return { uid, name, email };
}

async function anmeldung(uid: string) {
  const { data } = await admin.auth.admin.getUserById(uid);
  const { data: zeile } = await admin.from('users').select('email').eq('id', uid).single();
  return { auth: data.user?.email, belegschaft: zeile?.email, startpasswort: data.user?.user_metadata?.startpasswort };
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'chefin');
  admina = await konto(BETRIEB, 'Administrator', 'admina');
  buch = await konto(BETRIEB, 'Buchhaltung', 'buch');
  fremdeChefin = await konto(FREMD, 'Geschäftsführung', 'fremd');
}, 180_000);

describe('Vom Benutzernamen auf die E-Mail', () => {
  it('meldet sich danach mit der Adresse an, das Passwort bleibt, die Belegschaft zieht nach', async () => {
    const p = await person(BETRIEB, 'benutzername');
    const adresse = `${frisch('neu')}@perl.at`;
    const { status, daten } = await rufe(chefin.token, { uid: p.uid, nach: 'mail', email: adresse.toUpperCase() });
    expect(status).toBe(200);
    expect(daten.anmeldung).toBe(adresse);
    expect(daten.startpasswort).toBeUndefined();

    expect(await anmeldung(p.uid)).toMatchObject({ auth: adresse, belegschaft: adresse });
    expect(await anmeldbar(adresse, PASSWORT)).toBe(true);
    // Gegenprobe: der Benutzername gilt nicht mehr.
    expect(await anmeldbar(p.name, PASSWORT)).toBe(false);

    const { data: z } = await admin.from('konto_umstellungen').select('*').eq('user_id', p.uid);
    expect(z).toEqual([expect.objectContaining({ nach: 'mail', durch: chefin.uid, grund: null, company_id: BETRIEB })]);
  }, 120_000);

  it('beendet keine Sitzung', async () => {
    const p = await person(BETRIEB, 'benutzername');
    const c = createClient(API, ANON, { auth: { persistSession: false } });
    expect((await c.auth.signInWithPassword({ email: p.email, password: PASSWORT })).error).toBeNull();
    expect((await rufe(chefin.token, { uid: p.uid, nach: 'mail', email: `${frisch('s')}@perl.at` })).status).toBe(200);
    expect((await c.auth.refreshSession()).error).toBeNull();
  }, 120_000);

  it('das eigene Konto geht — die Empfehlung der Startseite bei der einzigen Leitung ohne E-Mail', async () => {
    const ich = await person(BETRIEB, 'benutzername', 'Geschäftsführung');
    const c = createClient(API, ANON, { auth: { persistSession: false } });
    const an = await c.auth.signInWithPassword({ email: ich.email, password: PASSWORT });
    expect(an.error).toBeNull();
    const { status } = await rufe(an.data.session!.access_token, { uid: ich.uid, nach: 'mail', email: `${frisch('ich')}@perl.at` });
    expect(status).toBe(200);
  }, 120_000);

  it('weist eine unvollständige Adresse und einen Benutzernamen als Adresse ab', async () => {
    const p = await person(BETRIEB, 'benutzername');
    expect((await rufe(chefin.token, { uid: p.uid, nach: 'mail', email: 'petra@perl' })).status).toBe(400);
    expect((await rufe(chefin.token, { uid: p.uid, nach: 'mail', email: kunstadresse('petra') })).status).toBe(400);
    expect((await anmeldung(p.uid)).auth).toBe(p.email);
  }, 120_000);

  it('eine schon vergebene Adresse: allgemein abgewiesen, nichts geändert', async () => {
    const p = await person(BETRIEB, 'benutzername');
    const anderer = await person(FREMD, 'mail');
    const { status, daten } = await rufe(chefin.token, { uid: p.uid, nach: 'mail', email: anderer.email });
    expect(status).toBe(409);
    expect(daten.error).toMatch(/andere Adresse/);
    expect(daten.error).not.toMatch(new RegExp(FREMD));
    expect(await anmeldung(p.uid)).toMatchObject({ auth: p.email, belegschaft: p.email });
  }, 120_000);
});

describe('Von der E-Mail auf den Benutzernamen', () => {
  it('Startpasswort, alle Sitzungen beendet, Grund im Protokoll', async () => {
    const p = await person(BETRIEB, 'mail');
    const c = createClient(API, ANON, { auth: { persistSession: false } });
    expect((await c.auth.signInWithPassword({ email: p.email, password: PASSWORT })).error).toBeNull();

    const name = frisch('neu');
    const { status, daten } = await rufe(chefin.token, { uid: p.uid, nach: 'benutzername', benutzername: name, grund: 'Kein Postfach am Diensttelefon' });
    expect(status).toBe(200);
    expect(daten.startpasswort).toMatch(/.{14}/);

    const jetzt = await anmeldung(p.uid);
    expect(jetzt).toMatchObject({ auth: kunstadresse(name), belegschaft: kunstadresse(name), startpasswort: true });
    expect(await anmeldbar(name, daten.startpasswort)).toBe(true);
    expect(await anmeldbar(p.email, PASSWORT)).toBe(false);
    // Nicht still: die bisherige Sitzung ist weg.
    expect((await c.auth.refreshSession()).error).not.toBeNull();

    const { data: z } = await admin.from('konto_umstellungen').select('*').eq('user_id', p.uid);
    expect(z).toEqual([expect.objectContaining({ nach: 'benutzername', grund: 'Kein Postfach am Diensttelefon', durch: chefin.uid })]);
  }, 120_000);

  it('ohne Grund nicht', async () => {
    const p = await person(BETRIEB, 'mail');
    const { status, daten } = await rufe(chefin.token, { uid: p.uid, nach: 'benutzername', benutzername: frisch('x'), grund: '  ' });
    expect(status).toBe(400);
    expect(daten.error).toMatch(/Grund/);
    expect((await anmeldung(p.uid)).auth).toBe(p.email);
  }, 120_000);

  it('das eigene Konto nicht — das macht eine zweite Leitung', async () => {
    const { status, daten } = await rufe(chefin.token, { uid: chefin.uid, nach: 'benutzername', benutzername: frisch('ich'), grund: 'Test' });
    expect(status).toBe(403);
    expect(daten.error).toMatch(/eigene Konto/);
  }, 120_000);

  it('ein ungültiger Benutzername wird abgewiesen', async () => {
    const p = await person(BETRIEB, 'mail');
    const { status } = await rufe(chefin.token, { uid: p.uid, nach: 'benutzername', benutzername: 'max..huber', grund: 'Test' });
    expect(status).toBe(400);
  }, 120_000);
});

describe('Wer darf', () => {
  it('die Buchhaltung nicht', async () => {
    const p = await person(BETRIEB, 'benutzername');
    const { status } = await rufe(buch.token, { uid: p.uid, nach: 'mail', email: `${frisch('b')}@perl.at` });
    expect(status).toBe(403);
    expect((await anmeldung(p.uid)).auth).toBe(p.email);
  }, 120_000);

  it('ohne Anmeldung niemand', async () => {
    const p = await person(BETRIEB, 'benutzername');
    expect((await rufe(null, { uid: p.uid, nach: 'mail', email: `${frisch('n')}@perl.at` })).status).toBe(401);
  }, 120_000);

  it('ein fremder Betrieb sagt dasselbe wie eine unbekannte Kennung', async () => {
    const p = await person(BETRIEB, 'benutzername');
    const fremd = await rufe(fremdeChefin.token, { uid: p.uid, nach: 'mail', email: `${frisch('f')}@perl.at` });
    const unbekannt = await rufe(fremdeChefin.token, { uid: crypto.randomUUID(), nach: 'mail', email: `${frisch('u')}@perl.at` });
    expect(fremd.status).toBe(404);
    expect(fremd.daten.error).toBe(unbekannt.daten.error);
    expect((await anmeldung(p.uid)).auth).toBe(p.email);
  }, 120_000);

  it('einen Administrator nur ein Administrator (Gegenprobe: der Administrator darf)', async () => {
    const a = await person(BETRIEB, 'benutzername', 'Administrator');
    const gf = await rufe(chefin.token, { uid: a.uid, nach: 'mail', email: `${frisch('a')}@perl.at` });
    expect(gf.status).toBe(403);
    expect(gf.daten.error).toMatch(/Administrator/);
    expect((await rufe(admina.token, { uid: a.uid, nach: 'mail', email: `${frisch('a')}@perl.at` })).status).toBe(200);
  }, 120_000);

  it('in die Richtung, in der das Konto schon steht, nicht', async () => {
    const m = await person(BETRIEB, 'mail');
    const b = await person(BETRIEB, 'benutzername');
    expect((await rufe(chefin.token, { uid: m.uid, nach: 'mail', email: `${frisch('m')}@perl.at` })).status).toBe(409);
    expect((await rufe(chefin.token, { uid: b.uid, nach: 'benutzername', benutzername: frisch('b'), grund: 'Test' })).status).toBe(409);
  }, 120_000);

  it('die beiden Datenbankfunktionen ruft kein angemeldetes Konto direkt', async () => {
    const p = await person(BETRIEB, 'benutzername');
    const pruefen = await chefin.client.rpc('konto_umstellen_pruefen', { p_aufrufer: chefin.uid, p_uid: p.uid, p_nach: 'mail' });
    expect(pruefen.error).not.toBeNull();
    const fest = await chefin.client.rpc('konto_umstellen_festhalten', {
      p_aufrufer: chefin.uid, p_uid: p.uid, p_nach: 'mail', p_anmeldung: 'x@perl.at', p_grund: null,
    });
    expect(fest.error).not.toBeNull();
    expect(await anmeldung(p.uid)).toMatchObject({ belegschaft: p.email });
  }, 120_000);
});

describe('Das Protokoll', () => {
  let umgestellt: string;

  beforeAll(async () => {
    const p = await person(BETRIEB, 'benutzername');
    umgestellt = p.uid;
    const { status } = await rufe(chefin.token, { uid: p.uid, nach: 'mail', email: `${frisch('p')}@perl.at` });
    expect(status).toBe(200);
  }, 120_000);

  it('liest die Leitung des Betriebs', async () => {
    const { data, error } = await admina.client.from('konto_umstellungen').select('nach, durch_name').eq('user_id', umgestellt);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('nicht die Buchhaltung und kein fremder Betrieb (Gegenprobe)', async () => {
    expect((await buch.client.from('konto_umstellungen').select('id').eq('user_id', umgestellt)).data).toEqual([]);
    expect((await fremdeChefin.client.from('konto_umstellungen').select('id').eq('user_id', umgestellt)).data).toEqual([]);
  });

  it('schreibt auch die Leitung nicht selbst hinein', async () => {
    const { error } = await chefin.client.from('konto_umstellungen').insert({
      company_id: BETRIEB, user_id: umgestellt, nach: 'mail', durch: chefin.uid,
    });
    expect(error).not.toBeNull();
  });

  it('steht in der Datenauskunft der Person — und als Anzahl bei der, die umgestellt hat', async () => {
    const person = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: umgestellt });
    expect(person.error).toBeNull();
    expect(person.data.daten.kontoumstellungen).toEqual([expect.objectContaining({ nach: 'mail', durch: chefin.uid })]);

    const ich = await chefin.client.rpc('person_auskunft', { p_art: 'mitarbeiter', p_id: chefin.uid });
    expect(ich.error).toBeNull();
    expect(ich.data.als_bearbeiter.konten_umgestellt).toBeGreaterThanOrEqual(1);
    expect(ich.data.als_bearbeiter).toHaveProperty('lagerbewegungen_erfasst');
  });
});
