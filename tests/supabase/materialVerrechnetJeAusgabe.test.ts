/**
 * M2 (Durchsicht 15.11.2026): VERRECHNET IST, WAS EINE RECHNUNG TRÄGT.
 *
 * Bis dahin galt als abgerechnet, was bis zum Leistungsende der letzten
 * gültigen Rechnung lag. Eine Abholung am Nachmittag desselben Tags oder
 * eine spät abgehakte Rüstliste fiel so still aus jeder Rechnung — und
 * `app.material_abgerechnet` sperrte sie trotzdem als „Schon abgerechnet“.
 *
 * Jetzt verknüpft die Rechnung jede Ausgabe ihrer Vorschau
 * (`material_order`, `ruest_position`). Ältere Rechnungen ohne das
 * Kennzeichen decken weiter, was es beim Anlegen schon gab und bis zu ihrem
 * Leistungsende reicht.
 *
 * Gegenprobe: ohne 20261116060000 kennt `rechnung_anlegen` die Belegart
 * `ruest_position` nicht (Check der Abdeckung), und die spätere Abholung
 * fehlt im Vorschlag.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as anforderungen from '@/lib/db/pg/materialOrders';
import { clientEinreichen } from '@/lib/db/pg/kern';

const A = 'm2-je-ausgabe';
const NR = '2026-270';

let buch: Konto;
let max: Konto;
let verw: Konto;
let rohr: string;
const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
const vorTagen = (n: number) => {
  const d = new Date(`${heute}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

async function abholung(menge: number): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await admin.from('material_orders').insert({
    id, company_id: A, material_id: rohr, material_name: 'Kupferrohr 15', quantity: menge, status: 'Erledigt',
    transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: NR,
  });
  if (error) throw new Error(error.message);
  return id;
}

async function ruestliste(datum: string, name: string, menge: number): Promise<void> {
  const { data: kopf, error } = await admin.from('einsatz_material').insert({
    company_id: A, date: datum, project_number: NR,
  }).select('id').single();
  if (error) throw new Error(error.message);
  const { data: pos, error: pe } = await admin.from('einsatz_material_positionen').insert({
    company_id: A, einsatz_material_id: kopf!.id, position: 0, name, menge, einheit: 'Stk',
  }).select('id').single();
  if (pe) throw new Error(pe.message);
  // Abgehakt JETZT — auch wenn der Einsatz Tage zurückliegt (Fall b).
  const { error: ge } = await admin.from('einsatz_material')
    .update({ geladen: { [pos!.id]: { von: 'Max', am: Date.now() } } }).eq('id', kopf!.id);
  if (ge) throw new Error(ge.message);
}

async function rechnung(nummer: string, belege: Record<string, string[]>, neu: boolean, leistungBis = heute) {
  const { data, error } = await buch.client.rpc('rechnung_anlegen', {
    p_kopf: {
      invoice_number: nummer, project_number: NR, customer_name: 'Familie Huber',
      address: 'Hauptplatz 1, 8200 Gleisdorf', invoice_date: heute, due_date: heute,
      leistung_von: vorTagen(5), leistung_bis: leistungBis,
      total_netto: 100, total_vat: 20, total_brutto: 120, vat_rate: 20, payment_status: 'Offen',
      ...(neu ? { material_je_ausgabe: true } : {}),
    },
    p_positionen: [{ label: 'Arbeit', qty: 1, unit: 'h', unit_price: 100, netto: 100 }],
    p_belege: belege,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

const vorschlag = async () => (await anforderungen.ausgegebenesMaterial(NR))
  .map((a) => `${a.art} ${a.name} ${a.menge}`).sort();

const belegeAus = (liste: Awaited<ReturnType<typeof anforderungen.ausgegebenesMaterial>>) => ({
  material_order: liste.filter((a) => a.art !== 'ruestliste').map((a) => a.belegId),
  ruest_position: liste.filter((a) => a.art === 'ruestliste').map((a) => a.belegId),
});

beforeAll(async () => {
  await betriebAnlegen(A);
  buch = await konto(A, 'Buchhaltung', 'm2buch');
  max = await konto(A, 'Mitarbeiter', 'm2max');
  verw = await konto(A, 'Verwaltung', 'm2verw');
  const { data, error } = await admin.from('materials')
    .insert({ company_id: A, name: 'Kupferrohr 15', unit: 'm', stock: 100 }).select('id').single();
  if (error) throw new Error(error.message);
  rohr = data!.id;
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M2: verrechnet je Ausgabe', () => {
  let erste: string;
  let spaet: string;

  it('die neue Rechnung verknüpft, was ihre Vorschau zeigte — danach ist es weg und gesperrt', async () => {
    erste = await abholung(10);
    await ruestliste(vorTagen(1), 'Pressfitting', 4);
    clientEinreichen(buch.client);
    const liste = await anforderungen.ausgegebenesMaterial(NR);
    expect(liste.map((a) => a.art).sort()).toEqual(['anforderung', 'ruestliste']);
    await rechnung('RE-M2-1', belegeAus(liste), true);
    expect(await vorschlag()).toEqual([]);

    const { data: o } = await admin.from('material_orders').select('is_billed, invoice_number').eq('id', erste).single();
    expect(o).toEqual({ is_billed: true, invoice_number: 'RE-M2-1' });
  });

  it('Fall a und b: am selben Tag später abgeholt, spät abgehakte Rüstliste — beides steht im nächsten Vorschlag', async () => {
    spaet = await abholung(3);
    await ruestliste(vorTagen(3), 'Muffe', 2);
    clientEinreichen(buch.client);
    expect(await vorschlag()).toEqual(['anforderung Kupferrohr 15 3', 'ruestliste Muffe 2']);
  });

  it('die spätere Abholung ist nicht „schon abgerechnet“ — die verknüpfte schon (Löschsperre)', async () => {
    // Die Rückfrage des Löschens liest `app.material_abgerechnet`.
    const frei = await verw.client.rpc('anforderung_loeschen', { p_id: spaet });
    expect(frei.error).toBeNull();
    expect((frei.data as { ergebnis: string }).ergebnis).toBe('moeglich');
    const gesperrt = await verw.client.rpc('anforderung_loeschen', { p_id: erste });
    expect(gesperrt.data).toMatchObject({ ergebnis: 'abgewiesen', grund: expect.stringMatching(/Steht schon auf einer Rechnung \(RE-M2-1\)/) });
  });

  it('eine Rüstlistenposition steht höchstens auf einer gültigen Rechnung', async () => {
    clientEinreichen(buch.client);
    const liste = await anforderungen.ausgegebenesMaterial(NR);
    const ruest = belegeAus(liste).ruest_position;
    await rechnung('RE-M2-2', { ruest_position: ruest }, true);
    await expect(rechnung('RE-M2-3', { ruest_position: ruest }, true)).rejects.toThrow(/schon auf der Rechnung RE-M2-2/);
  });

  it('ein Storno gibt die verknüpften Ausgaben wieder frei', async () => {
    clientEinreichen(buch.client);
    const { data: r } = await admin.from('invoices').select('id').eq('company_id', A).eq('invoice_number', 'RE-M2-1').single();
    const { error } = await buch.client.rpc('rechnung_stornieren', { p_id: r!.id, p_grund: 'Prüfung' });
    expect(error).toBeNull();
    expect(await vorschlag()).toEqual([
      'anforderung Kupferrohr 15 10', 'anforderung Kupferrohr 15 3', 'ruestliste Pressfitting 4',
    ]);
  });

  it('Gleichbleiben (Altdaten, alte App): ohne Kennzeichen deckt die Rechnung, was es beim Anlegen gab, bis zum Leistungsende', async () => {
    clientEinreichen(buch.client);
    await rechnung('RE-M2-ALT', {}, false);
    expect(await vorschlag()).toEqual([]);
    // Nach ihr Ausgegebenes deckt sie nicht — es stand auf keiner Rechnung.
    await abholung(7);
    expect(await vorschlag()).toEqual(['anforderung Kupferrohr 15 7']);
  });

  it('Gleichbleiben: eine Anzahlung deckt nichts', async () => {
    clientEinreichen(buch.client);
    const { error } = await buch.client.rpc('rechnung_anlegen', {
      p_kopf: {
        invoice_number: 'RE-M2-AZ', project_number: NR, customer_name: 'Familie Huber', art: 'anzahlung',
        address: 'Hauptplatz 1, 8200 Gleisdorf', invoice_date: heute, due_date: heute,
        total_netto: 100, total_vat: 20, total_brutto: 120, vat_rate: 20, payment_status: 'Offen',
      },
      p_positionen: [{ label: 'Anzahlung', qty: 1, unit: 'Pauschale', unit_price: 100, netto: 100 }],
      p_belege: {},
    });
    expect(error).toBeNull();
    expect(await vorschlag()).toEqual(['anforderung Kupferrohr 15 7']);
  });
});
