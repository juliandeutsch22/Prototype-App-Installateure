/**
 * Das Fehlerprotokoll — gegen die echte Datenbank.
 *
 * Geprüft wird, was die Zusage trägt: jeder schreibt, nur die Spitze liest,
 * niemand ändert, wer und wann setzt die Datenbank, eine Schleife flutet
 * nichts, und die Plattform sieht Technik — eine Meldung nur mit Häkchen.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, plattformkonto, API, ANON, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { fehlerEintragen, listFehlerprotokoll, plattformFehler } from '@/lib/db/pg/fehlerprotokoll';

const BETRIEB = 'fehler-proto';
const FREMD = 'fehler-proto-fremd';
const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let monteur: Konto;
let chefin: Konto;
let admin_: Konto;
let leitung: Konto;
let buch: Konto;
let fremdChef: Konto;
let plattform: Konto;
let db: Client;

const absturz = (nachricht: string) => ({ art: 'absturz' as const, nachricht, pfad: '/time', fassung: 'test' });

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  await admin.from('fehlerprotokoll').delete().in('company_id', [BETRIEB, FREMD]);
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'fpmont');
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'fpchef');
  admin_ = await konto(BETRIEB, 'Administrator', 'fpadm');
  leitung = await konto(BETRIEB, 'Projektleiter', 'fppl');
  buch = await konto(BETRIEB, 'Buchhaltung', 'fpbuch');
  fremdChef = await konto(FREMD, 'Geschäftsführung', 'fpfremd');
  plattform = await plattformkonto('fpplatt');
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
}, 120_000);

afterAll(async () => {
  clientEinreichen(null);
  await db?.end();
});

describe('Schreiben', () => {
  it('schreibt jeder im Betrieb — Betrieb, Person und Zeit setzt die Datenbank', async () => {
    await fehlerEintragen(absturz('TypeError: x is undefined'), monteur.client);
    const { data } = await admin.from('fehlerprotokoll').select('*')
      .eq('company_id', BETRIEB).eq('nachricht', 'TypeError: x is undefined');
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(monteur.uid);
    expect(Date.now() - Date.parse(data![0].created_at)).toBeLessThan(60_000);
  });

  it('lässt sich keinem Kollegen unterschieben und nicht zurückdatieren', async () => {
    const { error } = await monteur.client.from('fehlerprotokoll').insert({
      art: 'fehler', nachricht: 'untergeschoben', user_id: chefin.uid, created_at: '2020-01-01T00:00:00Z',
    });
    expect(error).toBeNull();
    const { data } = await admin.from('fehlerprotokoll').select('user_id, created_at')
      .eq('nachricht', 'untergeschoben').single();
    expect(data!.user_id).toBe(monteur.uid);
    expect(new Date(data!.created_at).getFullYear()).toBeGreaterThan(2020);
  });

  it('nicht in einen fremden Betrieb, und nicht ohne Anmeldung', async () => {
    const fremd = await monteur.client.from('fehlerprotokoll')
      .insert({ company_id: FREMD, art: 'fehler', nachricht: 'fremd' });
    expect(fremd.error).not.toBeNull();
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    const ohne = await anon.from('fehlerprotokoll').insert({ art: 'fehler', nachricht: 'anonym' });
    expect(ohne.error).not.toBeNull();
  });

  it('prüft die Form: Meldung braucht Text, Fehler eine Nachricht, der Support nur Meldungen', async () => {
    await expect(fehlerEintragen({ art: 'meldung', beschreibung: '  ' }, monteur.client)).rejects.toThrow();
    await expect(fehlerEintragen({ art: 'fehler', nachricht: '' }, monteur.client)).rejects.toThrow();
    await expect(fehlerEintragen({ art: 'fehler', nachricht: 'x', anSupport: true }, monteur.client))
      .rejects.toThrow();
    await expect(fehlerEintragen({ art: 'fehler', nachricht: 'x'.repeat(501) }, monteur.client))
      .rejects.toThrow();
  });

  it('drosselt eine Schleife auf 30 Einträge je Stunde — still', async () => {
    const schleife = await konto(BETRIEB, 'Mitarbeiter', 'fpschleife');
    for (let i = 0; i < 33; i++) {
      await fehlerEintragen({ art: 'absturz', nachricht: `Schleife ${i}` }, schleife.client);
    }
    const { count } = await admin.from('fehlerprotokoll').select('id', { count: 'exact', head: true })
      .eq('user_id', schleife.uid);
    expect(count).toBe(30);
  });
});

describe('Lesen', () => {
  it('liest nur die Spitze des eigenen Betriebs', async () => {
    await fehlerEintragen(absturz('Fremder Absturz'), fremdChef.client);

    clientEinreichen(chefin.client);
    const beiChefin = await listFehlerprotokoll(BETRIEB);
    expect(beiChefin.map((e) => e.nachricht)).toContain('TypeError: x is undefined');
    expect(beiChefin.map((e) => e.nachricht)).not.toContain('Fremder Absturz');
    expect(typeof beiChefin[0].createdAt).toBe('number');

    clientEinreichen(admin_.client);
    expect((await listFehlerprotokoll(BETRIEB)).length).toBeGreaterThan(0);

    for (const k of [monteur, leitung, buch]) {
      const { data } = await k.client.from('fehlerprotokoll').select('id').eq('company_id', BETRIEB);
      expect(data).toEqual([]);
    }
  });

  it('ändert und löscht niemand', async () => {
    const auf = await chefin.client.from('fehlerprotokoll').update({ nachricht: 'geändert' })
      .eq('company_id', BETRIEB).select('id');
    expect(auf.data ?? []).toEqual([]);
    const weg = await chefin.client.from('fehlerprotokoll').delete().eq('company_id', BETRIEB).select('id');
    expect(weg.data ?? []).toEqual([]);
    const { count } = await admin.from('fehlerprotokoll').select('id', { count: 'exact', head: true })
      .eq('nachricht', 'TypeError: x is undefined');
    expect(count).toBe(1);
  });
});

describe('Die Plattform', () => {
  it('sieht Technik aus allen Betrieben, ohne Person — eine Meldung nur mit Häkchen', async () => {
    await fehlerEintragen({ art: 'meldung', beschreibung: 'Nur fürs Büro' }, monteur.client);
    await fehlerEintragen({ art: 'meldung', beschreibung: 'Bitte an den Support', anSupport: true }, monteur.client);

    const liste = await plattformFehler(14, plattform.client);
    const hier = liste.filter((f) => f.companyId === BETRIEB || f.companyId === FREMD);
    expect(hier.map((f) => f.nachricht)).toEqual(
      expect.arrayContaining(['TypeError: x is undefined', 'Fremder Absturz']),
    );
    expect(hier.find((f) => f.companyId === BETRIEB)!.betrieb).toBe(BETRIEB);
    const beschreibungen = hier.filter((f) => f.art === 'meldung').map((f) => f.beschreibung);
    expect(beschreibungen).toContain('Bitte an den Support');
    expect(beschreibungen).not.toContain('Nur fürs Büro');
    expect(Object.keys(hier[0])).not.toContain('userId');
  });

  it('liest die Tabelle selbst nicht, und ein Betrieb bekommt über die Funktion nichts', async () => {
    const { data } = await plattform.client.from('fehlerprotokoll').select('id');
    expect(data).toEqual([]);
    expect(await plattformFehler(14, chefin.client)).toEqual([]);
  });
});

describe('Aufräumen', () => {
  it('löscht nach 90 Tagen, und nur dann', async () => {
    // Der Dienstschlüssel darf den Zeitpunkt setzen — wie der Rücklauf.
    await admin.from('fehlerprotokoll').insert([
      { company_id: BETRIEB, art: 'fehler', nachricht: 'uralt', created_at: new Date(Date.now() - 91 * 864e5).toISOString() },
      { company_id: BETRIEB, art: 'fehler', nachricht: 'jung genug', created_at: new Date(Date.now() - 89 * 864e5).toISOString() },
    ]);
    await db.query('select app.fehlerprotokoll_aufraeumen()');
    const { data } = await admin.from('fehlerprotokoll').select('nachricht')
      .in('nachricht', ['uralt', 'jung genug']);
    expect(data!.map((z) => z.nachricht)).toEqual(['jung genug']);
  });

  it('ist eingeplant', async () => {
    const { rows } = await db.query("select schedule from cron.job where jobname = 'fehlerprotokoll-aufraeumen'");
    expect(rows).toHaveLength(1);
  });
});
