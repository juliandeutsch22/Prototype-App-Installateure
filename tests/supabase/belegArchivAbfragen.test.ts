/**
 * Die Abfragen des Belegarchivs (10.10.2026): Angebote nach Angebotsdatum,
 * Rechnungen nach dem Tag der letzten Mahnung, Scheine als Beleg — gegen die
 * echte Datenbank, weil Spaltennamen und Filter nur dort zeigen, ob sie
 * stimmen.
 *
 * Gegenprobe je Abfrage: was ausserhalb des Zeitraums oder kein Beleg ist,
 * kommt nicht mit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { betriebAnlegen, konto, type Konto, mahnInhalt } from './helfer';
import * as rechnungen from '@/lib/db/pg/invoices';
import * as angebote from '@/lib/db/pg/quotes';
import * as scheine from '@/lib/db/pg/workSheets';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { WorkSheetUnterschrift } from '@/types';

const BETRIEB = 'archiv-abfr';
let chefin: Konto;
let monteur: Konto;

const strich = (name: string): WorkSheetUnterschrift => ({
  name, bild: `data:image/png;base64,${'A'.repeat(2_000)}`, geraetZeit: 1776000000000,
});

async function rechnung(nummer: string, invoiceDate: string): Promise<string> {
  return rechnungen.createInvoice(BETRIEB, {
    invoiceNumber: nummer, projectNumber: 'B-1', customerName: 'Familie Huber', address: 'Hauptstraße 1, 2700 Wiener Neustadt',
    invoiceDate, dueDate: invoiceDate, subtotalNetto: 100, totalNetto: 100, totalVat: 20, totalBrutto: 120,
    vatRate: 0.2, paymentStatus: 'Offen',
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 100, netto: 100 }],
  });
}

async function schein(datum: string, unterschreiben: boolean): Promise<string> {
  clientEinreichen(monteur.client);
  const id = await scheine.createWorkSheet(BETRIEB, {
    projectNumber: 'B-1', customerName: 'Familie Huber', datum, status: 'Entwurf', abrechnung: 'Regie',
    zeiten: [{ datum, mitarbeiter: 'Anton', von: '07:00', bis: '09:00', pauseMin: 0, minuten: 120 }],
    material: [], erstelltVonUid: monteur.uid, erstelltVonName: 'Anton',
  } as Parameters<typeof scheine.createWorkSheet>[1]);
  if (unterschreiben) await scheine.signWorkSheet(id, strich('Anton'), strich('Huber'));
  clientEinreichen(chefin.client);
  return id;
}

let gemahnt = '';
let unterschrieben = '';

beforeAll(async () => {
  await betriebAnlegen(BETRIEB);
  chefin = await konto(BETRIEB, 'Geschäftsführung', 'archgf');
  monteur = await konto(BETRIEB, 'Mitarbeiter', 'archmont');
  clientEinreichen(chefin.client);

  // Rechnung vom Dezember, gemahnt im Jänner; eine zweite im Dezember gemahnt.
  gemahnt = await rechnung('RE-2025-0900', '2025-12-01');
  await rechnungen.updateInvoiceStatus(gemahnt, 'Überfällig');
  await rechnungen.mahnungFesthalten(gemahnt, {
    stufe: 2, gemahntAm: '2026-01-12', frist: '2026-01-26', spesen: 10, inhalt: mahnInhalt(2, '2026-01-12', '2026-01-26'),
  });
  const frueh = await rechnung('RE-2025-0901', '2025-11-01');
  await rechnungen.updateInvoiceStatus(frueh, 'Überfällig');
  await rechnungen.mahnungFesthalten(frueh, {
    stufe: 1, gemahntAm: '2025-12-15', frist: '2025-12-29', spesen: 0, inhalt: mahnInhalt(1, '2025-12-15', '2025-12-29'),
  });

  for (const [nr, datum] of [['AN-2026-0100', '2026-03-01'], ['AN-2025-0100', '2025-12-31']]) {
    const { error } = await chefin.client.rpc('angebot_speichern', {
      p_id: null,
      p_kopf: { quote_number: nr, customer_name: 'Familie Huber', quote_date: datum, valid_until: datum, vat_rate: 0.2 },
      p_positionen: [{ label: 'Arbeitszeit', qty: 2, unit: 'h', unit_price: 80, netto: 160, ist_arbeitszeit: true }],
    });
    expect(error).toBeNull();
  }

  unterschrieben = await schein('2026-04-13', true);
  await schein('2026-04-14', false);
  await schein('2025-12-30', true);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('Belegarchiv: Abfragen', () => {
  it('Mahnungen nach dem Tag der Mahnung, nicht der Rechnung', async () => {
    const r = await rechnungen.listGemahntInRange(BETRIEB, '2026-01-01', '2026-12-31');
    expect(r.map((x) => [x.invoiceNumber, x.mahnstufe, x.gemahntAm, x.mahnfrist, x.mahnspesen])).toEqual([
      ['RE-2025-0900', 2, '2026-01-12', '2026-01-26', 10],
    ]);
  });

  it('Angebote nach Angebotsdatum, mit Positionen', async () => {
    const q = await angebote.listQuotesInRange(BETRIEB, '2026-01-01', '2026-12-31');
    expect(q.map((x) => x.quoteNumber)).toEqual(['AN-2026-0100']);
    expect(q[0].positions).toHaveLength(1);
  });

  it('Scheine: nur Belege des Zeitraums, ohne Bild — ganz geholt mit Bild', async () => {
    const koepfe = await scheine.listBelegScheineInRange(BETRIEB, '2026-01-01', '2026-12-31');
    expect(koepfe.map((s) => s.id)).toEqual([unterschrieben]);
    expect(koepfe[0].unterschriften?.kunde?.bild).toBeUndefined();
    const [voll] = await scheine.getWorkSheetsVoll(BETRIEB, [unterschrieben]);
    expect(voll.unterschriften?.kunde?.bild).toMatch(/^data:image\/png/);
    expect(voll).toEqual(await scheine.getWorkSheet(unterschrieben));
  });
});
