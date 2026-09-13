/**
 * Der DSGVO-Auszug (Art. 15/20) — in der Datenbank statt in einer Cloud
 * Function.
 *
 * DER WICHTIGSTE TEST HIER IST DER AUF VOLLSTÄNDIGKEIT. In Firestore stand
 * die Sammlungsliste von Hand in einer Datei und umfasste neun von sechzehn
 * Sammlungen; es fehlten unter anderem die Nummernkreise, und ein
 * Wiederanlauf aus so einem Export hätte den Rechnungszähler bei null
 * begonnen. Hier kommt die Liste aus dem Katalog — und dieser Test hält fest,
 * dass sie das auch morgen noch tut.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';

const VERBINDUNG = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
let db: Client;

const BETRIEB = 'auszug-b';
const FREMD = 'auszug-c';

let chef: Konto;
let monteur: Konto;
let buchhaltung: Konto;
let fremderChef: Konto;

interface Auszug {
  companyId: string;
  exportedAt: string;
  anzahl: Record<string, number>;
  data: Record<string, Array<Record<string, unknown>>>;
}

async function auszug(k: Konto, maxBytes?: number) {
  const { data, error } = await k.client.rpc('betrieb_auszug',
    maxBytes === undefined ? {} : { p_max_bytes: maxBytes });
  return { data: data as Auszug | null, error };
}

beforeAll(async () => {
  db = new Client({ connectionString: VERBINDUNG });
  await db.connect();
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  chef = await konto(BETRIEB, 'Geschäftsführung', 'auszug-chef');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'auszug-monteur');
  buchhaltung = await konto(BETRIEB, 'Buchhaltung', 'auszug-buch');
  fremderChef = await konto(FREMD, 'Geschäftsführung', 'auszug-fremd');
  clientEinreichen(chef.client);

  const { error } = await admin.from('time_entries').insert([
    buchung(monteur, '2026-02-02', { project_number: '2026-001', user_name: 'Monteur' }),
    buchung(chef, '2026-02-02', { project_number: '2026-001', user_name: 'Chef' }),
  ]);
  if (error) throw new Error(error.message);

  await admin.from('user_prefs').insert({
    user_id: monteur.uid, company_id: BETRIEB, push_tokens: ['gerät-abc'],
  });
}, 180_000);

afterAll(async () => {
  clientEinreichen(null);
  await db.end();
});

describe('Der Auszug ist vollständig', () => {
  it('enthält jede Tabelle, die ein company_id trägt', async () => {
    /*
      DIE LISTE KOMMT AUS DEM KATALOG, UND DAS WIRD HIER GEGENGERECHNET.

      Legt jemand morgen eine Tabelle mit `company_id` an und der Auszug
      übergeht sie, ist dieser Test rot — nicht erst der Betrieb, der nach
      einem Wiederanlauf feststellt, dass die Hälfte fehlt.
    */
    // UNABHÄNGIG GEFRAGT: der Katalog direkt, nicht die Funktion, die den
    // Auszug baut — sonst prüfte sich dieselbe Abfrage gegen sich selbst.
    const katalog = await db.query(`
      select c.relname from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and exists (select 1 from information_schema.columns col
                      where col.table_schema = 'public'
                        and col.table_name = c.relname
                        and col.column_name = 'company_id')`);
    const erwartet = [...katalog.rows.map((r) => r.relname as string), 'companies'].sort();
    // Die Sicht `monthly_stats` ist bewusst nicht dabei — sie rechnet aus den
    // Zeiteinträgen, die ohnehin im Auszug stehen.
    expect(erwartet).not.toContain('monthly_stats');

    const { data } = await auszug(chef);
    expect(Object.keys(data!.data).sort()).toEqual(erwartet);
    expect(Object.keys(data!.anzahl).sort()).toEqual(erwartet);
  }, 60_000);

  it('trägt den Betrieb selbst und die Zahlen, die die Ansicht anzeigt', async () => {
    const { data } = await auszug(chef);
    expect(data!.companyId).toBe(BETRIEB);
    expect(data!.data.companies).toHaveLength(1);
    expect((data!.data.companies[0] as { id: string }).id).toBe(BETRIEB);
    expect(data!.anzahl.time_entries).toBe(2);
    expect(data!.anzahl.users).toBe(3);
    // Der Zeitstempel ist die Grundlage des Dateinamens in der Ansicht.
    expect(data!.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, 60_000);

  it('eine leere Tabelle steht als leere Liste da, nicht als fehlender Schlüssel', async () => {
    const { data } = await auszug(chef);
    expect(data!.data.invoices).toEqual([]);
    expect(data!.anzahl.invoices).toBe(0);
  }, 60_000);
});

