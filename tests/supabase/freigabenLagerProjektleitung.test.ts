/**
 * Testbericht 30.09.2026, Paket 3c — vergebbare Freigaben (M37, M38).
 *
 *   M37  Verwaltung mit „Katalog einspielen“ legt Läufe an und setzt
 *        Einkaufspreise; mit „Einkaufspreise sehen“ liest sie sie.
 *        Gegenprobe: ohne Freigabe nicht, und in einer anderen Rolle wirkt
 *        die Freigabe nicht.
 *   M38  Projektleitung mit „Rechnungen lesen“ liest die Rechnungen der
 *        Baustellen, in deren Leitung sie steht — keine anderen, und anlegen
 *        darf sie keine.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'freigabe-3c';
let lager: Konto;
let lagerMit: Konto;
let buchMit: Konto;
let pl: Konto;
let plOhne: Konto;
let lieferant: string;
let artikel: string;
let meineRechnung: string;
let fremdeRechnung: string;

async function freigeben(k: Konto, felder: Record<string, boolean>) {
  const { error } = await admin.from('users').update(felder).eq('id', k.uid);
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  lager = await konto(BETRIEB, 'Verwaltung', 'f3clager');
  lagerMit = await konto(BETRIEB, 'Verwaltung', 'f3clagermit');
  buchMit = await konto(BETRIEB, 'Buchhaltung', 'f3cbuch');
  pl = await konto(BETRIEB, 'Projektleiter', 'f3cpl');
  plOhne = await konto(BETRIEB, 'Projektleiter', 'f3cplohne');
  await freigeben(lagerMit, { katalog_einspielen: true });
  await freigeben(buchMit, { katalog_einspielen: true, einkauf_sehen: true });
  await freigeben(pl, { rechnungen_lesen: true });
  await freigeben(plOhne, { rechnungen_lesen: false });

  const s = await admin.from('suppliers').insert({ company_id: BETRIEB, name: 'Grosshandel' }).select('id').single();
  if (s.error) throw new Error(s.error.message);
  lieferant = s.data.id;

  const m = await admin.from('materials').insert({ company_id: BETRIEB, name: 'Kupferrohr 18', einkaufspreis: 4.2 })
    .select('id').single();
  if (m.error) throw new Error(m.error.message);
  artikel = m.data.id;

  const p = await admin.from('projects').insert([
    { company_id: BETRIEB, project_number: 'F3C-1', customer_name: 'Familie Eigen', status: 'Aktiv',
      assigned_employees: [], project_managers: [pl.uid, plOhne.uid] },
    { company_id: BETRIEB, project_number: 'F3C-2', customer_name: 'Firma Fremd', status: 'Aktiv',
      assigned_employees: [], project_managers: [] },
  ]).select('id, project_number');
  if (p.error) throw new Error(p.error.message);
  const id = (nr: string) => p.data.find((x) => x.project_number === nr)!.id;

  const r = await admin.from('invoices').insert([
    { company_id: BETRIEB, invoice_number: 'F3C-R1', project_number: 'F3C-1', project_id: id('F3C-1'),
      customer_name: 'Familie Eigen', invoice_date: '2026-09-01', due_date: '2026-10-01',
      total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen' },
    { company_id: BETRIEB, invoice_number: 'F3C-R2', project_number: 'F3C-2', project_id: id('F3C-2'),
      customer_name: 'Firma Fremd', invoice_date: '2026-09-01', due_date: '2026-10-01',
      total_netto: 200, total_vat: 40, total_brutto: 240, payment_status: 'Offen' },
  ]).select('id, invoice_number');
  if (r.error) throw new Error(r.error.message);
  meineRechnung = r.data.find((x) => x.invoice_number === 'F3C-R1')!.id;
  fremdeRechnung = r.data.find((x) => x.invoice_number === 'F3C-R2')!.id;
}, 120_000);

describe('M37 — Einkaufspreise sehen', () => {
  it('ohne Freigabe liest die Verwaltung keinen Einkaufspreis', async () => {
    const { data } = await lager.client.from('material_einkaufspreise').select('einkaufspreis').eq('material_id', artikel);
    expect(data ?? []).toHaveLength(0);
  });

  it('mit „Einkaufspreise sehen“ schon', async () => {
    await freigeben(lager, { einkauf_sehen: true });
    try {
      const { data } = await lager.client.from('material_einkaufspreise').select('einkaufspreis').eq('material_id', artikel);
      expect(Number(data?.[0]?.einkaufspreis)).toBe(4.2);
    } finally {
      await freigeben(lager, { einkauf_sehen: false });
    }
  });

  it('wer einspielen darf, sieht die Preise auch', async () => {
    const { data } = await lagerMit.client.from('material_einkaufspreise').select('einkaufspreis').eq('material_id', artikel);
    expect(data ?? []).toHaveLength(1);
  });

  it('in einer anderen Rolle wirkt die Freigabe nicht', async () => {
    const { data } = await buchMit.client.from('material_einkaufspreise').select('einkaufspreis').eq('material_id', artikel);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('M37 — Katalog einspielen', () => {
  it('ohne Freigabe legt die Verwaltung keinen Lauf an', async () => {
    const { error } = await lager.client.from('datanorm_laeufe')
      .insert({ company_id: BETRIEB, supplier_id: lieferant, dateiname: 'katalog.001' });
    expect(error).not.toBeNull();
  });

  it('mit „Katalog einspielen“ schon', async () => {
    const { error } = await lagerMit.client.from('datanorm_laeufe')
      .insert({ company_id: BETRIEB, supplier_id: lieferant, dateiname: 'katalog.001' });
    expect(error).toBeNull();
  });

  it('einen Einkaufspreis setzt nur, wer einspielen darf', async () => {
    const ohne = await lager.client.from('materials').insert({ company_id: BETRIEB, name: 'Fitting 18', einkaufspreis: 1.1 });
    expect(ohne.error?.message).toMatch(/Einkaufspreis setzt/);
    const mit = await lagerMit.client.from('materials').insert({ company_id: BETRIEB, name: 'Fitting 22', einkaufspreis: 1.3 });
    expect(mit.error).toBeNull();
  });

  it('die Übernahme fragt dieselbe Freigabe', async () => {
    const lauf = await lagerMit.client.from('datanorm_laeufe')
      .insert({ company_id: BETRIEB, supplier_id: lieferant, dateiname: 'leer.001' }).select('id').single();
    expect(lauf.error).toBeNull();
    const ohne = await lager.client.rpc('datanorm_uebernehmen', { p_lauf: lauf.data!.id });
    expect(ohne.error?.message).toMatch(/Freigabe „Katalog einspielen“/);
    const mit = await lagerMit.client.rpc('datanorm_uebernehmen', { p_lauf: lauf.data!.id });
    expect(mit.error).toBeNull();
  });
});

describe('M38 — Rechnungen lesen', () => {
  it('die Projektleitung mit Freigabe liest die Rechnung ihrer Baustelle, keine andere', async () => {
    const { data } = await pl.client.from('invoices').select('id');
    expect((data ?? []).map((r) => r.id)).toEqual([meineRechnung]);
    expect((data ?? []).map((r) => r.id)).not.toContain(fremdeRechnung);
  });

  it('ohne Freigabe keine', async () => {
    const { data } = await plOhne.client.from('invoices').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  /*
    Runde 3, Selbst prüfen: auch über die Schnittstelle (PostgREST) nicht mehr
    als die Rechnungen ihrer Baustellen — die Positionen folgen der Rechnung,
    Zahlungen, Storno und Status bleiben bei Buchhaltung und Spitze.
  */
  it('liest die Positionen ihrer Rechnung, nicht die einer fremden', async () => {
    const { error } = await admin.from('invoice_lines').insert([
      { company_id: BETRIEB, invoice_id: meineRechnung, position: 0, label: 'Eigene Zeile', qty: 1, unit: 'h', unit_price: 100, netto: 100 },
      { company_id: BETRIEB, invoice_id: fremdeRechnung, position: 0, label: 'Fremde Zeile', qty: 1, unit: 'h', unit_price: 200, netto: 200 },
    ]);
    expect(error).toBeNull();
    const { data } = await pl.client.from('invoice_lines').select('label');
    expect((data ?? []).map((z) => z.label)).toEqual(['Eigene Zeile']);
    const ohne = await plOhne.client.from('invoice_lines').select('label');
    expect(ohne.data ?? []).toHaveLength(0);
  });

  it('bucht keine Zahlung, storniert nicht und setzt keinen Status — auch nicht auf der eigenen', async () => {
    const zahlung = await pl.client.from('zahlungseingaenge').insert({
      company_id: BETRIEB, invoice_id: meineRechnung, datum: '2026-09-10', betrag: 120, art: 'Überweisung',
      erfasst_von: pl.uid,
    });
    expect(zahlung.error).not.toBeNull();
    const storno = await pl.client.rpc('rechnung_stornieren', { p_id: meineRechnung, p_grund: 'Versuch' });
    expect(storno.error).not.toBeNull();
    const status = await pl.client.from('invoices').update({ payment_status: 'Überfällig' })
      .eq('id', meineRechnung).select('id');
    expect(status.data ?? []).toHaveLength(0);
    const { data } = await admin.from('invoices').select('payment_status').eq('id', meineRechnung).single();
    expect(data!.payment_status).toBe('Offen');
  });

  it('wird die Freigabe zurückgenommen, liest sie nichts mehr', async () => {
    await freigeben(pl, { rechnungen_lesen: false });
    const { data } = await pl.client.from('invoices').select('id');
    expect(data ?? []).toHaveLength(0);
    await freigeben(pl, { rechnungen_lesen: true });
    const wieder = await pl.client.from('invoices').select('id');
    expect((wieder.data ?? []).map((r) => r.id)).toEqual([meineRechnung]);
  });

  it('anlegen darf sie keine', async () => {
    const { error } = await pl.client.from('invoices').insert({
      company_id: BETRIEB, invoice_number: 'F3C-R9', project_number: 'F3C-1', customer_name: 'X',
      invoice_date: '2026-09-02', due_date: '2026-10-02', total_netto: 1, total_vat: 0, total_brutto: 1,
      payment_status: 'Offen',
    });
    expect(error).not.toBeNull();
  });
});

describe('Einsatzplan für die Projektleitung', () => {
  it('ist ab Werk aus', async () => {
    const { data, error } = await admin.from('companies').select('projektleitung_im_einsatzplan').eq('id', BETRIEB).single();
    expect(error).toBeNull();
    expect(data?.projektleitung_im_einsatzplan).toBe(false);
  });
});
