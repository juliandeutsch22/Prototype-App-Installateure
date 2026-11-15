/**
 * STORNO EINES VERRECHNETEN SCHEINS UND SEIN ERSATZ (Durchsicht 15.11.2026,
 * P4) — `supabase/migrations/20261116010200_schein_ersatz_verrechnet.sql`.
 *
 * Gegenprobe: ohne die Migration gibt es weder `schein_verrechnung` noch die
 * Spalte `ersetzt`; der neue Schein nach dem Storno stand unter „nicht
 * verrechnet“ (`scheine_unverrechnet`) und sein Material kam auf die nächste
 * Rechnung ein zweites Mal. „Bleibt gleich“: ohne Verweis ist ein neuer
 * Schein offen wie bisher; nach dem Storno der Rechnung auch der Ersatz.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const B = 'schein-ersatz-a';
const FREMD = 'schein-ersatz-b';
let buch: Konto;
let chef: Konto;
let leitung: Konto;
let monteur: Konto;
let fremd: Konto;
let laufend = 9700;

async function schein(status: string, p: { ersetzt?: string; betrieb?: string } = {}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('work_sheets').insert({
    id, company_id: p.betrieb ?? B, project_number: 'SE-1', customer_name: 'Familie Huber',
    datum: '2026-10-10', status, abrechnung: 'Regie', erstellt_von_uid: monteur.uid, erstellt_von_name: 'Max',
    storno_grund: status === 'Storniert' ? 'falsche Menge' : null, ersetzt: p.ersetzt ?? null,
  });
  if (error) throw new Error(error.message);
  return id;
}

async function rechnung(scheine: string[], payment_status = 'Offen'): Promise<string> {
  const id = crypto.randomUUID();
  laufend += 1;
  const { error } = await admin.from('invoices').insert({
    id, company_id: B, invoice_number: `RE-2026-${laufend}`, project_number: 'SE-1', customer_name: 'Familie Huber',
    invoice_date: '2026-10-15', due_date: '2026-10-29', total_netto: 100, total_vat: 20, total_brutto: 120,
    payment_status, art: 'einzel',
  });
  if (error) throw new Error(error.message);
  await admin.from('invoice_coverage').insert(scheine.map((ziel_id) => ({ company_id: B, invoice_id: id, art: 'work_sheet', ziel_id })));
  return id;
}

/** Neu anlegen wie die App: `schein_speichern` mit dem Verweis im Kopf. */
const anlegen = (k: Konto, ersetzt: string | null) => k.client.rpc('schein_speichern', {
  p_id: crypto.randomUUID(),
  p_kopf: { project_number: 'SE-1', customer_name: 'Familie Huber', datum: '2026-10-10', abrechnung: 'Regie',
    erstellt_von_name: 'Max', ...(ersetzt ? { ersetzt } : {}) },
  p_zeiten: [], p_material: [{ name: 'Therme', menge: 1 }], p_fotos: [],
});

const offen = async () => ((await buch.client.rpc('scheine_unverrechnet')).data ?? []).map((z: { id: string }) => z.id);

async function aufraeumen() {
  await admin.from('invoice_coverage').delete().eq('company_id', B);
  await admin.from('invoices').delete().eq('company_id', B);
  await admin.from('work_sheets').update({ ersetzt: null }).in('company_id', [B, FREMD]);
  await admin.from('work_sheets').delete().in('company_id', [B, FREMD]);
}

beforeAll(async () => {
  await betriebAnlegen(B);
  await betriebAnlegen(FREMD);
  buch = await konto(B, 'Buchhaltung', 'se-buch');
  chef = await konto(B, 'Geschäftsführung', 'se-chef');
  leitung = await konto(B, 'Projektleiter', 'se-pl');
  monteur = await konto(B, 'Mitarbeiter', 'se-mon');
  fremd = await konto(FREMD, 'Geschäftsführung', 'se-fremd');
}, 120_000);

beforeEach(aufraeumen);
afterAll(aufraeumen);

