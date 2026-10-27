/**
 * Keine Rechnung ohne Leistungszeitraum (Testbericht Runde 6, M8) — gegen
 * eine echte Datenbank.
 *
 * Auf PR-2026-0195 ging eine Teilrechnung ohne „Leistung von“ und „Leistung
 * bis“ durch; das PDF trug weder Tag noch Zeitraum der Leistung (§ 11 UStG).
 * Die Maske sperrt jetzt, und hier sperrt die Datenbank
 * (`app.leistungszeitraum_pflicht`). Jede Regel mit Gegenprobe: was sie
 * verbietet UND was sie weiter zulässt — die Anzahlung ohne Zeitraum und
 * bestehende Rechnungen, die nicht umgeschrieben werden.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';

const BETRIEB = 'r6p3-leistung';
let buch: Konto;
let lauf = 0;

function anlegen(kopf: Record<string, unknown>) {
  return buch.client.rpc('rechnung_anlegen', {
    p_kopf: {
      invoice_number: `R6L-${++lauf}`, project_number: 'R6L-1', customer_name: 'Kunde',
      invoice_date: '2026-10-27', due_date: '2026-11-10', address: 'Hauptplatz 1, 8200 Gleisdorf',
      total_netto: 100, total_vat: 20, total_brutto: 120, vat_rate: 0.2, payment_status: 'Offen',
      ...kopf,
    },
    p_positionen: [{ label: 'Facharbeit', qty: 1, unit: 'h', unit_price: 100, netto: 100 }],
    p_belege: {},
  });
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'r6p3buch');
}, 60_000);

describe('M8 — Tag oder Zeitraum der Leistung', () => {
  it('eine Rechnung ohne Leistungszeitraum wird nicht angelegt', async () => {
    const { error } = await anlegen({});
    expect(error?.code).toBe('23514');
    expect(error?.message).toMatch(/Ohne Tag oder Zeitraum der Leistung/);
  });

  it('auch nicht als Teil- oder Schlussrechnung', async () => {
    for (const art of ['teil', 'schluss']) {
      const { error } = await anlegen({ art, project_number: `R6L-${art}` });
      expect(error?.message).toMatch(/Ohne Tag oder Zeitraum der Leistung/);
    }
  });

  it('ein halber Zeitraum genügt nicht', async () => {
    expect((await anlegen({ leistung_von: '2026-10-20' })).error?.message).toMatch(/Ohne Tag oder Zeitraum/);
    expect((await anlegen({ leistung_bis: '2026-10-20' })).error?.message).toMatch(/Ohne Tag oder Zeitraum/);
  });

  it('ein verdrehter Zeitraum wird nicht angelegt', async () => {
    const { error } = await anlegen({ leistung_von: '2026-10-20', leistung_bis: '2026-10-01' });
    expect(error?.code).toBe('23514');
    expect(error?.message).toMatch(/verdreht.*01\.10\.2026.*20\.10\.2026/);
  });

  it('Gegenprobe: mit Zeitraum — und mit einem einzelnen Tag — entsteht die Rechnung', async () => {
    expect((await anlegen({ leistung_von: '2026-10-01', leistung_bis: '2026-10-20' })).error).toBeNull();
    expect((await anlegen({ leistung_von: '2026-10-20', leistung_bis: '2026-10-20' })).error).toBeNull();
  });

  it('die Anzahlung bleibt ohne Zeitraum möglich — ihre Leistung steht noch aus', async () => {
    const { error } = await anlegen({ art: 'anzahlung', project_number: 'R6L-anz' });
    expect(error).toBeNull();
  });

  it('verdreht ist auch der voraussichtliche Zeitraum einer Anzahlung nicht', async () => {
    const { error } = await anlegen({
      art: 'anzahlung', project_number: 'R6L-anz2', leistung_von: '2026-12-01', leistung_bis: '2026-11-01',
    });
    expect(error?.message).toMatch(/verdreht/);
  });

  it('bestehende Rechnungen ohne Zeitraum bleiben, wie sie sind, und lassen sich weiter führen', async () => {
    // Wie Altbestand: über den Dienstschlüssel (Rücklauf), ohne Zeitraum.
    const { data, error } = await admin.from('invoices').insert({
      company_id: BETRIEB, invoice_number: `R6L-${++lauf}`, project_number: 'R6L-alt', customer_name: 'Kunde',
      invoice_date: '2026-09-01', due_date: '2026-09-15', address: 'Hauptplatz 1, 8200 Gleisdorf',
      total_netto: 100, total_vat: 20, total_brutto: 120, vat_rate: 0.2, payment_status: 'Offen',
    }).select('id').single();
    expect(error).toBeNull();
    // Die Regel gilt beim Anlegen — der Zahlungsstand einer alten Rechnung ändert sich weiter.
    const { error: geaendert } = await buch.client.from('invoices')
      .update({ payment_status: 'Überfällig' }).eq('id', data!.id);
    expect(geaendert).toBeNull();
    const { data: danach } = await admin.from('invoices').select('payment_status, leistung_von').eq('id', data!.id).single();
    expect(danach).toEqual({ payment_status: 'Überfällig', leistung_von: null });
  });
});
