import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { admin, API, ANON, betriebAnlegen, konto, buchung, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { listZahlungen, listZahlungenImZeitraum } from '@/lib/db/pg/zahlungen';
import { createInvoice } from '@/lib/db/pg/invoices';
import { supabaseSender } from '@/lib/sync/supabaseSender';
import { pruefFotosRaeumen } from './pruefdateien';

const B = 'robust-a';
let chef: Konto, monteur: Konto, fremd: Konto;
let db: Client;
let kunde: string;
beforeAll(async () => {
  db = new Client({ connectionString: process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await db.connect();
  await betriebAnlegen(B); await betriebAnlegen('robust-b');
  chef = await konto(B, 'Geschäftsführung', 'robust-chef');
  monteur = await konto(B, 'Mitarbeiter', 'robust-monteur');
  fremd = await konto('robust-b', 'Geschäftsführung', 'robust-fremd');
  kunde = (await db.query(`insert into customers(company_id,name,address) values($1,'Heutiger Name','Kundenadresse') returning id`, [B])).rows[0].id;
  clientEinreichen(chef.client);
}, 120000);
afterAll(async () => { clientEinreichen(null); await db?.end(); });

async function angebot() {
  return (await db.query(`insert into quotes(company_id,quote_number,customer_id,customer_name,address,quote_date,valid_until,status,vat_rate,kalkulierte_stunden,notes)
    values($1,$2,$3,'Kunde','Anlagenadresse','2026-10-13','2026-11-13','Versendet',0.2,12,'Therme erneuern') returning id`,
  [B, crypto.randomUUID(), kunde])).rows[0].id as string;
}
async function wartung() {
  return (await db.query(`insert into wartungen(company_id,customer_id,customer_name,anlage,address,intervall_monate,faellig_am)
    values($1,$2,'Alter Name','Therme','Anlagenadresse',12,'2026-10-13') returning id`, [B, kunde])).rows[0].id as string;
}

describe('Atomare Arbeitsketten', () => {
  it('nimmt parallel und nach verlorener Antwort genau eine Baustelle an', async () => {
    const id = await angebot();
    const args = { p_angebot: id, p_praefix: 'PR', p_abrechnung: 'Regie' };
    const ergebnisse = await Promise.all([chef.client.rpc('angebot_annehmen', args), chef.client.rpc('angebot_annehmen', args)]);
    ergebnisse.forEach((r) => expect(r.error).toBeNull());
    expect(ergebnisse[0].data).toBe(ergebnisse[1].data);
    expect((await chef.client.rpc('angebot_annehmen', args)).data).toBe(ergebnisse[0].data);
    const { rows } = await db.query('select * from projects where company_id=$1 and project_number=$2', [B, ergebnisse[0].data]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ billing_mode: 'Regie', estimated_hours: '12.00', description: expect.stringContaining('Therme erneuern') });
  });

  it('erhält Einheitspreis, leeres Budget und Beschreibung ohne Anmerkungen', async () => {
    const id = await angebot();
    await db.query('update quotes set notes=null,kalkulierte_stunden=0 where id=$1', [id]);
    const r = await chef.client.rpc('angebot_annehmen', { p_angebot: id, p_praefix: '', p_abrechnung: 'Einheitspreis' });
    expect(r.error).toBeNull();
    const { rows: [p] } = await db.query('select * from projects where company_id=$1 and project_number=$2', [B, r.data]);
    const { rows: [q] } = await db.query('select * from quotes where id=$1', [id]);
    expect(p).toMatchObject({ billing_mode: 'Einheitspreis', estimated_hours: null, description: `Aus Angebot ${q.quote_number}`, customer_id: kunde });
    expect(p.project_number).toMatch(/^\d{4}-\d{4,}$/);
  });

  it('erhält die Berechtigungen bei der Annahme', async () => {
    const args = { p_angebot: await angebot(), p_praefix: 'PR', p_abrechnung: 'Pauschal' };
    expect((await monteur.client.rpc('angebot_annehmen', args)).error).not.toBeNull();
    expect((await fremd.client.rpc('angebot_annehmen', args)).error).not.toBeNull();
    expect((await chef.client.rpc('angebot_annehmen', args)).error).toBeNull();
  });

  it('plant parallel nur einmal und erhält Kundenname, Anlagenadresse und freie Nummer', async () => {
    const args = { p_wartung: await wartung(), p_nummer: 'HV-TEST-7', p_praefix: 'B', p_faellig: '2026-10-13' };
    const rs = await Promise.all([chef.client.rpc('wartung_einplanen', args), chef.client.rpc('wartung_einplanen', args)]);
    rs.forEach((r) => { expect(r.error).toBeNull(); expect(r.data).toBe('HV-TEST-7'); });
    const { rows } = await db.query('select * from projects where company_id=$1 and project_number=$2', [B, 'HV-TEST-7']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customer_name: 'Heutiger Name', address: 'Anlagenadresse', billing_mode: null });
    expect((await fremd.client.rpc('wartung_einplanen', args)).error).not.toBeNull();
    expect((await chef.client.rpc('wartung_einplanen', { ...args, p_faellig: '2025-10-13' })).error).not.toBeNull();
  });

  it('rollt eine Baustellenanlage mit ungültiger Zuordnung vollständig zurück', async () => {
    const id = await wartung();
    const r = await chef.client.rpc('wartung_einplanen', { p_wartung: id, p_nummer: 'HV-TEST-7', p_praefix: 'B', p_faellig: '2026-10-13' });
    expect(r.error).not.toBeNull();
    expect((await db.query('select offene_baustelle from wartungen where id=$1', [id])).rows[0].offene_baustelle).toBeNull();
  });
});

describe('Vollständigkeit und Wiederholung', () => {
  it('liest 2501 Zahlungen im Export und mehr als 100 in der Akte vollständig', async () => {
    const id = await createInvoice(B, { invoiceNumber: 'RE-2026-8700', projectNumber: 'B-Z', customerName: 'Huber',
      address: 'Hauptplatz 1, 8200 Gleisdorf', invoiceDate: '2026-04-30', leistungVon: '2026-04-30', leistungBis: '2026-04-30', dueDate: '2026-05-14',
      totalNetto: 10000, totalVat: 2000, totalBrutto: 12000, vatRate: 0.2, paymentStatus: 'Offen',
      positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 10000, netto: 10000 }] });
    await db.query(`insert into zahlungseingaenge(company_id,invoice_id,datum,betrag,art)
      select $1,$2,'2026-05-10',1,'Überweisung' from generate_series(1,2501)`, [B, id]);
    const zeilen = await listZahlungenImZeitraum(B, '2026-05-01', '2026-05-31');
    expect(zeilen).toHaveLength(2501);
    expect(zeilen.reduce((n, z) => n + z.betrag, 0)).toBe(2501);
    expect(await listZahlungen(B, id)).toHaveLength(2501);
    expect(await listZahlungen(B, id, 10)).toHaveLength(10);
  });

  it('wiederholtes Offline-Anlegen setzt eine spätere Änderung nicht zurück', async () => {
    const daten = buchung(monteur, '2026-10-13', { project_number: 'B-1' });
    const sendung = { tabelle: 'time_entries', zeile: daten.id, art: 'anlegen' as const, daten, angelegt: 0, versuche: 0 };
    const send = supabaseSender(monteur.client);
    expect(await send(sendung)).toEqual({ art: 'ok' });
    expect((await monteur.client.from('time_entries').update({ project_number: 'B-2' }).eq('id', daten.id)).error).toBeNull();
    expect(await send(sendung)).toEqual({ art: 'ok' });
    expect((await db.query('select project_number from time_entries where id=$1', [daten.id])).rows[0].project_number).toBe('B-2');
  });

  it('setzt die eigene Kontoanlage nach verlorener Antwort fort, übernimmt kein fremdes Konto', async () => {
    const email = `${crypto.randomUUID()}@robust.test`, vorgang = crypto.randomUUID();
    async function ruf(k: Konto, v: string) {
      const r = await fetch(`${API}/functions/v1/mitarbeiter-anlegen`, { method: 'POST', headers: {
        apikey: ANON, Authorization: `Bearer ${k.token}`, 'Content-Type': 'application/json',
      }, body: JSON.stringify({ email, passwort: v === vorgang ? 'Anfang-test-2026!' : 'Anderes-test-2026!', vorgang: v }) });
      return { status: r.status, data: await r.json() };
    }
    const erste = await ruf(chef, vorgang), zweite = await ruf(chef, vorgang);
    expect(erste.status).toBe(200); expect(zweite.status).toBe(200);
    expect(zweite.data.uid).toBe(erste.data.uid);
    expect((await ruf(fremd, vorgang)).status).toBe(409);
    const wiederaufnahmen = await Promise.all([ruf(chef, crypto.randomUUID()), ruf(chef, crypto.randomUUID())]);
    for (const wieder of wiederaufnahmen) {
      expect(wieder.status).toBe(200);
      expect(wieder.data).toMatchObject({ uid: erste.data.uid, startpasswort_unbekannt: true });
    }
    const original = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Anfang-test-2026!' }) });
    expect(original.status).toBe(200); await original.body?.cancel();
    expect((await ruf(chef, vorgang)).data.uid).toBe(erste.data.uid);
    expect((await chef.client.from('users').insert({ id: erste.data.uid, company_id: B, name: 'Neu', email, role: 'Mitarbeiter', active: true })).error).toBeNull();
    expect((await ruf(chef, crypto.randomUUID())).status).toBe(409);
  });
});

