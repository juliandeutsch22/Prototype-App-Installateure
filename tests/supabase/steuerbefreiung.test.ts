/**
 * Der Grund der Steuerbefreiung steht auf der Rechnung (offene Punkte A2).
 *
 * Eine Rechnung mit 0 % Umsatzsteuer ohne Übergang der Steuerschuld braucht
 * den Hinweis auf die Befreiung (§ 11 Abs 1 Z 3 lit e UStG). Die Maske
 * sperrt ohne ihn; hier steht, dass auch die Datenbank es tut — und dass er,
 * einmal ausgestellt, bleibt.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';

const BETRIEB = 'befreiung-a';
const JAHR = new Date().getFullYear();
const GRUND = 'Kleinunternehmer, § 6 Abs 1 Z 27 UStG';

let buch: Konto;
let lfd = 3000;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'befbuch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function anlegen(extra: Partial<rechnungen.NewInvoice> = {}): Promise<string> {
  lfd += 1;
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: `RE-${JAHR}-${lfd}`,
    projectNumber: 'B-300',
    customerName: 'Familie Maier',
    invoiceDate: '2026-04-30',
    dueDate: '2026-05-14',
    totalNetto: 1000,
    totalVat: 0,
    totalBrutto: 1000,
    vatRate: 0,
    paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 1000, netto: 1000 }],
    ...extra,
  });
}

describe('0 % ohne Reverse Charge', () => {
  it('wird ohne Grund nicht angelegt — auch nicht mit Leerzeichen', async () => {
    await expect(anlegen()).rejects.toThrow(/Grund der Befreiung/);
    await expect(anlegen({ steuerbefreiung: '   ' })).rejects.toThrow(/Grund der Befreiung/);
  });

  it('mit Grund schon — und er steht danach auf der Rechnung', async () => {
    const id = await anlegen({ steuerbefreiung: GRUND });
    const { data } = await admin.from('invoices').select('steuerbefreiung').eq('id', id).single();
    expect(data!.steuerbefreiung).toBe(GRUND);
  });

  it('bleibt, wie er ausgestellt wurde', async () => {
    const id = await anlegen({ steuerbefreiung: GRUND });
    const { error } = await buch.client.from('invoices').update({ steuerbefreiung: 'etwas anderes' }).eq('id', id);
    expect(error?.message).toMatch(/nicht mehr ändern/);
  });
});

describe('Gegenproben', () => {
  it('Reverse Charge braucht ihn nicht — dort steht der Pflichtsatz', async () => {
    await expect(anlegen({ reverseCharge: true, customerVatId: 'ATU12345678' })).resolves.toBeTruthy();
  });

  it('eine Rechnung mit Steuer braucht ihn nicht', async () => {
    await expect(anlegen({ vatRate: 0.2, totalVat: 200, totalBrutto: 1200 })).resolves.toBeTruthy();
  });
});
