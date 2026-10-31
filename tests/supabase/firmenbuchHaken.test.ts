/**
 * „IM FIRMENBUCH EINGETRAGEN“ BEI GmbH, AG, KG … FEST (Testbericht Runde 7,
 * 6.1, Auftrag 7.9) — gegen die echte Datenbank.
 *
 * Die App sperrt den Haken in den Firmendaten; hier steht, dass ihn auch
 * niemand an der App vorbei abwählt, dass App und Datenbank dieselben Namen
 * gleich lesen, und dass die Migration abgewählte Altwerte zurücksetzt und
 * es festhält.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { firmenbuchGesperrt, firmenbuchPflichtform } from '@/lib/firmenbuch';

const VERBINDUNG =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const GMBH = 'r7-fb-gmbh';
const GRUENDUNG = 'r7-fb-ig';
const EINZEL = 'r7-fb-einzel';
const ALT = 'r7-fb-alt';
const ALT_EU = 'r7-fb-alt-eu';
const ALT_IG = 'r7-fb-alt-ig';

let db: Client;
let gmbh: Konto;
let gruendung: Konto;
let einzel: Konto;
let alt: Konto;

const angabe = async (id: string) =>
  (await admin.from('companies').select('im_firmenbuch, firmenbuch_korrigiert_am').eq('id', id).single()).data!;

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  await betriebAnlegen(GMBH, 'Perl Installationen GmbH');
  await betriebAnlegen(GRUENDUNG, 'Perl Installationen GmbH i. G.');
  await betriebAnlegen(EINZEL, 'Installateur Franz Huber');
  gmbh = await konto(GMBH, 'Geschäftsführung', 'fbgmbh');
  gruendung = await konto(GRUENDUNG, 'Geschäftsführung', 'fbig');
  einzel = await konto(EINZEL, 'Geschäftsführung', 'fbeinzel');
  // Haken auf leer — ein früherer Lauf kann ihn gesetzt haben.
  for (const id of [GMBH, GRUENDUNG, EINZEL]) {
    await admin.from('companies').update({ im_firmenbuch: null, firmenbuch_korrigiert_am: null }).eq('id', id);
  }
}, 120_000);

afterAll(async () => { await db?.end(); });

describe('App und Datenbank lesen die Rechtsform gleich', () => {
  const NAMEN = [
    'Perl Installationen GmbH', 'Perl Installationen Gmbh', 'Huber Ges.m.b.H.', 'Huber Ges. m. b. H.',
    'Muster Bau GmbH & Co KG', 'Muster Bau GmbH und Co. KG', 'Neu FlexCo', 'Neu FlexKapG', 'Bau AG', 'Haustechnik SE',
    'Maier OG', 'Huber & Co KG', 'Wohnbau eGen', 'Installateure eingetragene Genossenschaft',
    'Perl Installationen GmbH i. G.', 'Perl Installationen GmbH i.G.', 'Perl Installationen GmbH in Gründung',
    'Perl Installationen GmbH (in Gründung)', 'Gruber e.U.', 'Installateur Franz Huber', 'Agrartechnik Moser',
    'Kogler Haustechnik', 'Ogris Bad', 'Segl Installationen', 'GmbH', '', 'Installationen, AG',
  ];

  it('dieselbe Rechtsform, gesperrt oder frei — für jeden Namen', async () => {
    const { rows } = await db.query<{ n: string; form: string | null; gesperrt: string | null }>(
      'select n, app.firmenbuch_pflichtform(n) as form, app.firmenbuch_gesperrt(n) as gesperrt from unnest($1::text[]) n',
      [NAMEN],
    );
    const datenbank = rows.map((r) => [r.n, r.form, r.gesperrt]);
    const app = NAMEN.map((n) => [n, firmenbuchPflichtform(n), firmenbuchGesperrt(n)]);
    expect(datenbank).toEqual(app);
  });
});

describe('Die Regel an der Tabelle', () => {
  it('GmbH: abwählen über die Schnittstelle scheitert — mit dem Satz, warum', async () => {
    const { error } = await gmbh.client.from('companies').update({ im_firmenbuch: false }).eq('id', GMBH);
    expect(error?.code).toBe('23514');
    expect(error?.message).toMatch(/Eine GmbH ist immer im Firmenbuch eingetragen/);
    expect((await angabe(GMBH)).im_firmenbuch).toBeNull();
  });

  it('GmbH: „eingetragen“ und leer gehen wie bisher', async () => {
    expect((await gmbh.client.from('companies').update({ im_firmenbuch: true }).eq('id', GMBH)).error).toBeNull();
    expect((await gmbh.client.from('companies').update({ im_firmenbuch: null }).eq('id', GMBH)).error).toBeNull();
  });

  it('„GmbH i. G.“: frei — abwählen geht', async () => {
    expect((await gruendung.client.from('companies').update({ im_firmenbuch: false }).eq('id', GRUENDUNG)).error).toBeNull();
    expect((await angabe(GRUENDUNG)).im_firmenbuch).toBe(false);
  });

  it('eingetragen, „i. G.“ gestrichen: der alte Wert wird leer — der Name sagt jetzt „eingetragen“', async () => {
    await admin.from('companies').update({ im_firmenbuch: false }).eq('id', GRUENDUNG);
    const { error } = await gruendung.client.from('companies')
      .update({ name: 'Perl Installationen GmbH' }).eq('id', GRUENDUNG);
    expect(error).toBeNull();
    expect((await angabe(GRUENDUNG)).im_firmenbuch).toBeNull();
    await admin.from('companies').update({ name: 'Perl Installationen GmbH i. G.' }).eq('id', GRUENDUNG);
  });

  it('Einzelunternehmen ohne „e.U.“: frei, in beide Richtungen', async () => {
    expect((await einzel.client.from('companies').update({ im_firmenbuch: true }).eq('id', EINZEL)).error).toBeNull();
    expect((await einzel.client.from('companies').update({ im_firmenbuch: false }).eq('id', EINZEL)).error).toBeNull();
    expect((await angabe(EINZEL)).im_firmenbuch).toBe(false);
  });

  it('ein neuer Betrieb als AG lässt sich nicht „nicht eingetragen“ anlegen', async () => {
    await expect(db.query(
      `insert into public.companies (id, name, im_firmenbuch) values ('r7-fb-neu', 'Neu AG', false)`,
    )).rejects.toThrow(/Eine AG ist immer im Firmenbuch eingetragen/);
  });
});

describe('Die Migration: abgewählte Altwerte zurücksetzen und melden', () => {
  beforeAll(async () => {
    // Altbestand wie vor der Migration — der Dienstschlüssel kommt an der Regel vorbei.
    await admin.from('companies').upsert([
      { id: ALT, name: 'Altbetrieb Installationen GmbH', im_firmenbuch: false, firmenbuch_korrigiert_am: null },
      { id: ALT_EU, name: 'Altbetrieb Gruber e.U.', im_firmenbuch: false, firmenbuch_korrigiert_am: null },
      { id: ALT_IG, name: 'Altbetrieb GmbH i. G.', im_firmenbuch: false, firmenbuch_korrigiert_am: null },
    ]);
    alt = await konto(ALT, 'Geschäftsführung', 'fbalt');
    expect((await angabe(ALT)).im_firmenbuch).toBe(false);
  }, 60_000);

  it('setzt genau dieses eine Feld zurück und hält den Zeitpunkt für die Meldung fest', async () => {
    const vorher = (await admin.from('companies').select('*').eq('id', ALT).single()).data!;
    await db.query(readFileSync(
      join(__dirname, '../../supabase/migrations/20261031210100_r7_firmenbuch_haken.sql'), 'utf8'));
    const nachher = (await admin.from('companies').select('*').eq('id', ALT).single()).data!;
    expect(nachher.im_firmenbuch).toBeNull();
    expect(nachher.firmenbuch_korrigiert_am).not.toBeNull();
    // Sonst bleibt die Zeile, wie sie war (bis auf den Zeitstempel der Änderung).
    const ohne = (z: Record<string, unknown>) => {
      const { im_firmenbuch: _a, firmenbuch_korrigiert_am: _b, updated_at: _c, ...rest } = z;
      void _a; void _b; void _c;
      return rest;
    };
    expect(ohne(nachher)).toEqual(ohne(vorher));
  });

  it('Gegenprobe: Einzelunternehmen und „i. G.“ bleiben, wie sie gespeichert sind', async () => {
    expect(await angabe(ALT_EU)).toEqual({ im_firmenbuch: false, firmenbuch_korrigiert_am: null });
    expect(await angabe(ALT_IG)).toEqual({ im_firmenbuch: false, firmenbuch_korrigiert_am: null });
  });

  it('die Geschäftsführung nimmt es zur Kenntnis — dann ist die Meldung weg', async () => {
    const { error } = await alt.client.from('companies').update({ firmenbuch_korrigiert_am: null }).eq('id', ALT);
    expect(error).toBeNull();
    expect((await angabe(ALT)).firmenbuch_korrigiert_am).toBeNull();
  });
});
