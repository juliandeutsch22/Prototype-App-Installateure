/**
 * Eine Schlussrechnung mit Rest 0,00 € gilt als bezahlt, sobald sie
 * ausgestellt ist (Durchsicht 15.11.2026, G4).
 *
 * Vorher blieb sie für immer „Offen“: sie beginnt offen, ein Eingang über
 * null Euro ist keiner, und der Zahlstand kannte „Bezahlt“ nur über eine
 * Summe größer null. Ohne `20261116050100_schluss_ohne_rest.sql` ist die
 * erste Prüfung rot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { createZahlung } from '@/lib/db/pg/zahlungen';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'schluss-g4';

let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g4buch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

const kopf = (baustelle: string) => ({
  projectNumber: baustelle, customerName: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf',
  invoiceDate: heute(), dueDate: heute(), vatRate: 0.2, paymentStatus: 'Offen' as const,
});

async function stand(id: string): Promise<string> {
  const { data } = await admin.from('invoices').select('payment_status').eq('id', id).single();
  return data!.payment_status as string;
}

/** Anzahlung über 1.200 € — bezahlt — und eine Schlussrechnung, die sie ganz abzieht. */
async function schlussOhneRest(baustelle: string) {
  const anzahlung = await rechnungen.rechnungAusstellen(BETRIEB, {
    ...kopf(baustelle), art: 'anzahlung',
    subtotalNetto: 1000, totalNetto: 1000, totalVat: 200, totalBrutto: 1200,
    positions: [{ label: 'Anzahlung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
  } as Parameters<typeof rechnungen.rechnungAusstellen>[1], { praefix: 'RE' });
  await createZahlung(BETRIEB, {
    invoiceId: anzahlung.id, datum: heute(), betrag: 1200, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
  });
  const schluss = await rechnungen.rechnungAusstellen(BETRIEB, {
    ...kopf(baustelle), art: 'schluss', leistungVon: heute(), leistungBis: heute(),
    subtotalNetto: 1000, totalNetto: 0, totalVat: 0, totalBrutto: 0,
    gesamtNetto: 1000, gesamtVat: 200, gesamtBrutto: 1200,
    vorrechnungen: [{
      invoiceId: anzahlung.id, invoiceNumber: anzahlung.invoiceNumber, invoiceDate: heute(),
      netto: 1000, vat: 200, brutto: 1200,
    }],
    positions: [{ label: 'Badsanierung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
  } as Parameters<typeof rechnungen.rechnungAusstellen>[1], { praefix: 'RE' });
  return { anzahlung, schluss };
}

describe('Schlussrechnung ohne Rest (G4)', () => {
  it('ist gleich nach dem Ausstellen bezahlt — nicht mehr dauerhaft offen', async () => {
    const { schluss } = await schlussOhneRest('B-G4-1');
    expect(await stand(schluss.id)).toBe('Bezahlt');
    const offen = await rechnungen.listUnpaidInvoices(BETRIEB);
    expect(offen.map((r) => r.id)).not.toContain(schluss.id);
  });

  it('Storno und Aufheben: danach wieder bezahlt', async () => {
    const { schluss } = await schlussOhneRest('B-G4-2');
    const inv = { id: schluss.id } as WithId<Invoice>;
    await rechnungen.cancelInvoice(inv, 'Falsche Anschrift');
    expect(await stand(schluss.id)).toBe('Storniert');
    await rechnungen.reactivateInvoice(inv);
    expect(await stand(schluss.id)).toBe('Bezahlt');
  });

  // Bleibt gleich: eine Rechnung mit Forderung beginnt offen und bleibt es bis zum Eingang.
  it('eine Rechnung mit Forderung bleibt offen, bis gezahlt ist', async () => {
    const r = await rechnungen.rechnungAusstellen(BETRIEB, {
      ...kopf('B-G4-3'), leistungVon: heute(), leistungBis: heute(),
      subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120,
      positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
    } as Parameters<typeof rechnungen.rechnungAusstellen>[1], { praefix: 'RE' });
    expect(await stand(r.id)).toBe('Offen');
    await createZahlung(BETRIEB, {
      invoiceId: r.id, datum: heute(), betrag: 120, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    });
    expect(await stand(r.id)).toBe('Bezahlt');
  });
});
