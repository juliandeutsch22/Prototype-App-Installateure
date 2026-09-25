/**
 * Eine Rechnung ändert sich nur über die Wege, die dafür gebaut sind.
 *
 * Aus dem Prüflauf (25.09.2026):
 *
 *   P2-15  Abdeckung frei beschreib- und löschbar, Positionen jederzeit
 *          einfügbar, Fälligkeit/Anschrift/Rabatt nicht eingefroren, eine
 *          Rechnung liess sich gleich „Bezahlt" anlegen, „Storniert" per
 *          `update` setzen und wieder wegnehmen, und ein zweiter Storno setzte
 *          das Stornodatum neu.
 *   P2-16  Das Aufheben eines Stornos übersah, dass ein Handwerksschein
 *          inzwischen auf einer anderen Rechnung steht.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'funk-a';
const JAHR = new Date().getFullYear();

let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'fbuch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

let lfd = 3000;

/** Eine Rechnung über 1.200 € brutto, angelegt auf dem Weg der App. */
async function anlegen(extra: Partial<rechnungen.NewInvoice> = {}): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-${JAHR}-${lfd}`,
    projectNumber: 'B-400',
    customerName: 'Familie Huber',
    address: 'Hauptstraße 1, 2700 Wiener Neustadt',
    invoiceDate: '2026-04-30',
    dueDate: '2026-05-14',
    subtotalNetto: 1000,
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    ...extra,
  });
}

const nurKennung = (id: string) => ({ id } as unknown as WithId<Invoice>);

describe('Positionen und Abdeckung entstehen nur mit ihrer Rechnung', () => {
  it('eine Position lässt sich nicht nachträglich einfügen', async () => {
    const id = await anlegen();
    const { error } = await buch.client.from('invoice_lines').insert({
      company_id: BETRIEB, invoice_id: id, position: 5,
      label: 'Nachtrag', qty: 1, unit: 'Stk', unit_price: 10, netto: 10,
    });
    expect(error?.code).toBe('42501');
  });

  it('eine Abdeckung lässt sich weder einfügen noch löschen', async () => {
    const schein = crypto.randomUUID();
    const id = await anlegen({ linkedWorkSheets: [schein] });

    const dazu = await buch.client.from('invoice_coverage').insert({
      company_id: BETRIEB, invoice_id: id, art: 'work_sheet', ziel_id: crypto.randomUUID(),
    });
    expect(dazu.error?.code).toBe('42501');

    // Ohne Richtlinie trifft das Löschen nichts — der Schein bleibt verrechnet.
    await buch.client.from('invoice_coverage').delete().eq('invoice_id', id);
    const { data } = await admin.from('invoice_coverage').select('ziel_id').eq('invoice_id', id);
    expect(data).toEqual([{ ziel_id: schein }]);
  });
});

describe('Eine neue Rechnung beginnt offen', () => {
  it('nicht als „Bezahlt" und nicht als „Storniert"', async () => {
    for (const stand of ['Bezahlt', 'Storniert', 'Überzahlt']) {
      lfd += 1;
      const { error } = await buch.client.from('invoices').insert({
        company_id: BETRIEB, invoice_number: `RE-${JAHR}-${lfd}`, project_number: 'B-400',
        customer_name: 'Familie Huber', invoice_date: '2026-04-30', due_date: '2026-05-14',
        total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: stand,
      });
      expect(error?.code, stand).toBe('42501');
    }
  });

  it('und nicht mit einem Betrag, der nie eingegangen ist', async () => {
    lfd += 1;
    const { error } = await buch.client.from('invoices').insert({
      company_id: BETRIEB, invoice_number: `RE-${JAHR}-${lfd}`, project_number: 'B-400',
      customer_name: 'Familie Huber', invoice_date: '2026-04-30', due_date: '2026-05-14',
      total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
      bezahlt_betrag: 120,
    });
    expect(error?.code).toBe('42501');
  });
});

describe('Was auf dem Beleg steht, ist eingefroren', () => {
  it('Fälligkeit, Anschrift, Rabatt, Zwischensumme und Kunde', async () => {
    const id = await anlegen({ discount: { mode: 'percent', value: 5 }, discountAmount: 50 });
    // Ein echter Kunde — sonst schlüge schon der Fremdschlüssel an.
    const { data: kunde } = await admin.from('customers')
      .insert({ company_id: BETRIEB, name: 'Jemand anderer' }).select('id').single();
    for (const feld of [
      { due_date: '2030-01-01' },
      { address: 'Anderswo 1' },
      { discount_label: 'Nachträglich' },
      { discount_value: 50 },
      { discount_amount: 1 },
      { subtotal_netto: 1 },
      { customer_id: kunde!.id },
    ]) {
      const { error } = await buch.client.from('invoices').update(feld).eq('id', id);
      expect(error, JSON.stringify(feld)).not.toBeNull();
    }
  });

  it('der Fälligkeitsstand und das Mahnwesen bewegen sich weiter', async () => {
    const id = await anlegen();
    await rechnungen.updateInvoiceStatus(id, 'Überfällig');
    await rechnungen.mahnungFesthalten(id, {
      stufe: 1, gemahntAm: '2026-05-20', frist: '2026-05-27', spesen: 10, standJetzt: 'Überfällig',
    });
    const { data } = await admin.from('invoices')
      .select('payment_status, mahnstufe').eq('id', id).single();
    expect(data).toEqual({ payment_status: 'Überfällig', mahnstufe: 1 });
  });
});

describe('Storno nur über seine Funktion', () => {
  it('„Storniert" lässt sich nicht per update setzen', async () => {
    const id = await anlegen();
    const { error } = await buch.client.from('invoices').update({
      payment_status: 'Storniert', cancellation_note: 'von Hand', cancelled_at: new Date().toISOString(),
    }).eq('id', id);
    expect(error?.code).toBe('42501');
  });

  it('und nicht per update wieder wegnehmen', async () => {
    const id = await anlegen();
    await rechnungen.cancelInvoice(nurKennung(id), 'Irrtum');
    for (const feld of [
      { payment_status: 'Offen' },
      { payment_status: 'Offen', cancelled_at: null, cancellation_note: null },
      { cancellation_note: 'anderer Grund' },
      { cancelled_at: '2020-01-01T00:00:00Z' },
    ]) {
      const { error } = await buch.client.from('invoices').update(feld).eq('id', id);
      expect(error?.code, JSON.stringify(feld)).toBe('42501');
    }
    const { data } = await admin.from('invoices').select('payment_status').eq('id', id).single();
    expect(data!.payment_status).toBe('Storniert');
  });

  it('eine stornierte Rechnung wird nicht ein zweites Mal storniert', async () => {
    const id = await anlegen();
    await rechnungen.cancelInvoice(nurKennung(id), 'Erster Grund');
    const { data: vorher } = await admin.from('invoices')
      .select('cancelled_at, cancellation_note').eq('id', id).single();

    await expect(rechnungen.cancelInvoice(nurKennung(id), 'Zweiter Grund'))
      .rejects.toThrow(/bereits storniert/);

    const { data: nachher } = await admin.from('invoices')
      .select('cancelled_at, cancellation_note').eq('id', id).single();
    expect(nachher).toEqual(vorher);
    expect(nachher!.cancellation_note).toBe('Erster Grund');
  });

  it('eine Rechnung, die es nicht gibt, bleibt ein Fehler', async () => {
    await expect(rechnungen.cancelInvoice(nurKennung(crypto.randomUUID()), 'x'))
      .rejects.toThrow(/gibt es nicht/);
  });
});

describe('Aufheben, wenn ein Schein weitergewandert ist (P2-16)', () => {
  it('bleibt der Storno', async () => {
    const schein = crypto.randomUUID();
    const erste = await anlegen({ linkedWorkSheets: [schein] });
    await rechnungen.cancelInvoice(nurKennung(erste), 'Falscher Kunde');
    // Derselbe Schein, neu verrechnet.
    const zweite = await anlegen({ linkedWorkSheets: [schein] });
    const { data: z } = await admin.from('invoices').select('invoice_number').eq('id', zweite).single();

    await expect(rechnungen.reactivateInvoice(nurKennung(erste)))
      .rejects.toThrow(new RegExp(`inzwischen auf ${z!.invoice_number}`));
    const { data } = await admin.from('invoices').select('payment_status').eq('id', erste).single();
    expect(data!.payment_status).toBe('Storniert');
  });

  it('ist der Schein frei, geht das Aufheben am selben Tag weiterhin', async () => {
    const schein = crypto.randomUUID();
    const id = await anlegen({ linkedWorkSheets: [schein] });
    await rechnungen.cancelInvoice(nurKennung(id), 'Fehlgriff');
    await rechnungen.reactivateInvoice(nurKennung(id));
    const { data } = await admin.from('invoices').select('payment_status').eq('id', id).single();
    expect(data!.payment_status).toBe('Offen');
  });
});

/*
  PRÜFLAUF 25.09.2026, P2-02. Die Rechnung geht an die Anschrift des Kunden;
  die Baustelle steht als „Ort der Leistung" daneben. Beides kommt mit der
  Rechnung in die Datenbank, und beides ist danach eingefroren — ein
  Nachdruck muss denselben Beleg ergeben.
*/
describe('Empfänger und Ort der Leistung (P2-02)', () => {
  it('werden mitgeschrieben und wieder gelesen', async () => {
    const id = await anlegen({
      address: 'Kundenweg 1, 2700 Wiener Neustadt',
      leistungsort: 'Bergweg 3, 2700 Wiener Neustadt',
    });
    const alle = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(alle.find((r) => r.id === id)).toMatchObject({
      address: 'Kundenweg 1, 2700 Wiener Neustadt',
      leistungsort: 'Bergweg 3, 2700 Wiener Neustadt',
    });
  });

  it('der Ort der Leistung ist eingefroren wie der Rest des Belegs', async () => {
    const id = await anlegen({ leistungsort: 'Bergweg 3' });
    const { error } = await buch.client.from('invoices')
      .update({ leistungsort: 'Anderswo' }).eq('id', id);
    expect(error?.code).toBe('42501');
  });
});

/*
  PRÜFLAUF 25.09.2026, P2-14. Das Ausgangsbuch führt einen Storno als
  Gegenbuchung in dem Zeitraum, in dem storniert wurde. Dafür muss der
  Export eines Zeitraums auch die ältere Rechnung finden, die darin
  storniert wurde — vorher suchte er nur nach dem Rechnungsdatum.
*/
describe('Der Zeitraum eines Exports findet auch seine Storni (P2-14)', () => {
  it('eine ältere, heute stornierte Rechnung steht im heutigen Zeitraum', async () => {
    const id = await anlegen({ invoiceDate: '2020-01-15', dueDate: '2020-01-29' });
    await rechnungen.cancelInvoice(nurKennung(id), 'Irrtum');

    const tag = (versatz: number) =>
      new Date(Date.now() + versatz * 86_400_000).toISOString().slice(0, 10);
    const jetzt = await rechnungen.listInvoicesInRange(BETRIEB, tag(-1), tag(1));
    expect(jetzt.map((r) => r.id)).toContain(id);

    // Und in ihrem eigenen Zeitraum steht sie weiterhin.
    const damals = await rechnungen.listInvoicesInRange(BETRIEB, '2020-01-01', '2020-01-31');
    expect(damals.map((r) => r.id)).toContain(id);
  });
});
