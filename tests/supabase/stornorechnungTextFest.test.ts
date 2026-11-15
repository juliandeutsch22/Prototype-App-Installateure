/**
 * Was die Stornorechnung zum bereits Bezahlten sagt, steht beim Ausstellen
 * fest (Durchsicht 15.11.2026, G8).
 *
 * Vorher rechnete jeder Druck aus dem Zahlstand des Augenblicks: nach einer
 * Rückzahlung sagte der Nachdruck „entfällt“ statt „erstatten wir“. Ohne
 * `20261116050500_stornorechnung_text_fest.sql` gibt es `storno_bezahlt` nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { createZahlung } from '@/lib/db/pg/zahlungen';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'storno-text-g8';
let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g8buch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

describe('Stornorechnung: der bezahlte Betrag steht fest (G8)', () => {
  it('bleibt nach der Rückzahlung, wie er beim Ausstellen war — und lässt sich nicht ändern', async () => {
    const r = await rechnungen.rechnungAusstellen(BETRIEB, {
      projectNumber: 'B-G8', customerName: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf',
      invoiceDate: heute(), leistungVon: heute(), leistungBis: heute(), dueDate: heute(),
      subtotalNetto: 1000, totalNetto: 1000, totalVat: 200, totalBrutto: 1200, vatRate: 0.2, paymentStatus: 'Offen',
      positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    }, { praefix: 'RE' });
    const zahlen = (betrag: number) => createZahlung(BETRIEB, {
      invoiceId: r.id, datum: heute(), betrag, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    });
    await zahlen(200);
    const inv = { id: r.id } as WithId<Invoice>;
    await rechnungen.cancelInvoice(inv, 'Falscher Kunde');
    await rechnungen.stornorechnungAusstellen(inv, 'RE');
    await zahlen(-200);

    const { data } = await admin.from('invoices').select('bezahlt_betrag, storno_bezahlt').eq('id', r.id).single();
    expect(Number(data!.bezahlt_betrag)).toBe(0);
    expect(Number(data!.storno_bezahlt)).toBe(200);

    const { error } = await buch.client.from('invoices').update({ storno_bezahlt: 0 }).eq('id', r.id);
    expect(error).not.toBeNull();
  });
});
