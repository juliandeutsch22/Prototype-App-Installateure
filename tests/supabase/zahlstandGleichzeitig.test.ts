/**
 * Gleichzeitige Zahlungseingänge überschreiben den Zahlstand nicht
 * (Durchsicht 15.11.2026, G9).
 *
 * Nachgestellt in zwei Datenbanksitzungen: Eingang B begann, während
 * Eingang A noch offen war; `app.zahlstand_setzen` von B summierte ohne A und
 * schrieb nach dem Warten seine Teilsumme (50 € statt 150 €). Ebenso schrieb
 * ein Eingang, der mit einem Storno zusammenfiel, „Bezahlt“ über
 * „Storniert“. Hier über die echte Schnittstelle: viele Eingänge zugleich,
 * und Eingang und Storno zugleich. Ohne die Sperre aus
 * `20261116050000_zahlstand_sperren.sql` weicht `bezahlt_betrag` von der
 * Summe der Eingänge ab; mit ihr nie.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { createZahlung } from '@/lib/db/pg/zahlungen';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'zahlstand-g9';

let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g9buch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

/** Der heutige Tag in Wien — so rechnet die Datenbank das Rechnungsdatum. */
function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}

async function ausstellen(): Promise<WithId<Invoice>> {
  const tag = heute();
  const { id } = await rechnungen.rechnungAusstellen(BETRIEB, {
    projectNumber: 'B-900', customerName: 'Familie Huber', address: 'Gartengasse 4, 8200 Gleisdorf',
    invoiceDate: tag, leistungVon: tag, leistungBis: tag, dueDate: tag,
    subtotalNetto: 1000, totalNetto: 1000, totalVat: 200, totalBrutto: 1200, vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
  }, { praefix: 'RE' });
  return { id, invoiceNumber: '', totalBrutto: 1200 } as WithId<Invoice>;
}

async function stand(id: string) {
  const { data: r } = await admin.from('invoices')
    .select('payment_status, bezahlt_betrag, cancelled_at').eq('id', id).single();
  const { data: z } = await admin.from('zahlungseingaenge').select('betrag').eq('invoice_id', id);
  return {
    status: r!.payment_status as string,
    bezahlt: Number(r!.bezahlt_betrag),
    summe: (z ?? []).reduce((s, e) => s + Number(e.betrag), 0),
    storniert: r!.cancelled_at != null,
  };
}

describe('Zahlstand bei gleichzeitigen Eingängen (G9)', () => {
  it('fünfzehn Eingänge zugleich: bezahlt ist die Summe aller, in jeder Runde', async () => {
    for (let runde = 0; runde < 3; runde++) {
      const inv = await ausstellen();
      await Promise.all(Array.from({ length: 15 }, () => createZahlung(BETRIEB, {
        invoiceId: inv.id, datum: heute(), betrag: 10, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
      })));
      const s = await stand(inv.id);
      expect(s.summe).toBe(150);
      expect(s.bezahlt).toBe(150);
      expect(s.status).toBe('Teilbezahlt');
    }
  }, 60_000);

  it('Eingang und Storno zugleich: die Rechnung bleibt storniert', async () => {
    for (let runde = 0; runde < 5; runde++) {
      const inv = await ausstellen();
      await Promise.allSettled([
        rechnungen.cancelInvoice(inv, 'Falscher Kunde'),
        createZahlung(BETRIEB, {
          invoiceId: inv.id, datum: heute(), betrag: 1200, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
        }),
      ]);
      const s = await stand(inv.id);
      expect(s.storniert).toBe(true);
      expect(s.status).toBe('Storniert');
      expect(s.bezahlt).toBe(s.summe);
    }
  }, 60_000);

  // Bleibt gleich: der Ablauf nacheinander rechnet wie bisher.
  it('nacheinander: Teilzahlung, Rest, Rückzahlung — wie bisher', async () => {
    const inv = await ausstellen();
    const zahlen = (betrag: number) => createZahlung(BETRIEB, {
      invoiceId: inv.id, datum: heute(), betrag, art: 'Überweisung', erfasstVonName: 'Buchhaltung',
    });
    await zahlen(200);
    expect(await stand(inv.id)).toMatchObject({ status: 'Teilbezahlt', bezahlt: 200 });
    await zahlen(1000);
    expect(await stand(inv.id)).toMatchObject({ status: 'Bezahlt', bezahlt: 1200 });
    await zahlen(50);
    expect(await stand(inv.id)).toMatchObject({ status: 'Überzahlt', bezahlt: 1250 });
    await zahlen(-50);
    expect(await stand(inv.id)).toMatchObject({ status: 'Bezahlt', bezahlt: 1200 });
  });
});
