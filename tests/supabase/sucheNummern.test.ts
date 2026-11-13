/**
 * „Suchen oder springen“ findet Nummern (C3, E91) — gegen die echte Datenbank.
 *
 * Rechnungen und Angebote nach ihrer Nummer, nur die Köpfe, nur im eigenen
 * Betrieb, und nur, was der Zeilenschutz der Rolle zeigt: die Abfrage ist
 * ein gewöhnliches `select`, keine Funktion mit eigenen Rechten.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { rechnungenNachNummer } from '@/lib/db/pg/invoices';
import { angeboteNachNummer } from '@/lib/db/pg/quotes';

const BETRIEB = 'suche-nummern';
const FREMD = 'suche-nummern-fremd';

let buch: Konto;
let monteur: Konto;
let leitung: Konto;

async function rechnung(betrieb: string, nummer: string, felder: Record<string, unknown> = {}) {
  const { error } = await admin.from('invoices').insert({
    company_id: betrieb, invoice_number: nummer, invoice_date: '2026-10-02', due_date: '2026-10-16',
    total_netto: 100, total_vat: 20, total_brutto: 120, payment_status: 'Offen',
    project_number: '2026-014', customer_name: 'Familie Huber', ...felder,
  });
  if (error) throw new Error(error.message);
}

async function angebot(betrieb: string, nummer: string, felder: Record<string, unknown> = {}) {
  const { error } = await admin.from('quotes').insert({
    company_id: betrieb, quote_number: nummer, customer_name: 'Familie Huber', quote_date: '2026-09-01',
    valid_until: '2026-10-01', status: 'Versendet', vat_rate: 20, ...felder,
  });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  await betriebAnlegen(FREMD);
  buch = await konto(BETRIEB, 'Buchhaltung', 'snbuch');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'snmont');
  leitung = await konto(BETRIEB, 'Geschäftsführung', 'snleit');

  await rechnung(BETRIEB, 'RE-2026-0042');
  await rechnung(BETRIEB, 'RE-2026-0043', { customer_name: 'Gasthof Post', storno_nummer: 'ST-2026-0001' });
  await rechnung(FREMD, 'RE-2026-0042');

  await angebot(BETRIEB, 'AN-2026-0007');
  await angebot(BETRIEB, 'AN-2026-0008', {
    status: 'Verworfen', verworfen_am: '2026-10-02T08:00:00+00:00', verworfen_von_uid: leitung.uid, verworfen_von_name: 'Leitung',
  });
  await angebot(FREMD, 'AN-2026-0007');
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Rechnungen nach Nummer', () => {
  it('findet die Nummer, auch mitten darin — mit Kunde, Baustelle und Datum, ohne Positionen', async () => {
    clientEinreichen(buch.client);
    const r = await rechnungenNachNummer(BETRIEB, '0042', 5);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ invoiceNumber: 'RE-2026-0042', customerName: 'Familie Huber', projectNumber: '2026-014', invoiceDate: '2026-10-02' });
    expect(r[0]).not.toHaveProperty('positions');
  });

  it('findet auch die Nummer einer Stornorechnung', async () => {
    clientEinreichen(buch.client);
    expect((await rechnungenNachNummer(BETRIEB, 'ST-2026', 5)).map((x) => x.invoiceNumber)).toEqual(['RE-2026-0043']);
  });

  it('Gegenprobe: nach dem Kunden sucht diese Abfrage nicht — das tut die Gruppe „Kunden“', async () => {
    clientEinreichen(buch.client);
    expect(await rechnungenNachNummer(BETRIEB, 'Huber', 5)).toEqual([]);
  });

  it('nur im eigenen Betrieb, nur bis zur Grenze, und ein leerer Begriff sucht nichts', async () => {
    clientEinreichen(buch.client);
    expect(await rechnungenNachNummer(BETRIEB, 'RE-2026', 1)).toHaveLength(1);
    expect(await rechnungenNachNummer(BETRIEB, '  ', 5)).toEqual([]);
  });

  it('der Monteur bekommt nichts — der Zeilenschutz gilt wie in der Liste', async () => {
    clientEinreichen(monteur.client);
    expect(await rechnungenNachNummer(BETRIEB, '0042', 5)).toEqual([]);
  });
});

describe('Angebote nach Nummer', () => {
  it('findet das Angebot, ohne das verworfene', async () => {
    clientEinreichen(leitung.client);
    const a = await angeboteNachNummer(BETRIEB, 'AN-2026', 5);
    expect(a.map((x) => x.quoteNumber)).toEqual(['AN-2026-0007']);
    expect(a[0]).toMatchObject({ customerName: 'Familie Huber', status: 'Versendet' });
  });

  it('Gegenprobe: nach dem Kunden nicht', async () => {
    clientEinreichen(leitung.client);
    expect(await angeboteNachNummer(BETRIEB, 'Huber', 5)).toEqual([]);
  });
});
