/**
 * EINE GELÖSCHTE BAUSTELLE GIBT IHRE WARTUNG FREI (Befund 09.11.2026) —
 * gegen die echte Datenbank.
 *
 * `wartungen.offene_baustelle` ist eine Nummer, kein Fremdschlüssel. Wurde
 * die eingeplante Baustelle gelöscht, blieb die Nummer stehen: die Wartung
 * fiel aus „Wartung fällig“ und „fällig ohne Baustelle“, und
 * „Baustelle anlegen“ brach mit „Die eingeplante Baustelle fehlt“ ab.
 *
 * Gegenprobe: ohne `20261110170000_wartung_abo_eingang_lager.sql` sind die
 * Prüfungen „gibt frei“ und „legt neu an“ rot; die zur Erhaltung sind mit
 * und ohne grün.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { betriebAnlegen, konto, type Konto } from './helfer';

const B = 'wartung-frei-a';
let chef: Konto;
let db: Client;
let kunde = '';

async function wartung(offen: string | null = null): Promise<string> {
  return (await db.query(
    `insert into wartungen(company_id,customer_id,customer_name,anlage,address,intervall_monate,faellig_am,offene_baustelle)
     values($1,$2,'Familie Frei','Therme','Anlagenadresse',12,'2026-10-13',$3) returning id`,
    [B, kunde, offen],
  )).rows[0].id as string;
}
async function baustelle(nummer: string): Promise<string> {
  return (await db.query(
    `insert into projects(company_id,project_number,customer_name,status) values($1,$2,'Familie Frei','Aktiv') returning id`,
    [B, nummer],
  )).rows[0].id as string;
}
const offen = async (id: string) =>
  (await db.query('select offene_baustelle from wartungen where id=$1', [id])).rows[0].offene_baustelle as string | null;
const einplanen = (id: string, nummer: string | null = null) =>
  chef.client.rpc('wartung_einplanen', { p_wartung: id, p_nummer: nummer, p_praefix: 'WF', p_faellig: '2026-10-13' });
const loeschen = async (id: string) => {
  const { error } = await chef.client.from('projects').delete().eq('id', id);
  expect(error).toBeNull();
};

beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(B);
  chef = await konto(B, 'Geschäftsführung', 'wartung-frei-chef');
  kunde = (await db.query(`insert into customers(company_id,name,address) values($1,'Familie Frei','Kundenadresse') returning id`, [B])).rows[0].id;
}, 120000);
afterAll(async () => { await db?.end(); });

describe('Die gelöschte Baustelle gibt die Wartung frei', () => {
  it('über „Baustelle anlegen“ eingeplant, Baustelle gelöscht: die Wartung ist wieder ohne Baustelle', async () => {
    const w = await wartung();
    const r = await einplanen(w, 'WF-FREI-1');
    expect(r.error).toBeNull();
    const { rows: [p] } = await db.query('select id from projects where company_id=$1 and project_number=$2', [B, 'WF-FREI-1']);
    await loeschen(p.id);
    expect(await offen(w)).toBeNull();
  });

  it('auch in der anderen Schreibweise der Nummer (mit oder ohne „PR-“)', async () => {
    const p = await baustelle('PR-2026-7701');
    const w = await wartung('2026-7701');
    await loeschen(p);
    expect(await offen(w)).toBeNull();
  });

  it('auch unter einer alten Nummer der Baustelle', async () => {
    const p = await baustelle('WF-ALT-1');
    const w = await wartung('WF-ALT-1');
    // Unmittelbar umnummeriert (nicht über `baustelle_umnummern`, das die Wartung mitnähme):
    // die Wartung trägt danach eine alte Nummer der Baustelle.
    await db.query('update projects set project_number=$1 where id=$2', ['WF-NEU-1', p]);
    await loeschen(p);
    expect(await offen(w)).toBeNull();
  });

  it('danach legt „Baustelle anlegen“ wieder eine an', async () => {
    const w = await wartung();
    expect((await einplanen(w, 'WF-FREI-2')).error).toBeNull();
    const { rows: [p] } = await db.query('select id from projects where company_id=$1 and project_number=$2', [B, 'WF-FREI-2']);
    await loeschen(p.id);
    const r = await einplanen(w, 'WF-FREI-3');
    expect(r.error).toBeNull();
    expect(r.data).toBe('WF-FREI-3');
    expect(await offen(w)).toBe('WF-FREI-3');
  });
});

describe('Wartung einplanen mit totem Verweis', () => {
  it('fehlt die eingeplante Baustelle, legt „Baustelle anlegen“ eine neue an statt abzubrechen', async () => {
    // Ein Verweis aus der Zeit vor dem Auslöser: die Baustelle gibt es nicht.
    const w = await wartung('WF-WEG-1');
    const r = await einplanen(w, 'WF-WEG-NEU');
    expect(r.error).toBeNull();
    expect(r.data).toBe('WF-WEG-NEU');
    expect(await offen(w)).toBe('WF-WEG-NEU');
    const { rows } = await db.query('select customer_name, status from projects where company_id=$1 and project_number=$2', [B, 'WF-WEG-NEU']);
    expect(rows).toEqual([{ customer_name: 'Familie Frei', status: 'Aktiv' }]);
  });

  it('eine eingeplante Baustelle in der anderen Schreibweise gilt — keine zweite, zurück kommt ihre Nummer', async () => {
    await baustelle('PR-2026-7702');
    const w = await wartung('2026-7702');
    const r = await einplanen(w, 'WF-NICHT');
    expect(r.error).toBeNull();
    expect(r.data).toBe('PR-2026-7702');
    expect((await db.query('select 1 from projects where company_id=$1 and project_number=$2', [B, 'WF-NICHT'])).rows).toHaveLength(0);
  });
});

describe('Erhaltung', () => {
  it('eine Wartung auf einer anderen Baustelle bleibt eingeplant', async () => {
    const weg = await baustelle('WF-E-1');
    await baustelle('WF-E-2');
    const w = await wartung('WF-E-2');
    await loeschen(weg);
    expect(await offen(w)).toBe('WF-E-2');
  });

  it('gibt es eine zweite Baustelle in der anderen Schreibweise, bleibt der Verweis — er zeigt auf sie', async () => {
    const weg = await baustelle('2026-7703');
    await baustelle('PR-2026-7703');
    const w = await wartung('2026-7703');
    await loeschen(weg);
    expect(await offen(w)).toBe('2026-7703');
  });

  it('eine bestehende Einplanung gibt „Baustelle anlegen“ zurück, ohne neu anzulegen', async () => {
    const w = await wartung();
    expect((await einplanen(w, 'WF-E-3')).data).toBe('WF-E-3');
    expect((await einplanen(w, 'WF-E-4')).data).toBe('WF-E-3');
    expect((await db.query('select 1 from projects where company_id=$1 and project_number=$2', [B, 'WF-E-4'])).rows).toHaveLength(0);
  });
});
