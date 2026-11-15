/**
 * M7 (Durchsicht 15.11.2026): RETOURE — GUTSCHRIFT ERST NACH DER ANNAHME;
 * HÖCHSTMENGE AUS DEM AUSGEGEBENEN; HINWEIS, WENN SCHON VERRECHNET.
 *
 * Gegenprobe: ohne 20261116060500 schreibt „10 neu“ des Monteurs sofort 10
 * gut, obwohl 4 ausgegeben waren; `retoure_annehmen` und `retoure_rahmen`
 * gibt es nicht.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, betriebAnlegen, konto, type Konto } from './helfer';
import { clientEinreichen } from '@/lib/db/pg/kern';
import { createReturn, retoureAnnehmen, retoureRahmen } from '@/lib/db/pg/materialOrders';

const A = 'm7-retoure';
const NR = '2026-230';
let lager: Konto;
let buch: Konto;
let max: Konto;
let muffe: string;

const bestand = async () => Number((await admin.from('materials').select('stock').eq('id', muffe).single()).data?.stock);

function retoure(menge: number, rest: Record<string, unknown> = {}) {
  return createReturn(A, {
    materialId: muffe, materialName: 'Muffe', quantity: menge, condition: 'neu',
    projectNumber: NR, userId: max.uid, userName: 'Max', ...rest,
  } as never);
}

beforeAll(async () => {
  await betriebAnlegen(A);
  lager = await konto(A, 'Verwaltung', 'm7lager');
  buch = await konto(A, 'Buchhaltung', 'm7buch');
  max = await konto(A, 'Mitarbeiter', 'm7max');
  const m = await admin.from('materials').insert({ company_id: A, name: 'Muffe', unit: 'Stk', stock: 0, lagerartikel: true }).select('id').single();
  if (m.error) throw new Error(m.error.message);
  muffe = m.data!.id;
  const o = await admin.from('material_orders').insert({
    id: randomUUID(), company_id: A, material_id: muffe, material_name: 'Muffe', quantity: 4, status: 'Erledigt',
    transaction_type: 'order', user_id: max.uid, user_name: 'Max', project_number: NR,
  });
  if (o.error) throw new Error(o.error.message);
}, 120_000);

afterAll(() => clientEinreichen(null));

describe('M7: Höchstmenge und Annahme', () => {
  let gemeldet: string;

  it('mehr als ausgegeben kann von der Baustelle nicht zurückkommen', async () => {
    clientEinreichen(max.client);
    await expect(retoure(10)).rejects.toThrow(/wurden 4 ausgegeben, 0 sind schon zurück — mehr als 4/);
    expect(await bestand()).toBe(0);
  });

  it('„neu“ des Monteurs ins Lager wartet auf die Annahme — der Bestand bleibt', async () => {
    clientEinreichen(max.client);
    gemeldet = await retoure(3);
    expect(await bestand()).toBe(0);
    const { data } = await admin.from('material_orders').select('processed, angenommen_am').eq('id', gemeldet).single();
    expect(data).toEqual({ processed: false, angenommen_am: null });
  });

  it('der Rahmen zählt die gemeldete schon als zurück; die Rechnungsnummern sieht der Monteur nicht', async () => {
    clientEinreichen(max.client);
    const r = await retoureRahmen(NR, muffe, 'Muffe');
    expect(r).toMatchObject({ ausgegeben: 4, zurueck: 3, hoechstens: 1, verrechnet: false });
    expect(r).not.toHaveProperty('rechnungen');
    await expect(retoure(2)).rejects.toThrow(/mehr als 1/);
  });

  it('das Lager nimmt an, was ankam — erst dann wird gutgeschrieben', async () => {
    clientEinreichen(max.client);
    await expect(retoureAnnehmen(gemeldet, 2)).rejects.toThrow(/nimmt das Lager an/);
    clientEinreichen(lager.client);
    expect(await retoureAnnehmen(gemeldet, 2)).toBe(true);
    expect(await bestand()).toBe(2);
    const { data } = await admin.from('material_orders').select('quantity, gemeldete_menge, processed').eq('id', gemeldet).single();
    expect(data).toEqual({ quantity: 2, gemeldete_menge: 3, processed: true });
    // Zweimal annehmen bucht nicht zweimal.
    expect(await retoureAnnehmen(gemeldet)).toBe(false);
    expect(await bestand()).toBe(2);
  });

  it('Gleichbleiben: erfasst das Lager selbst, wird sofort gutgeschrieben', async () => {
    clientEinreichen(lager.client);
    await retoure(1);
    expect(await bestand()).toBe(3);
  });

  it('Gleichbleiben: ohne Baustelle keine Grenze; „gebraucht“ wartet nicht und schreibt nicht gut', async () => {
    clientEinreichen(max.client);
    const id = await retoure(50, { projectNumber: '', condition: 'gebraucht' });
    const { data } = await admin.from('material_orders').select('processed').eq('id', id).single();
    expect(data).toEqual({ processed: true });
    expect(await bestand()).toBe(3);
  });

  it('schon verrechnet: der Rahmen sagt es — mit Rechnungsnummer für wer Rechnungen sieht', async () => {
    const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
    const { error } = await admin.from('invoices').insert({
      company_id: A, invoice_number: 'RE-M7-1', project_number: NR, customer_name: 'Huber',
      invoice_date: heute, due_date: heute, total_netto: 10, total_vat: 2, total_brutto: 12, payment_status: 'Offen',
      leistung_bis: heute,
    });
    expect(error).toBeNull();
    clientEinreichen(max.client);
    expect((await retoureRahmen(NR, muffe, 'Muffe'))?.verrechnet).toBe(true);
    clientEinreichen(buch.client);
    expect(await retoureRahmen(NR, muffe, 'Muffe')).toHaveProperty('rechnungen');
  });
});
