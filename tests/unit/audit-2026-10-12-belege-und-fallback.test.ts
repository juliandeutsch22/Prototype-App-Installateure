import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { materialPositionen } from '@/features/invoices/materialPositionen';
import { aendernOhneEmpfang, lagerEinreichen } from '@/lib/db/pg/ohneEmpfang';
import type { Material, WorkSheet } from '@/types';

/** Audit-Spezifikation – keine Produktivänderung, keine Live-Systemzugriffe.
 * it.fails = Sollanforderung derzeit NICHT erfüllt, ausdrücklich keine Reparatur.
 */
const schein = {
  id: 'audit-schein', status: 'Unterschrieben', projectNumber: 'AUDIT-1',
  material: [{ name: 'Eckventil', menge: 2, einheit: 'Stk' }],
} as unknown as WorkSheet & { id: string };
const artikel = (id: string, preis: number) =>
  ({ id, name: 'Eckventil', unit: 'Stk', verkaufspreis: preis } as Material);

describe('Audit: automatische Rechnungspreise', () => {
  it('füllt eindeutig zugeordnetes Material korrekt aus', () => {
    const p = materialPositionen([schein], [artikel('a', 30)]);
    expect(p.positionen).toHaveLength(1);
    expect(p.positionen[0]).toMatchObject({ qty: 2, unit: 'Stk', unitPrice: 30, netto: 60 });
    expect(p.herkunft.ohnePreis).toHaveLength(0);
  });

  it.fails('übernimmt keinen willkürlichen Preis bei zwei verschiedenen Artikeln mit gleichem Namen', () => {
    const a = artikel('a', 30), b = artikel('b', 8);
    const erste = materialPositionen([schein], [a, b]).positionen[0];
    const zweite = materialPositionen([schein], [b, a]).positionen[0];
    // Ohne eindeutige Material-ID darf die Katalogreihenfolge keine Preisentscheidung treffen.
    expect(erste.unitPrice).toBe(0);
    expect(zweite.unitPrice).toBe(0);
  });
});

describe('Audit: UPDATE ohne IndexedDB und ohne geänderte Zeile', () => {
  afterEach(() => {
    lagerEinreichen(null);
    vi.unstubAllGlobals();
  });

  it.fails('bestätigt keine Änderung, wenn der Server null betroffene Zeilen meldet', async () => {
    vi.stubGlobal('indexedDB', undefined);
    lagerEinreichen(null);
    const client = {
      from: () => ({
        update: () => ({ eq: async () => ({ error: null, count: 0 }) }),
      }),
    } as unknown as SupabaseClient;
    const stand = await aendernOhneEmpfang('time_entries', 'nicht-vorhanden', { status: 'Anwesend' }, client);
    // Erwartet eine Ablehnung/Fehlermeldung, NICHT „confirmed“.
    expect(stand).not.toBe('confirmed');
  });

  it('bestätigt bei tatsächlich erfolgreicher Serveränderung', async () => {
    vi.stubGlobal('indexedDB', undefined);
    lagerEinreichen(null);
    const client = {
      from: () => ({
        update: () => ({ eq: async () => ({ error: null, count: 1 }) }),
      }),
    } as unknown as SupabaseClient;
    await expect(aendernOhneEmpfang('time_entries', 'vorhanden', { status: 'Anwesend' }, client))
      .resolves.toBe('confirmed');
  });
});
