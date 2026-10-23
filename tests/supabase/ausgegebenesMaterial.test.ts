/**
 * AUSGEGEBENES MATERIAL OHNE SCHEIN (23.10.2026).
 *
 * `ausgegebenes_material` gibt je Baustelle die abgeholten Anforderungen,
 * die eingeladenen Rüstlistenpositionen und — negativ — die Retouren. Was bis
 * zum Leistungsende der letzten gültigen Rechnung lag, gilt als abgerechnet;
 * ein Storno öffnet den Zeitraum wieder. Nur für wer Rechnungen schreibt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { Client } from 'pg';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const A = 'ausg-a';
const B = 'ausg-b';

let buch: Konto;
let gf: Konto;
let pl: Konto;
let verw: Konto;
let max: Konto;
let fremd: Konto;
let rohr: string;

async function anforderung(betrieb: string, k: Konto, teil: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: betrieb, material_name: 'Kupferrohr 15', quantity: 10, status: 'Erledigt',
    transaction_type: 'order', user_id: k.uid, user_name: 'Max', project_number: '2026-070', ...teil,
  });
  if (error) throw new Error(error.message);
  return id;
}

async function ruestliste(datum: string, positionen: Array<{ name: string; menge: number; geladen: boolean }>) {
  const { data: kopf, error } = await admin.from('einsatz_material').insert({
    company_id: A, date: datum, project_number: 'PR-2026-070',
  }).select('id').single();
  if (error) throw new Error(error.message);
  const geladen: Record<string, unknown> = {};
  for (const [i, p] of positionen.entries()) {
    const { data: pos, error: pe } = await admin.from('einsatz_material_positionen').insert({
      company_id: A, einsatz_material_id: kopf!.id, position: i, name: p.name, menge: p.menge, einheit: 'm',
    }).select('id').single();
    if (pe) throw new Error(pe.message);
    if (p.geladen) geladen[pos!.id] = { von: 'Max', am: Date.now() };
  }
  const { error: ge } = await admin.from('einsatz_material').update({ geladen }).eq('id', kopf!.id);
  if (ge) throw new Error(ge.message);
}

async function rechnung(nummer: string, teil: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const { error } = await admin.from('invoices').insert({
    id, company_id: A, invoice_number: nummer, project_number: '2026-070', customer_name: 'Familie Huber',
    invoice_date: '2026-09-30', due_date: '2026-10-14', total_netto: 100, total_vat: 20, total_brutto: 120,
    payment_status: 'Offen', ...teil,
  });
  if (error) throw new Error(error.message);
  return id;
}


beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  buch = await konto(A, 'Buchhaltung', 'ausgbuch');
  gf = await konto(A, 'Geschäftsführung', 'ausggf');
  pl = await konto(A, 'Projektleiter', 'ausgpl');
  verw = await konto(A, 'Verwaltung', 'ausgverw');
  max = await konto(A, 'Mitarbeiter', 'ausgmax');
  fremd = await konto(B, 'Mitarbeiter', 'ausgfremd');
  const { data: m, error } = await admin.from('materials').insert({
    company_id: A, name: 'Kupferrohr 15', unit: 'm', stock: 100,
  }).select('id').single();
  if (error) throw new Error(error.message);
  rohr = m!.id;

  await anforderung(A, max, { material_id: rohr });                                   // zählt: 10
  await anforderung(A, max, { project_number: 'PR-2026-070', quantity: 3 });          // zählt, andere Schreibweise
  await anforderung(A, max, { status: 'Abholbereit', quantity: 99 });                 // noch nicht abgeholt
  await anforderung(A, max, { project_number: '2026-071', quantity: 99 });            // andere Baustelle
  await anforderung(A, max, { transaction_type: 'return', quantity: 2, condition: 'neu' }); // Retoure: −2
  await anforderung(B, fremd, { quantity: 99 });                                       // fremder Betrieb
  await ruestliste('2026-09-15', [
    { name: 'Kupferrohr 15', menge: 4, geladen: true },
    { name: 'Pressfitting', menge: 6, geladen: false },
  ]);
}, 120_000);

afterAll(() => clientEinreichen(null));

const kurz = (rows: Awaited<ReturnType<typeof anforderungen.ausgegebenesMaterial>>) =>
  rows.map((r) => `${r.art} ${r.name} ${r.menge}${r.einheit ? ` ${r.einheit}` : ''}`).sort();

describe('ausgegebenes_material', () => {
  it('gibt Abgeholtes, Eingeladenes und Retouren der Baustelle — in beiden Schreibweisen', async () => {
    clientEinreichen(buch.client);
    expect(kurz(await anforderungen.ausgegebenesMaterial('2026-070'))).toEqual([
      'anforderung Kupferrohr 15 10 m',
      'anforderung Kupferrohr 15 3',
      'retoure Kupferrohr 15 -2',
      'ruestliste Kupferrohr 15 4 m',
    ]);
    expect(kurz(await anforderungen.ausgegebenesMaterial('PR-2026-070'))).toHaveLength(4);
  });

  it('auch die Geschäftsführung — Projektleitung, Verwaltung und Monteur bekommen einen Fehler', async () => {
    clientEinreichen(gf.client);
    expect(await anforderungen.ausgegebenesMaterial('2026-070')).toHaveLength(4);
    for (const k of [pl, verw, max]) {
      clientEinreichen(k.client);
      await expect(anforderungen.ausgegebenesMaterial('2026-070')).rejects.toThrow(/nur, wer Rechnungen schreibt/);
    }
  });

  it('bis zum Leistungsende der letzten gültigen Rechnung gilt alles als abgerechnet — ein Storno öffnet es wieder', async () => {
    clientEinreichen(buch.client);
    // Eine Anzahlung schließt nichts ab.
    await rechnung('RE-AUSG-1', { art: 'anzahlung', leistung_bis: '2099-12-31' });
    expect(await anforderungen.ausgegebenesMaterial('2026-070')).toHaveLength(4);

    // Leistung bis 15.09.: die Rüstliste vom 15.09. ist abgerechnet, die Anforderungen von heute nicht.
    const r = await rechnung('RE-AUSG-2', { leistung_bis: '2026-09-15' });
    expect(kurz(await anforderungen.ausgegebenesMaterial('2026-070')).some((z) => z.startsWith('ruestliste'))).toBe(false);
    expect(await anforderungen.ausgegebenesMaterial('2026-070')).toHaveLength(3);

    // Ohne Leistungsende zählt das Rechnungsdatum.
    const heute = new Date().toISOString().slice(0, 10);
    const r2 = await rechnung('RE-AUSG-3', { invoice_date: heute, leistung_bis: null });
    expect(await anforderungen.ausgegebenesMaterial('2026-070')).toEqual([]);

    for (const id of [r, r2]) {
      const { error } = await buch.client.rpc('rechnung_stornieren', { p_id: id, p_grund: 'Prüfung' });
      expect(error).toBeNull();
    }
    expect(await anforderungen.ausgegebenesMaterial('2026-070')).toHaveLength(4);
  });

  it('fragt nicht ohne Baustelle', async () => {
    clientEinreichen(buch.client);
    expect(await anforderungen.ausgegebenesMaterial('')).toEqual([]);
    expect(await anforderungen.ausgegebenesMaterial('PR-')).toEqual([]);
  });
});

/*
  DER TAG EINER ANFORDERUNG (24.10.2026): `erledigt_am`, gesetzt von der
  Datenbank beim Wechsel auf „Erledigt“. Eine spätere Änderung (etwa das
  Umnummern der Baustelle) verschiebt den Tag nicht mehr.
*/
describe('ausgegebenes_material — erledigt am', () => {
  it('hält den Moment von „Erledigt“ fest, ändert ihn bei anderen Änderungen nicht, leert ihn beim Zurücksetzen', async () => {
    const id = await anforderung(A, max, { status: 'Offen', project_number: '2026-072' });
    const lies = async () => (await admin.from('material_orders').select('erledigt_am, updated_at').eq('id', id).single()).data!;
    expect((await lies()).erledigt_am).toBeNull();

    await admin.from('material_orders').update({ status: 'Erledigt' }).eq('id', id);
    const erledigt = (await lies()).erledigt_am;
    expect(erledigt).not.toBeNull();

    // Ein Gerät kann ihn nicht verstellen, eine andere Änderung lässt ihn stehen.
    await admin.from('material_orders').update({ note: 'später', erledigt_am: '2020-01-01T00:00:00Z' }).eq('id', id);
    const danach = await lies();
    expect(danach.erledigt_am).toBe(erledigt);
    expect(danach.updated_at).not.toBe(erledigt);

    await admin.from('material_orders').update({ status: 'Abholbereit' }).eq('id', id);
    expect((await lies()).erledigt_am).toBeNull();
  });

  it('das ausgegebene Material zählt am Tag von „Erledigt“, nicht am Tag der letzten Änderung', async () => {
    // Die Datenübernahme setzt den Zeitpunkt beim Anlegen selbst.
    const id = await anforderung(A, max, { project_number: '2026-073', erledigt_am: '2026-09-01T10:00:00+02:00' });
    await admin.from('material_orders').update({ note: 'heute umgeschrieben' }).eq('id', id);
    clientEinreichen(buch.client);
    const [z] = await anforderungen.ausgegebenesMaterial('2026-073');
    expect(z).toMatchObject({ art: 'anforderung', datum: '2026-09-01' });
  });

  it('Gleichbleiben: eine Anforderung von vor der Spalte zählt wie bisher am Tag ihrer letzten Änderung', async () => {
    const id = await anforderung(A, max, { project_number: '2026-074' });
    /*
      So stehen Anforderungen von vor dem 24.10.2026 da: erledigt, aber ohne
      Zeitpunkt — die Migration schreibt bestehende Zeilen nicht um. Nur in
      dieser Sitzung ohne Auslöser, damit sich der Zustand herstellen lässt.
    */
    const db = new Client({ connectionString: DB });
    await db.connect();
    try {
      await db.query("set session_replication_role = replica");
      await db.query(
        "update public.material_orders set erledigt_am = null, updated_at = '2026-09-05T09:00:00+02:00' where id = $1",
        [id],
      );
    } finally {
      await db.end();
    }
    clientEinreichen(buch.client);
    const [z] = await anforderungen.ausgegebenesMaterial('2026-074');
    expect(z).toMatchObject({ art: 'anforderung', datum: '2026-09-05' });
  });
});
