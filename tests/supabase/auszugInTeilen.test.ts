/**
 * K4 (Durchsicht 15.11.2026): „Alle Daten herunterladen“ und die
 * Datenauskunft in Teilen — gegen die echte Datenbank.
 *
 * VORHER (gemessen in der Durchsicht): mit 40 000 Katalogzeilen (13 MB)
 * antwortete `betrieb_auszug` „zu groß … die nächtliche Ausleitung“, und
 * `person_auskunft` verwies auf die Datensicherung, die an derselben Grenze
 * scheiterte.
 *
 * GEPRÜFT:
 *   - über 8 MB kommen Betrieb und Person vollständig an, in Seiten;
 *   - die zusammengesetzte Datei ist DIESELBE wie der Abruf in einem Stück
 *     (bleibt gleich: gleiche Auswahl, gleiche Ausnahmen);
 *   - nur der Ersteller liest seine Kopie, nur Geschäftsführung und
 *     Administration legen eine an; nach dem Verwerfen ist sie weg;
 *   - die alten Funktionen behalten ihre Grenze (bleibt gleich).
 *
 * GEGENPROBE (Erwartung): ohne die Migration gibt es `betrieb_auszug_start`,
 * `person_auskunft_start` und `auszug_teil` nicht — jede Prüfung außer
 * „die alten Funktionen“ ist rot; „die alten Funktionen“ ist in beiden
 * Fassungen grün.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { betriebAuszugDatei, personAuskunftDatei } from '@/lib/db/pg/auszugTeile';

const VERBINDUNG = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
let db: Client;

const KLEIN = 'teile-klein';
const GROSS = 'teile-gross';

let chefKlein: Konto;
let chefGross: Konto;
let monteurGross: Konto;
let kundeGross: string;

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  await betriebAnlegen(KLEIN);
  await betriebAnlegen(GROSS);
  chefKlein = await konto(KLEIN, 'Geschäftsführung', 'teile-chef-k');
  chefGross = await konto(GROSS, 'Geschäftsführung', 'teile-chef-g');
  monteurGross = await konto(GROSS, 'Mitarbeiter', 'teile-monteur');

  await admin.from('customers').insert([
    { company_id: KLEIN, name: 'Familie Huber' },
    { company_id: KLEIN, name: 'Familie Berger', notes: 'Hund im Garten' },
  ]);
  await admin.from('user_prefs').upsert({ user_id: chefKlein.uid, company_id: KLEIN, push_tokens: ['geraet-k'] });

  /*
    ÜBER DER GRENZE: 40 Kunden mit je 250 000 Zeichen (rund 10 MB) und EIN
    Kunde, dessen Zeile allein 9 MB groß ist — so groß, dass er eine eigene
    Seite bildet. Daran zerbräche eine Seitenzählung mit Lücken.
  */
  await db.query('delete from customers where company_id = $1', [GROSS]);
  await db.query(`
    insert into customers (company_id, name, notes)
    select $1, 'Kunde ' || i, repeat('x', 250000) from generate_series(1, 40) i`, [GROSS]);
  const { rows } = await db.query(
    `insert into customers (company_id, name, notes) values ($1, 'Hausverwaltung', repeat('s', 9000000)) returning id`,
    [GROSS],
  );
  kundeGross = rows[0].id;
}, 240_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.query('delete from customers where company_id = $1', [GROSS]);
  await db.end();
});

async function alsDatei(datei: Promise<{ blob: Blob; kopf: Record<string, unknown> }>) {
  const { blob, kopf } = await datei;
  return { json: JSON.parse(await blob.text()) as Record<string, unknown>, kopf };
}

describe('Der Betrieb in Teilen', () => {
  it('ist dieselbe Datei wie der Abruf in einem Stück', async () => {
    const { data: alt, error } = await chefKlein.client.rpc('betrieb_auszug');
    expect(error).toBeNull();
    const { json } = await alsDatei(betriebAuszugDatei(undefined, chefKlein.client));
    // Der Zeitpunkt ist je Abruf ein anderer; alles übrige muss gleich sein.
    expect({ ...json, exportedAt: null }).toEqual({ ...(alt as Record<string, unknown>), exportedAt: null });
    // Die Ausnahmen gelten weiter: keine Push-Marken.
    const vorgaben = (json.data as Record<string, Array<Record<string, unknown>>>).user_prefs;
    expect(vorgaben.every((v) => !('push_tokens' in v))).toBe(true);
  }, 120_000);

  it('über 8 MB: vollständig, in mehreren Teilen', async () => {
    const { error } = await chefGross.client.rpc('betrieb_auszug');
    expect(error?.message).toContain('zu groß');

    const teile: number[] = [];
    const { json, kopf } = await alsDatei(
      betriebAuszugDatei((_fertig, gesamt) => teile.push(gesamt), chefGross.client),
    );
    expect(Math.max(...teile)).toBeGreaterThan(2);
    const kunden = (json.data as Record<string, Array<{ name: string; notes: string | null }>>).customers;
    expect(kunden).toHaveLength(41);
    expect(kunden.find((k) => k.name === 'Hausverwaltung')!.notes).toHaveLength(9_000_000);
    expect((kopf.anzahl as Record<string, number>).customers).toBe(41);
  }, 240_000);
});

