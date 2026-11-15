/**
 * Guthaben mit einer neuen Rechnung verrechnen (Durchsicht 15.11.2026, V7).
 *
 * `guthaben_umbuchen` schreibt beide Hälften in einem Zug; sie lassen sich
 * nicht ändern und nur zusammen löschen. Ohne
 * `20261116050800_guthaben_umbuchen.sql` gibt es die Funktion nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { createZahlung, guthabenUmbuchen } from '@/lib/db/pg/zahlungen';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'umbuchen-v7';
let buch: Konto;
let anton: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'v7buch');
  anton = await konto(BETRIEB, 'Mitarbeiter', 'v7anton');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

async function rechnung(kunde = 'Familie Huber', netto = 1000): Promise<string> {
  const r = await rechnungen.rechnungAusstellen(BETRIEB, {
    projectNumber: 'B-V7', customerName: kunde, address: 'Gartengasse 4, 8200 Gleisdorf',
    invoiceDate: heute(), leistungVon: heute(), leistungBis: heute(), dueDate: heute(),
    subtotalNetto: netto, totalNetto: netto, totalVat: netto * 0.2, totalBrutto: netto * 1.2, vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: netto, netto }],
  }, { praefix: 'RE' });
  return r.id;
}

async function stand(id: string) {
  const { data } = await admin.from('invoices').select('payment_status, bezahlt_betrag').eq('id', id).single();
  return { status: data!.payment_status as string, bezahlt: Number(data!.bezahlt_betrag) };
}

/** Eine bezahlte, dann stornierte Rechnung — mit 1.200 € Guthaben. */
async function guthaben(): Promise<string> {
  const id = await rechnung();
  await createZahlung(BETRIEB, { invoiceId: id, datum: heute(), betrag: 1200, art: 'Überweisung', erfasstVonName: 'Buchhaltung' });
  await rechnungen.cancelInvoice({ id } as WithId<Invoice>, 'Preis falsch');
  return id;
}

describe('Guthaben umbuchen (V7)', () => {
  it('verrechnet das Guthaben mit der neuen Rechnung — beide Stände folgen', async () => {
    const alt = await guthaben();
    const neu = await rechnung();
    await guthabenUmbuchen(alt, neu, 1200);
    expect(await stand(alt)).toEqual({ status: 'Storniert', bezahlt: 0 });
    expect(await stand(neu)).toEqual({ status: 'Bezahlt', bezahlt: 1200 });
    const { data } = await admin.from('zahlungseingaenge').select('invoice_id, betrag, art, umbuchung').in('invoice_id', [alt, neu]).eq('art', 'Umbuchung');
    expect(data).toHaveLength(2);
    expect(new Set((data ?? []).map((z) => z.umbuchung)).size).toBe(1);
  });

  it('nicht mehr als das Guthaben, nicht mehr als offen, nur derselbe Kunde', async () => {
    const alt = await guthaben();
    const klein = await rechnung('Familie Huber', 500);
    const fremd = await rechnung('Anderer Kunde');
    await expect(guthabenUmbuchen(alt, klein, 700)).rejects.toThrow(/nur 600,00 € offen/);
    await expect(guthabenUmbuchen(alt, fremd, 100)).rejects.toThrow(/desselben Kunden/);
    const neu = await rechnung('Familie Huber', 2000);
    await expect(guthabenUmbuchen(alt, neu, 1300)).rejects.toThrow(/Guthaben/);
  });

  it('die Hälften gehören zusammen: nicht änderbar, nur gemeinsam löschbar, nicht von Hand anzulegen', async () => {
    const alt = await guthaben();
    const neu = await rechnung();
    await guthabenUmbuchen(alt, neu, 1200);
    const { data: haelften } = await admin.from('zahlungseingaenge').select('id').eq('invoice_id', neu).eq('art', 'Umbuchung');
    const { error: aendern } = await buch.client.from('zahlungseingaenge').update({ betrag: 1 }).eq('id', haelften![0].id);
    expect(aendern?.message).toMatch(/nicht ändern/);
    const { error: loeschen } = await buch.client.from('zahlungseingaenge').delete().eq('id', haelften![0].id);
    expect(loeschen).toBeNull();
    const { count } = await admin.from('zahlungseingaenge').select('id', { count: 'exact', head: true }).eq('art', 'Umbuchung').in('invoice_id', [alt, neu]);
    expect(count).toBe(0);
    expect(await stand(alt)).toEqual({ status: 'Storniert', bezahlt: 1200 });
    const { error: vonHand } = await buch.client.from('zahlungseingaenge').insert({
      company_id: BETRIEB, invoice_id: neu, datum: heute(), betrag: 5, art: 'Umbuchung', umbuchung: crypto.randomUUID(),
    });
    expect(vonHand?.message).toMatch(/nur als Ganzes/);
  });

  it('ein Monteur bucht nicht um', async () => {
    const alt = await guthaben();
    const neu = await rechnung();
    const { error } = await anton.client.rpc('guthaben_umbuchen', { p_von: alt, p_auf: neu, p_betrag: 100 });
    expect(error?.code).toBe('42501');
  });
});
