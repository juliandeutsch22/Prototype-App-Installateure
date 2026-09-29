/**
 * Die Stornorechnung — gegen die echte Datenbank (offene Punkte B7).
 *
 * Geprüft wird der Beleg selbst — Nummer aus dem Rechnungskreis, aus dem
 * Jahr des Stornos, beim zweiten Mal dieselbe —, und was er festlegt: der
 * Storno lässt sich danach nicht mehr aufheben, die Nummer nicht ändern,
 * und der Kreis bietet sie kein zweites Mal an.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { naechsteNummern } from '@/lib/db/pg/company';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'storno-b7';
const JAHR = new Date().getFullYear();

let buch: Konto;
let verwaltung: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'sbuch');
  verwaltung = await konto(BETRIEB, 'Verwaltung', 'sverw');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));
afterEach(() => clientEinreichen(buch.client));

/** Eine Rechnung über 1.200 € brutto, ausgestellt auf dem Weg der App (Nummer vom Kreis). */
async function ausstellen(): Promise<WithId<Invoice>> {
  const { id } = await rechnungen.rechnungAusstellen(BETRIEB, {
    projectNumber: 'B-500',
    customerName: 'Familie Huber',
    address: 'Hauptstraße 1, 2700 Wiener Neustadt',
    invoiceDate: `${JAHR}-04-30`,
    dueDate: `${JAHR}-05-14`,
    subtotalNetto: 1000,
    totalNetto: 1000,
    totalVat: 200,
    totalBrutto: 1200,
    vatRate: 0.2,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
  }, { praefix: 'RE' });
  return lies(id);
}

async function lies(id: string): Promise<WithId<Invoice>> {
  const { data, error } = await admin.from('invoices')
    .select('id, invoice_number, payment_status, storno_nummer, storno_am, cancelled_at').eq('id', id).single();
  if (error) throw new Error(error.message);
  const z = data as Record<string, string | null>;
  return {
    id: z.id!, invoiceNumber: z.invoice_number!, paymentStatus: z.payment_status,
    stornoNummer: z.storno_nummer, stornoAm: z.storno_am ? Date.parse(z.storno_am) : null,
  } as unknown as WithId<Invoice>;
}

const lfdVon = (nummer: string) => Number(/-(\d+)$/.exec(nummer)![1]);

describe('Die Stornorechnung', () => {
  it('gibt es nur zu einer stornierten Rechnung', async () => {
    const inv = await ausstellen();
    await expect(rechnungen.stornorechnungAusstellen(inv, 'RE')).rejects.toThrow(/nur zu einer stornierten/);
  });

  it('bekommt die nächste Nummer aus dem Rechnungskreis — und beim zweiten Mal dieselbe', async () => {
    const inv = await ausstellen();
    await rechnungen.cancelInvoice(inv, 'Doppelt verrechnet');
    const nummer = await rechnungen.stornorechnungAusstellen(inv, 'RE');
    expect(nummer).toMatch(new RegExp(`^RE-${JAHR}-\\d{4}$`));
    expect(lfdVon(nummer)).toBe(lfdVon(inv.invoiceNumber) + 1);
    expect(await rechnungen.stornorechnungAusstellen(inv, 'RE')).toBe(nummer);
    const danach = await lies(inv.id);
    expect(danach.stornoNummer).toBe(nummer);
    expect(danach.stornoAm).not.toBeNull();
  });

  it('der Kreis bietet ihre Nummer kein zweites Mal an', async () => {
    const inv = await ausstellen();
    await rechnungen.cancelInvoice(inv, 'Falscher Kunde');
    const nummer = await rechnungen.stornorechnungAusstellen(inv, 'RE');
    // Auch ein neu aufgebauter Zähler zählt sie mit (`app.hoechste_lfd`) — sie
    // ist hier die höchste Nummer, ohne sie böte er genau sie noch einmal an.
    await admin.from('number_counters').delete().eq('company_id', BETRIEB).eq('art', 'invoices');
    expect((await naechsteNummern(JAHR)).rechnung).toBe(lfdVon(nummer) + 1);
    const naechste = await ausstellen();
    expect(lfdVon(naechste.invoiceNumber)).toBe(lfdVon(nummer) + 1);
  });

  it('danach lässt sich der Storno nicht mehr aufheben — vorher schon', async () => {
    // Die Gegenprobe zuerst: ohne Stornorechnung geht es am selben Tag.
    const frei = await ausstellen();
    await rechnungen.cancelInvoice(frei, 'Fehlgriff');
    await rechnungen.reactivateInvoice(frei);
    expect((await lies(frei.id)).paymentStatus).not.toBe('Storniert');

    const inv = await ausstellen();
    await rechnungen.cancelInvoice(inv, 'Mangel');
    const nummer = await rechnungen.stornorechnungAusstellen(inv, 'RE');
    await expect(rechnungen.reactivateInvoice(inv)).rejects.toThrow(new RegExp(`Stornorechnung ${nummer} ist ausgestellt`));
    expect((await lies(inv.id)).paymentStatus).toBe('Storniert');
  });

  it('ihre Nummer setzt niemand von Hand — auch nicht um', async () => {
    const inv = await ausstellen();
    await rechnungen.cancelInvoice(inv, 'Mangel');
    const setzen = await buch.client.from('invoices').update({ storno_nummer: 'RE-1999-0001' }).eq('id', inv.id);
    expect(setzen.error?.code).toBe('42501');

    const nummer = await rechnungen.stornorechnungAusstellen(inv, 'RE');
    const umsetzen = await buch.client.from('invoices').update({ storno_nummer: 'RE-1999-0002' }).eq('id', inv.id);
    expect(umsetzen.error?.code).toBe('42501');
    expect((await lies(inv.id)).stornoNummer).toBe(nummer);
  });

  it('die Verwaltung stellt keine aus — Rechnungsnummern vergibt die Buchhaltung', async () => {
    const inv = await ausstellen();
    await rechnungen.cancelInvoice(inv, 'Mangel');
    clientEinreichen(verwaltung.client);
    await expect(rechnungen.stornorechnungAusstellen(inv, 'RE')).rejects.toThrow();
    expect((await lies(inv.id)).stornoNummer).toBeNull();
  });
});
