/**
 * Testbericht Runde 3 — der Empfänger einer Rechnung und der Katalogbezug.
 *
 *   M9   Keine Rechnung an einen Kunden mit „Adresse prüfen“ oder ohne PLZ
 *        und Ort; ohne Kunden im Stamm braucht die Anschrift der Rechnung
 *        selbst PLZ und Ort (§ 11 Abs 1 Z 1 UStG).
 *   M10  Rechnung und Mahnung verlangen bei einem Kunden aus dem Stamm die
 *        Kundenart — eine UID auf der Rechnung genügt.
 *   M12  Die Rechnungszeile trägt den Katalogartikel aus dem Angebot, aber
 *        nur einen des eigenen Betriebs.
 *
 * Gegenproben stehen jeweils daneben: ein vollständiger Kunde bekommt seine
 * Rechnung, der Rücklauf spielt Altbestand zurück, wie er war.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'r3-empfaenger';
const FREMD = 'r3-empfaenger-fremd';
let buch: Konto;
let lauf = 0;

async function kunde(felder: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from('customers')
    .insert({ company_id: BETRIEB, name: `Kunde ${++lauf}`, ...felder }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

function anlegen(kopf: Record<string, unknown>, positionen?: Record<string, unknown>[]) {
  return buch.client.rpc('rechnung_anlegen', {
    p_kopf: {
      invoice_number: `R3E-${++lauf}`, project_number: 'R3E-1', customer_name: 'Kunde',
      invoice_date: '2026-10-06', due_date: '2026-10-20', address: 'Hauptplatz 1, 8200 Gleisdorf',
      total_netto: 100, total_vat: 20, total_brutto: 120, vat_rate: 0.2, payment_status: 'Offen',
      ...kopf,
    },
    p_positionen: positionen ?? [{ label: 'Facharbeit', qty: 1, unit: 'h', unit_price: 100, netto: 100 }],
    p_belege: {},
  });
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'r3ebuch');
}, 60_000);

describe('M9 — ein vollständiger Empfänger', () => {
  it('ein Kunde mit „Adresse prüfen“ bekommt keine Rechnung', async () => {
    // Wie im Altbestand: nur die Straße, ohne PLZ — der Auslöser am Kunden markiert „Adresse prüfen“.
    const k = await kunde({ address: 'Alois-Köberl-Gasse 11', kundenart: 'privat' });
    const { data: markiert } = await admin.from('customers').select('adresse_pruefen').eq('id', k).single();
    expect(markiert!.adresse_pruefen).toBe(true);
    const { error } = await anlegen({ customer_id: k });
    expect(error?.code).toBe('22023');
    expect(error?.message).toMatch(/Adresse prüfen/);
  });

  it('ohne PLZ und Ort beim Kunden keine Rechnung', async () => {
    const k = await kunde({ kundenart: 'privat' });
    const { error } = await anlegen({ customer_id: k });
    expect(error?.message).toMatch(/fehlen PLZ und Ort/);
  });

  it('ohne Kunden im Stamm braucht die Anschrift der Rechnung PLZ und Ort', async () => {
    const ohne = await anlegen({ address: 'Alois-Köberl-Gasse 11' });
    expect(ohne.error?.message).toMatch(/keine PLZ und keinen Ort/);
    const mit = await anlegen({ address: 'Alois-Köberl-Gasse 11, 8010 Graz' });
    expect(mit.error).toBeNull();
  });

  it('Gegenprobe: ein vollständiger Kunde bekommt seine Rechnung', async () => {
    const k = await kunde({ plz: '8200', ort: 'Gleisdorf', kundenart: 'unternehmen' });
    const { error } = await anlegen({ customer_id: k });
    expect(error).toBeNull();
  });

  it('mit Kunden im Stamm gelten seine Felder — auch eine Postleitzahl anderer Form', async () => {
    const k = await kunde({ plz: 'SW1A 1AA', ort: 'London', land: 'GB', kundenart: 'unternehmen' });
    const { error } = await anlegen({ customer_id: k, address: '10 Downing Street, London SW1A 1AA' });
    expect(error).toBeNull();
  });

  it('der Kunde der Baustelle zählt, auch ohne Kunden am Kopf', async () => {
    const k = await kunde({ kundenart: 'privat' });
    const p = await admin.from('projects').insert({
      company_id: BETRIEB, project_number: 'R3E-B', customer_id: k, customer_name: 'Kunde', status: 'Aktiv',
    }).select('id').single();
    expect(p.error).toBeNull();
    const { error } = await anlegen({ project_number: 'R3E-B' });
    expect(error?.message).toMatch(/fehlen PLZ und Ort/);
  });

  it('der Rücklauf spielt Altbestand zurück, wie er war', async () => {
    const k = await kunde({ adresse_pruefen: true });
    const { error } = await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: 'R3E-ALT', project_number: 'R3E-1', customer_id: k,
      customer_name: 'Altkunde', invoice_date: '2026-01-10', due_date: '2026-01-24', address: 'Alois-Köberl-Gasse 11',
      total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
    });
    expect(error).toBeNull();
  });
});

describe('M10 — die Kundenart', () => {
  it('ohne Kundenart keine Rechnung', async () => {
    const k = await kunde({ plz: '8200', ort: 'Gleisdorf' });
    const { error } = await anlegen({ customer_id: k });
    expect(error?.message).toMatch(/keine Kundenart hinterlegt/);
  });

  it('eine UID auf der Rechnung macht ihn zum Unternehmen — dann geht es', async () => {
    const k = await kunde({ plz: '8200', ort: 'Gleisdorf' });
    const { error } = await anlegen({ customer_id: k, customer_vat_id: 'ATU12345678' });
    expect(error).toBeNull();
  });

  it('ohne Kundenart keine Mahnung; mit Kundenart schon', async () => {
    const k = await kunde({ plz: '8200', ort: 'Gleisdorf', kundenart: 'privat' });
    const { data: id, error } = await anlegen({ customer_id: k, invoice_date: '2026-08-01', due_date: '2026-08-15' });
    expect(error).toBeNull();
    // Später ist die Kundenart weg (etwa beim Bereinigen des Stamms).
    await admin.from('customers').update({ kundenart: null }).eq('id', k);
    const ohne = await buch.client.from('invoices').update({ mahnstufe: 1, gemahnt_am: '2026-08-20' }).eq('id', id);
    expect(ohne.error?.message).toMatch(/vor dem Mahnen/);
    await admin.from('customers').update({ kundenart: 'privat' }).eq('id', k);
    const mit = await buch.client.from('invoices').update({ mahnstufe: 1, gemahnt_am: '2026-08-20' })
      .eq('id', id).select('mahnstufe');
    expect(mit.error).toBeNull();
    expect(mit.data![0].mahnstufe).toBe(1);
  });
});

describe('M12 — der Katalogartikel auf der Rechnungszeile', () => {
  it('trägt den Artikel des eigenen Betriebs, nicht den eines fremden', async () => {
    const eigen = await admin.from('materials')
      .insert({ company_id: BETRIEB, name: 'Pressfitting Bogen 15 mm', einkaufspreis: 2.1 }).select('id').single();
    const fremd = await admin.from('materials')
      .insert({ company_id: FREMD, name: 'Fremder Artikel' }).select('id').single();
    expect(eigen.error).toBeNull();
    expect(fremd.error).toBeNull();
    const k = await kunde({ plz: '8200', ort: 'Gleisdorf', kundenart: 'privat' });
    const { data: id, error } = await anlegen({ customer_id: k }, [
      { label: 'Bogen 15 mm verpresst', qty: 10, unit: 'Stk', unit_price: 6, netto: 60, material_id: eigen.data!.id },
      { label: 'Untergeschoben', qty: 1, unit: 'Stk', unit_price: 40, netto: 40, material_id: fremd.data!.id },
    ]);
    expect(error).toBeNull();
    const { data: zeilen } = await admin.from('invoice_lines')
      .select('label, material_id').eq('invoice_id', id).order('position');
    expect(zeilen).toEqual([
      { label: 'Bogen 15 mm verpresst', material_id: eigen.data!.id },
      { label: 'Untergeschoben', material_id: null },
    ]);
  });
});