describe('Was nicht im Auszug steht', () => {
  it('keine Push-Tokens — ein Gerätekanal ist kein Geschäftsdatum', async () => {
    const { data } = await auszug(chef);
    const vorgaben = data!.data.user_prefs;
    expect(vorgaben).toHaveLength(1);
    expect('push_tokens' in vorgaben[0]).toBe(false);
    // Die übrigen Vorgaben sind sehr wohl dabei.
    expect('notify_new_order' in vorgaben[0]).toBe(true);
  }, 60_000);

  it('nichts aus einem fremden Betrieb', async () => {
    const { error } = await admin.from('time_entries').insert([
      buchung(fremderChef, '2026-02-02', { project_number: '2026-001', user_name: 'Fremd' }),
    ]);
    if (error) throw new Error(error.message);

    const { data } = await auszug(chef);
    expect(data!.anzahl.time_entries).toBe(2);
    expect(data!.data.users.every((u) => u.company_id === BETRIEB)).toBe(true);

    const { data: drueben } = await auszug(fremderChef);
    expect(drueben!.anzahl.time_entries).toBe(1);
    expect(drueben!.anzahl.users).toBe(1);
  }, 60_000);
});

describe('Wer den Auszug holen darf', () => {
  it('ein Monteur nicht', async () => {
    const { error } = await auszug(monteur);
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Geschäftsführung');
  }, 30_000);

  it('die Buchhaltung auch nicht — sie sieht Zahlen, nicht den ganzen Betrieb', async () => {
    const { error } = await auszug(buchhaltung);
    expect(error).not.toBeNull();
  }, 30_000);
});

describe('Die Größengrenze', () => {
  it('bricht mit einer Meldung ab, die den anderen Weg nennt', async () => {
    const { data, error } = await auszug(chef, 50);
    expect(data).toBeNull();
    expect(error!.message).toContain('nächtlichen Ausleitung');
  }, 60_000);

  it('lässt sich nur senken, nicht heben — auch nicht bei zehn Megabyte', async () => {
    /*
      DER EINZIGE TEST HIER, DER ECHTE MASSE BRAUCHT.

      Eine Grenze, die nur mit einem kleinen Parameter geprüft wird, ist
      nicht geprüft: sie greift ja immer. Beobachtbar wird der Deckel erst,
      wenn der Bestand die acht Megabyte überschreitet UND der Aufrufer sich
      mehr nehmen will. Deshalb bekommt dieser Betrieb zehn Megabyte Notizen
      — in einem eigenen, damit er die übrigen Prüfungen nicht erschlägt.

      Ohne Deckel käme der ganze Bestand in einem Zug zurück, und zwar für
      jeden, der die Zahl hoch genug setzt.
    */
    await betriebAnlegen('auszug-gross');
    const dicker = await konto('auszug-gross', 'Geschäftsführung', 'auszug-dick');
    await db.query(`
      insert into customers (company_id, name, notes)
      select 'auszug-gross', 'Kunde ' || i, repeat('x', 250000)
        from generate_series(1, 40) i`);

    const { data, error } = await auszug(dicker, 2_000_000_000);
    expect(data).toBeNull();
    expect(error!.message).toContain('nächtlichen Ausleitung');
  }, 120_000);
});
