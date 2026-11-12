/**
 * SCHEINE OHNE MATERIAL IM ABGERECHNETEN ZEITRAUM (Gesamtanalyse 12.11.2026,
 * A1) — gegen die echte Datenbank, über `scheineAufRechnung`, die Stelle, die
 * Startseite, Rechnungen, Scheinliste und Baustellenakte gleich fragen.
 *
 * Bis zum 12.11.2026 verknüpfte eine Rechnung nur die Scheine, deren Material
 * sie brachte. Ein Schein nur mit Stunden stand danach auf keiner Rechnung und
 * galt für immer als „nicht verrechnet“ — nachgestellt in der laufenden App:
 * Schein unterschrieben, Rechnung über alle Stunden erstellt, der Schein stand
 * weiter unter „Nicht verrechnete Leistung“. Die schon ausgestellten
 * Rechnungen werden nicht umgeschrieben; die Antwort kommt aus der Regel
 * `inAbgerechnetemZeitraum`.
 *
 * Gegenprobe: ohne die Änderung in `scheineAufRechnung` fehlen die Scheine der
 * ersten Gruppe in der Antwort; die Erhaltung ist mit und ohne grün.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const B = 'zeitraum-unverr-a';
let buch: Konto;
let laufend = 9100;

async function baustelle(nummer: string) {
  const { error } = await admin.from('projects').insert({
    company_id: B, project_number: nummer, customer_name: 'Familie Huber', status: 'Aktiv', billing_mode: 'Regie',
  });
  if (error) throw new Error(error.message);
}

async function schein(nummer: string, datum: string, material: Array<{ name: string; menge: number }> = []): Promise<string> {
  const id = crypto.randomUUID();
  // Erst als Entwurf: ein unterschriebener Schein nimmt keine Positionen mehr an.
  const { error } = await admin.from('work_sheets').insert({
    id, company_id: B, project_number: nummer, customer_name: 'Familie Huber',
    datum, status: 'Entwurf', abrechnung: 'Regie', erstellt_von_uid: buch.uid, erstellt_von_name: 'Büro',
  });
  if (error) throw new Error(error.message);
  if (material.length > 0) {
    const { error: f } = await admin.from('work_sheet_material').insert(
      material.map((m, position) => ({ company_id: B, work_sheet_id: id, position, ...m })),
    );
    if (f) throw new Error(f.message);
  }
  const { error: u } = await admin.from('work_sheets').update({ status: 'Unterschrieben' }).eq('id', id);
  if (u) throw new Error(u.message);
  return id;
}

/** Eine Rechnung der Baustelle; `belege` = Zahl der verrechneten Buchungen (Abdeckung). */
async function rechnung(nummer: string, p: {
  von?: string | null; bis?: string | null; datum?: string; art?: string; status?: string; belege?: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  laufend += 1;
  const { error } = await admin.from('invoices').insert({
    id, company_id: B, invoice_number: `RE-2026-${laufend}`, project_number: nummer, customer_name: 'Familie Huber',
    invoice_date: p.datum ?? '2026-10-16', due_date: '2026-10-30', total_netto: 1000, total_vat: 200, total_brutto: 1200,
    payment_status: p.status ?? 'Offen', art: p.art ?? 'einzel',
    leistung_von: p.von === undefined ? '2026-10-01' : p.von,
    leistung_bis: p.bis === undefined ? '2026-10-15' : p.bis,
  });
  if (error) throw new Error(error.message);
  const n = p.belege ?? 1;
  if (n > 0) {
    const { error: f } = await admin.from('invoice_coverage').insert(
      Array.from({ length: n }, () => ({ company_id: B, invoice_id: id, art: 'time_entry', ziel_id: crypto.randomUUID() })),
    );
    if (f) throw new Error(f.message);
  }
  return id;
}

beforeAll(async () => {
  await betriebAnlegen(B);
  buch = await konto(B, 'Buchhaltung', 'zeitraum-unverr-buch');
  clientEinreichen(buch.client);
  for (const b of ['ZR-REGIE', 'ZR-STORNO', 'ZR-ANZ', 'ZR-OHNE', 'ZR-ALT', 'PR-ZR-FORM']) await baustelle(b);
  await rechnung('ZR-REGIE', {});
  await rechnung('ZR-STORNO', { status: 'Storniert' });
  await rechnung('ZR-ANZ', { art: 'anzahlung' });
  await rechnung('ZR-OHNE', { belege: 0 });                     // verbraucht nichts (etwa Teilbetrag einer Pauschale)
  await rechnung('ZR-ALT', { von: null, bis: null, datum: '2026-10-15' });
  await rechnung('ZR-FORM', {});                                // andere Schreibweise als die Baustelle
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Im abgerechneten Zeitraum', () => {
  it('ein Schein nur mit Stunden, dessen Tag die Rechnung abgerechnet hat, gilt als verrechnet', async () => {
    const s = await schein('ZR-REGIE', '2026-10-10');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([s]);
  });

  it('auch am ersten und am letzten Tag des Zeitraums', async () => {
    const [a, z] = [await schein('ZR-REGIE', '2026-10-01'), await schein('ZR-REGIE', '2026-10-15')];
    expect((await rechnungen.scheineAufRechnung(B, [a, z])).sort()).toEqual([a, z].sort());
  });

  it('ohne „Leistung von/bis“ zählt alles bis zum Rechnungsdatum', async () => {
    const s = await schein('ZR-ALT', '2026-09-01');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([s]);
  });

  it('in jeder Schreibweise der Baustellennummer', async () => {
    const s = await schein('PR-ZR-FORM', '2026-10-05');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([s]);
  });
});

describe('Erhaltung', () => {
  it('ein Schein MIT Material bleibt offen — sein Material kommt nur über ihn auf die Rechnung', async () => {
    const s = await schein('ZR-REGIE', '2026-10-10', [{ name: 'Eckventil 1/2 Zoll', menge: 2 }]);
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([]);
  });

  it('nach dem Zeitraum und davor bleibt er offen', async () => {
    const [nach, vor] = [await schein('ZR-REGIE', '2026-10-16'), await schein('ZR-REGIE', '2026-09-30')];
    expect(await rechnungen.scheineAufRechnung(B, [nach, vor])).toEqual([]);
  });

  it('eine stornierte Rechnung rechnet nichts ab', async () => {
    const s = await schein('ZR-STORNO', '2026-10-10');
    expect(await rechnungen.scheineAufRechnung(B, [s])).toEqual([]);
  });

  it('eine Anzahlung und eine Rechnung ohne verbrauchte Belege rechnen keinen Tag ab', async () => {
    const [a, o] = [await schein('ZR-ANZ', '2026-10-10'), await schein('ZR-OHNE', '2026-10-10')];
    expect(await rechnungen.scheineAufRechnung(B, [a, o])).toEqual([]);
  });

  it('gemischt: jeder Schein bekommt seine Antwort', async () => {
    const drin = await schein('ZR-REGIE', '2026-10-11');
    const mitMaterial = await schein('ZR-REGIE', '2026-10-11', [{ name: 'Rohr', menge: 1 }]);
    const danach = await schein('ZR-REGIE', '2026-10-20');
    expect(await rechnungen.scheineAufRechnung(B, [drin, mitMaterial, danach, crypto.randomUUID()])).toEqual([drin]);
  });
});
