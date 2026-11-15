/**
 * Rechnungsnummern entstehen nur mit dem Beleg, der sie verbraucht
 * (Durchsicht 15.11.2026, G11).
 *
 * Vorher zog jede Buchhaltung über `naechste_nummer('invoices', …)` eine
 * Nummer, die nie eine Rechnung wurde — eine Lücke im lückenlosen Kreis, die
 * Ursache dessen, was die Lückenprüfung findet (N4). Ohne
 * `20261116050900_rechnungsnummer_nur_mit_beleg.sql` liefert der erste
 * Aufruf unten eine Nummer statt einer Absage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { betriebAnlegen, konto, type Konto } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen, type WithId } from '@/lib/db/pg/kern';
import type { Invoice } from '@/types';

const BETRIEB = 'kreis-g11';
let buch: Konto;

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  buch = await konto(BETRIEB, 'Buchhaltung', 'g11buch');
  clientEinreichen(buch.client);
}, 120_000);

afterAll(() => clientEinreichen(null));

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
}
const JAHR = Number(heute().slice(0, 4));

const ausstellen = () => rechnungen.rechnungAusstellen(BETRIEB, {
  projectNumber: 'B-G11', customerName: 'Familie Huber', address: 'Hauptplatz 1, 8200 Gleisdorf',
  invoiceDate: heute(), leistungVon: heute(), leistungBis: heute(), dueDate: heute(),
  subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120, vatRate: 0.2, paymentStatus: 'Offen',
  positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
}, { praefix: 'RE' });

const lfd = (nummer: string) => Number(nummer.split('-').pop());

describe('Rechnungsnummer nur mit ihrem Beleg (G11)', () => {
  it('direkt gibt es keine Rechnungsnummer — auch nicht für die Buchhaltung', async () => {
    const { data, error } = await buch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: JAHR });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
    expect(error?.message).toMatch(/nur zusammen mit ihrer Rechnung/);
  });

  it('Rechnung, Stornorechnung, Rechnung: lückenlos hintereinander', async () => {
    const erste = await ausstellen();
    await buch.client.rpc('naechste_nummer', { p_art: 'invoices', p_jahr: JAHR }); // abgewiesen, verbraucht nichts
    await rechnungen.cancelInvoice({ id: erste.id } as WithId<Invoice>, 'Falscher Kunde');
    const storno = await rechnungen.stornorechnungAusstellen({ id: erste.id } as WithId<Invoice>, 'RE');
    const zweite = await ausstellen();
    expect(lfd(storno)).toBe(lfd(erste.invoiceNumber) + 1);
    expect(lfd(zweite.invoiceNumber)).toBe(lfd(storno) + 1);
  });

  // Bleibt gleich: Angebots- und Baustellennummern zieht die Führung weiter direkt.
  it('Angebotsnummern bleiben direkt erreichbar', async () => {
    const { data, error } = await buch.client.rpc('naechste_nummer', { p_art: 'quotes', p_jahr: JAHR });
    expect(error).toBeNull();
    expect(data).toBeGreaterThan(0);
  });
});