describe('Konsistente Sicherung und Wiederanlauf', () => {
  it('friert alle Tabellen vor dem seitenweisen Transport ein', async () => {
    const start = await admin.rpc('auszug_snapshot_start', { p_betrieb: B });
    expect(start.error).toBeNull();
    const vor = (await db.query('select name from companies where id=$1', [B])).rows[0].name;
    await db.query('update companies set name=$2 where id=$1', [B, 'Neuer Firmenname']);
    const daten: Array<{ sammlung: string; daten: Record<string, unknown> }> = [];
    let nach = 0;
    for (;;) {
      const r = await admin.rpc('auszug_snapshot_seite', { p_lauf: start.data, p_nach: nach });
      expect(r.error).toBeNull();
      if (!r.data.length) break;
      daten.push(...r.data.map((z: { inhalt: typeof daten[number] }) => z.inhalt));
      nach = r.data.at(-1).nr;
    }
    expect(daten.find((z) => z.sammlung === 'companies')?.daten.name).toBe(vor);
    expect(daten.filter((z) => z.sammlung === 'zahlungseingaenge')).toHaveLength(2501);
    expect(daten.some((z) => z.daten.company_id === 'robust-b')).toBe(false);
    expect((await chef.client.rpc('auszug_snapshot_start', { p_betrieb: B })).error).not.toBeNull();
    expect((await admin.rpc('auszug_snapshot_ende', { p_lauf: start.data })).error).toBeNull();
  });

  it('bricht ohne Firmenstammsatz ab', async () => {
    expect((await admin.rpc('auszug_snapshot_start', { p_betrieb: 'gibt-es-nicht' })).error).not.toBeNull();
  });

  it('verwechselt nach Neustart dieselbe pg_net-Nummer nicht mit dem alten Anstoß', async () => {
    await db.query('begin');
    try {
      await db.query("delete from app.anstoss_wache where art='push'");
      await db.query("insert into app.anstoss_wache(anfrage,art) values(987654321,'push')");
      // Genau diesen Inhalt verliert eine unlogged Tabelle bei Crash-Recovery.
      await db.query('truncate app.anstoss_generation');
      await db.query("insert into app.anstoss_wache(anfrage,art) values(987654321,'push')");
      await db.query(`insert into net._http_response(id,status_code,created) values(987654321,200,now())`);
      await db.query('select app.push_nachsehen()');
      expect((await db.query("select kennzahl from system_laeufe where company_id=$1 and art='push'", [B])).rows[0].kennzahl).toBe('1.00');
      expect((await db.query('select * from app.anstoss_wache where anfrage=987654321')).rows).toHaveLength(0);
    } finally { await db.query('rollback'); }
  });

  it('räumt übrig gebliebene Prüffotos auf und erhält fremde Namensräume', async () => {
    const eigen = 'scheine/pd-loeschen/abbruch/foto.jpg', fremdes = 'scheine/robust-fremde-datei/foto.jpg';
    for (const p of [eigen, fremdes]) expect((await admin.storage.from('scheinfotos').upload(p, new Blob(['test'], { type: 'image/jpeg' }), { upsert: true, contentType: 'image/jpeg' })).error).toBeNull();
    try {
      await pruefFotosRaeumen(db);
      expect((await admin.storage.from('scheinfotos').download(eigen)).error).not.toBeNull();
      expect((await admin.storage.from('scheinfotos').download(fremdes)).error).toBeNull();
    } finally { await admin.storage.from('scheinfotos').remove([eigen, fremdes]); }
  });
});