describe('vor dem Storno: schein_verrechnung', () => {
  it('nennt der Leitung die Rechnung, auf der der Schein steht', async () => {
    const s = await schein('Unterschrieben');
    const r = await rechnung([s]);
    const { data, error } = await chef.client.rpc('schein_verrechnung', { p_id: s });
    expect(error).toBeNull();
    const nummer = (await admin.from('invoices').select('invoice_number').eq('id', r).single()).data?.invoice_number;
    expect(data).toEqual({ verrechnet: true, grund: 'rechnung', rechnungen: [{ nummer, zahlung: 'Offen' }] });
  });

  it('die Projektleitung ohne Freigabe erfährt DASS, nicht welche Rechnung', async () => {
    const s = await schein('Unterschrieben');
    await rechnung([s]);
    const { data } = await leitung.client.rpc('schein_verrechnung', { p_id: s });
    expect(data).toEqual({ verrechnet: true, grund: 'rechnung', rechnungen: null });
  });

  it('bleibt gleich: ein offener Schein ist nicht verrechnet; eine stornierte Rechnung zählt nicht', async () => {
    const s = await schein('Unterschrieben');
    await rechnung([s], 'Storniert');
    expect((await chef.client.rpc('schein_verrechnung', { p_id: s })).data)
      .toEqual({ verrechnet: false, grund: null, rechnungen: [] });
  });

  it('der Monteur und ein fremder Betrieb fragen nicht', async () => {
    const s = await schein('Unterschrieben');
    expect((await monteur.client.rpc('schein_verrechnung', { p_id: s })).error?.code).toBe('42501');
    expect((await fremd.client.rpc('schein_verrechnung', { p_id: s })).error?.code).toBe('P0002');
  });
});

describe('der Ersatzschein erbt die Verrechnung', () => {
  it('stand der stornierte auf einer gültigen Rechnung, ist der Ersatz nicht offen — über jede Stufe', async () => {
    const alt = await schein('Storniert');
    await rechnung([alt]);
    const e1 = await schein('Storniert', { ersetzt: alt });
    const e2 = await schein('Unterschrieben', { ersetzt: e1 });
    expect(await offen()).not.toContain(e2);
    expect((await chef.client.rpc('schein_verrechnung', { p_id: e2 })).data).toMatchObject({ verrechnet: true, grund: 'rechnung' });
    expect((await buch.client.rpc('scheine_verrechnet', { p_ids: [e2] })).data).toEqual([e2]);
  });

  it('wird die Rechnung storniert, ist der Ersatz wieder offen — er kommt mit der neuen Rechnung', async () => {
    const alt = await schein('Storniert');
    const r = await rechnung([alt]);
    const ersatz = await schein('Unterschrieben', { ersetzt: alt });
    await admin.from('invoices').update({ payment_status: 'Storniert' }).eq('id', r);
    expect(await offen()).toContain(ersatz);
  });

  it('bleibt gleich: ein neuer Schein ohne Verweis, oder Ersatz eines unverrechneten, ist offen', async () => {
    const ohne = await schein('Unterschrieben');
    const alt = await schein('Storniert');
    const ersatz = await schein('Unterschrieben', { ersetzt: alt });
    expect((await offen()).sort()).toEqual([ohne, ersatz].sort());
  });
});

describe('der Verweis', () => {
  it('geht über schein_speichern beim Anlegen mit', async () => {
    const alt = await schein('Storniert');
    const { data: id, error } = await anlegen(monteur, alt);
    expect(error).toBeNull();
    expect((await admin.from('work_sheets').select('ersetzt').eq('id', id).single()).data?.ersetzt).toBe(alt);
  });

  it('nur ein stornierter Schein des eigenen Betriebs', async () => {
    const unterschrieben = await schein('Unterschrieben');
    expect((await anlegen(monteur, unterschrieben)).error?.message).toMatch(/nur ein stornierter Schein/);
    const fremderAlt = await schein('Storniert', { betrieb: FREMD });
    expect((await anlegen(monteur, fremderAlt)).error?.message).toMatch(/nur ein stornierter Schein/);
  });

  it('höchstens ein gültiger Ersatz zugleich — ein verworfener zählt nicht', async () => {
    const alt = await schein('Storniert');
    const erster = await anlegen(monteur, alt);
    expect(erster.error).toBeNull();
    expect((await anlegen(monteur, alt)).error?.message).toMatch(/schon einen Ersatzschein/);
    await admin.from('work_sheets').update({ status: 'Verworfen', verworfen_von_name: 'Max' }).eq('id', erster.data);
    expect((await anlegen(monteur, alt)).error).toBeNull();
  });

  it('steht nach dem Anlegen fest', async () => {
    const alt = await schein('Storniert');
    const { data: id } = await anlegen(monteur, alt);
    const { error } = await chef.client.from('work_sheets').update({ ersetzt: null }).eq('id', id);
    expect(error?.message).toMatch(/steht mit dem Anlegen fest/);
  });
});