describe('Die Datenauskunft in Teilen', () => {
  it('über 8 MB: kommt an, wo der Abruf in einem Stück abbricht', async () => {
    const { error } = await chefGross.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kundeGross });
    expect(error?.code).toBe('54000');

    const { json, kopf } = await alsDatei(personAuskunftDatei('kunde', kundeGross, undefined, chefGross.client));
    expect(kopf.person).toBe('Hausverwaltung');
    expect(((json.daten as Record<string, Record<string, string>>).stammdaten).notes).toHaveLength(9_000_000);
  }, 240_000);

  it('ist dieselbe wie der Abruf in einem Stück', async () => {
    const { data: kunden } = await admin.from('customers').select('id').eq('company_id', KLEIN).limit(1);
    const id = kunden![0].id as string;
    const { data: alt } = await chefKlein.client.rpc('person_auskunft', { p_art: 'kunde', p_id: id });
    const { json } = await alsDatei(personAuskunftDatei('kunde', id, undefined, chefKlein.client));
    expect({ ...json, erstellt_am: null }).toEqual({ ...(alt as Record<string, unknown>), erstellt_am: null });
  }, 120_000);

  it('die Grenze des Abrufs in einem Stück gilt danach wieder', async () => {
    await personAuskunftDatei('kunde', kundeGross, undefined, chefGross.client);
    const { error } = await chefGross.client.rpc('person_auskunft', { p_art: 'kunde', p_id: kundeGross });
    expect(error?.code).toBe('54000');
  }, 240_000);
});

describe('Wer die Kopie anlegt und liest', () => {
  it('ein Monteur legt keine an', async () => {
    const { error } = await monteurGross.client.rpc('betrieb_auszug_start');
    expect(error?.code).toBe('42501');
    const { error: e2 } = await monteurGross.client.rpc('person_auskunft_start', { p_art: 'kunde', p_id: kundeGross });
    expect(e2?.code).toBe('42501');
  }, 60_000);

  it('eine fremde Geschäftsführung liest sie nicht — auch nicht mit der Kennung', async () => {
    const { data } = await chefGross.client.rpc('betrieb_auszug_start');
    const lauf = (data as { lauf: string }).lauf;
    const { data: teil, error } = await chefKlein.client.rpc('auszug_teil', { p_lauf: lauf, p_seite: 1 });
    expect(teil).toBeNull();
    expect(error?.code).toBe('P0002');
    // Auch Verwerfen trifft nur die eigene.
    await chefKlein.client.rpc('auszug_verwerfen', { p_lauf: lauf });
    const { error: eigen } = await chefGross.client.rpc('auszug_teil', { p_lauf: lauf, p_seite: 1 });
    expect(eigen).toBeNull();
    await chefGross.client.rpc('auszug_verwerfen', { p_lauf: lauf });
  }, 120_000);

  it('nach dem Abholen ist die Kopie weg; eine neue verwirft die vorige', async () => {
    const zaehlen = async () => Number((await db.query(
      'select count(*) from app.auszug_arbeitsstand where besitzer = $1', [chefKlein.uid])).rows[0].count);
    await betriebAuszugDatei(undefined, chefKlein.client);
    expect(await zaehlen()).toBe(0);

    const { data: erste } = await chefKlein.client.rpc('betrieb_auszug_start');
    const { data: zweite } = await chefKlein.client.rpc('betrieb_auszug_start');
    const { rows } = await db.query(
      'select distinct lauf::text from app.auszug_arbeitsstand where besitzer = $1', [chefKlein.uid]);
    expect(rows.map((r) => r.lauf)).toEqual([(zweite as { lauf: string }).lauf]);
    expect((erste as { lauf: string }).lauf).not.toBe((zweite as { lauf: string }).lauf);
    await chefKlein.client.rpc('auszug_verwerfen', { p_lauf: (zweite as { lauf: string }).lauf });
    expect(await zaehlen()).toBe(0);
  }, 120_000);

  it('niemand ohne Anmeldung', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { API, ANON } = await import('./helfer');
    const anon = createClient(API, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc('betrieb_auszug_start')).error).not.toBeNull();
    expect((await anon.rpc('auszug_teil', { p_lauf: crypto.randomUUID(), p_seite: 1 })).error).not.toBeNull();
  }, 60_000);
});
