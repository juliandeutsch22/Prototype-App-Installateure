/**
 * Testbericht 30.09.2026, M18 — Titel, Text, Positionsrabatt und
 * Katalogartikel, gegen eine echte Datenbank: über die Datenschicht der App
 * gespeichert, gelesen und in die Rechnung übernommen. Jede Regel mit
 * Gegenprobe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import * as angebote from '@/lib/db/pg/quotes';
import * as rechnungen from '@/lib/db/pg/invoices';
import { clientEinreichen } from '@/lib/db/pg/kern';
import type { Quote } from '@/types';

const A = 'angebotpos-a';
const B = 'angebotpos-b';
const JAHR = new Date().getFullYear();
let chefin: Konto;
let artikel = '';
let fremderArtikel = '';

beforeAll(async () => {
  await betriebAnlegen(A);
  await betriebAnlegen(B);
  chefin = await konto(A, 'Geschäftsführung', 'angposgf');
  clientEinreichen(chefin.client);
  const m = await admin.from('materials').insert({ company_id: A, name: 'Gastherme 24 kW', unit: 'Stk', stock: 0 }).select('id').single();
  if (m.error) throw new Error(m.error.message);
  artikel = String(m.data.id);
  const f = await admin.from('materials').insert({ company_id: B, name: 'Fremde Therme', unit: 'Stk', stock: 0 }).select('id').single();
  if (f.error) throw new Error(f.error.message);
  fremderArtikel = String(f.data.id);
}, 120_000);

afterAll(() => clientEinreichen(null));

let lfd = 0;
function angebot(positions: Quote['positions']): Parameters<typeof angebote.createQuote>[1] {
  lfd += 1;
  return {
    quoteNumber: `AN-${JAHR}-9${String(lfd).padStart(3, '0')}`, customerName: 'Familie Huber',
    quoteDate: `${JAHR}-03-01`, validUntil: `${JAHR}-03-31`, status: 'Entwurf',
    positions, subtotalNetto: 0, totalNetto: 0, totalVat: 0, totalBrutto: 0, vatRate: 0.2, kalkulierteStunden: 0,
  } as Parameters<typeof angebote.createQuote>[1];
}

describe('Angebot speichern und lesen', () => {
  it('Titel, Text, Rabatt und Artikel kommen so zurück, wie sie gespeichert wurden', async () => {
    const id = await angebote.createQuote(A, angebot([
      { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
      { label: 'Gastherme 24 kW', qty: 1, unit: 'Stk', unitPrice: 2500, netto: 2250, rabattProzent: 10, materialId: artikel, istArbeitszeit: false },
      { art: 'text', label: 'Fliesen bauseits', qty: 0, unit: '', unitPrice: 0, netto: 0 },
    ]));
    const q = await angebote.getQuote(A, id);
    expect(q?.positions).toEqual([
      expect.objectContaining({ art: 'titel', label: 'Bad', netto: 0 }),
      expect.objectContaining({ label: 'Gastherme 24 kW', rabattProzent: 10, materialId: artikel, netto: 2250 }),
      expect.objectContaining({ art: 'text', label: 'Fliesen bauseits' }),
    ]);
  });

  it('Gegenprobe: eine gewöhnliche Position kommt ohne neue Felder zurück', async () => {
    const id = await angebote.createQuote(A, angebot([{ label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 300, istArbeitszeit: false }]));
    expect((await angebote.getQuote(A, id))?.positions).toEqual([
      { label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 300, istArbeitszeit: false },
    ]);
  });

  it('ein Artikel eines anderen Betriebs bleibt kein Verweis', async () => {
    const id = await angebote.createQuote(A, angebot([{ label: 'Therme', qty: 1, unit: 'Stk', unitPrice: 1, netto: 1, materialId: fremderArtikel, istArbeitszeit: false }]));
    expect((await angebote.getQuote(A, id))?.positions[0].materialId).toBeUndefined();
  });

  it('ein Titel mit Preis wird abgewiesen — er käme sonst still in die Summe', async () => {
    await expect(angebote.createQuote(A, angebot([{ art: 'titel', label: 'Bad', qty: 1, unit: '', unitPrice: 50, netto: 50 }])))
      .rejects.toThrow(/quote_lines_ohne_preis/);
  });

  it('ein Rabatt von 100 % oder mehr wird abgewiesen, 99,5 % nicht (Gegenprobe)', async () => {
    await expect(angebote.createQuote(A, angebot([{ label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 0, rabattProzent: 100 }])))
      .rejects.toThrow(/quote_lines_rabatt/);
    await expect(angebote.createQuote(A, angebot([{ label: 'WC', qty: 1, unit: 'Stk', unitPrice: 300, netto: 1.5, rabattProzent: 99.5 }])))
      .resolves.toBeTruthy();
  });

  it('ein gelöschter Katalogartikel lässt die Zeile stehen', async () => {
    const m = await admin.from('materials').insert({ company_id: A, name: 'Ausverkauft', unit: 'Stk', stock: 0 }).select('id').single();
    const id = await angebote.createQuote(A, angebot([{ label: 'Ausverkauft', qty: 1, unit: 'Stk', unitPrice: 10, netto: 10, materialId: String(m.data!.id), istArbeitszeit: false }]));
    expect((await admin.from('materials').delete().eq('id', String(m.data!.id))).error).toBeNull();
    const q = await angebote.getQuote(A, id);
    expect(q?.positions).toEqual([expect.objectContaining({ label: 'Ausverkauft', netto: 10 })]);
    expect(q?.positions[0].materialId).toBeUndefined();
  });
});

describe('Rechnung mit Titel, Text und Rabatt', () => {
  let nummer = 8000;
  const kopf = (positions: NonNullable<Parameters<typeof rechnungen.createInvoice>[1]['positions']>) => {
    nummer += 1;
    return {
      invoiceNumber: `RE-${JAHR}-${nummer}`, projectNumber: 'B-900', customerName: 'Familie Huber',
      address: 'Hauptplatz 1, 8200 Gleisdorf',
      invoiceDate: `${JAHR}-04-30`, dueDate: `${JAHR}-05-14`,
      totalNetto: 180, totalVat: 36, totalBrutto: 216, vatRate: 0.2, paymentStatus: 'Offen' as const,
      positions,
    } as Parameters<typeof rechnungen.createInvoice>[1];
  };

  it('speichert und liest Art und Rabatt wie das Angebot', async () => {
    const id = await rechnungen.createInvoice(A, kopf([
      { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
      { label: 'Waschtisch', qty: 2, unit: 'Stk', unitPrice: 100, netto: 180, rabattProzent: 10 },
      { art: 'text', label: 'Fliesen bauseits', qty: 0, unit: '', unitPrice: 0, netto: 0 },
    ]));
    const r = (await rechnungen.listInvoicesInRange(A, `${JAHR}-01-01`, `${JAHR}-12-31`)).find((x) => x.id === id);
    expect(r?.positions).toEqual([
      { art: 'titel', label: 'Bad', qty: 0, unit: '', unitPrice: 0, netto: 0 },
      { label: 'Waschtisch', qty: 2, unit: 'Stk', unitPrice: 100, netto: 180, rabattProzent: 10 },
      { art: 'text', label: 'Fliesen bauseits', qty: 0, unit: '', unitPrice: 0, netto: 0 },
    ]);
  });

  it('Gegenprobe: ein Text mit Betrag wird abgewiesen, und es entsteht keine Rechnung', async () => {
    const vorher = (await rechnungen.listInvoicesInRange(A, `${JAHR}-01-01`, `${JAHR}-12-31`)).length;
    await expect(rechnungen.createInvoice(A, kopf([
      { label: 'Waschtisch', qty: 2, unit: 'Stk', unitPrice: 90, netto: 180 },
      { art: 'text', label: 'Hinweis', qty: 1, unit: '', unitPrice: 5, netto: 5 },
    ]))).rejects.toThrow(/invoice_lines_ohne_preis/);
    expect((await rechnungen.listInvoicesInRange(A, `${JAHR}-01-01`, `${JAHR}-12-31`)).length).toBe(vorher);
  });
});
