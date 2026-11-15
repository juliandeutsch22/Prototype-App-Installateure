/**
 * M2 (16.11.2026): JEDE RECHNUNG DIESER FASSUNG HÄLT IHR MATERIAL JE AUSGABE.
 *
 * Die Datenschicht schickt `material_je_ausgabe` mit jedem Anlegen und die
 * Rüstlistenpositionen als eigene Belegart. Ohne das Kennzeichen deckte die
 * Datenbank die Rechnung weiter über ihr Leistungsende (Altregel) — der
 * Fehler, den M2 behebt, bliebe für jede neue Rechnung bestehen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: string; error: null }>>(
  async () => ({ data: 'neu-id', error: null }),
);
vi.mock('@/lib/db/pg/kern', async (orig) => ({
  ...(await orig<typeof import('@/lib/db/pg/kern')>()),
  derClient: () => ({ rpc }),
}));

import { createInvoice } from '@/lib/db/pg/invoices';
import type { Invoice } from '@/types';

const RECHNUNG = {
  invoiceNumber: 'RE-2026-0001', projectNumber: '2026-070', customerName: 'Huber',
  invoiceDate: '2026-11-16', dueDate: '2026-11-30', totalNetto: 100, totalVat: 20, totalBrutto: 120,
  positions: [{ label: 'Arbeit', qty: 1, unit: 'h', unitPrice: 100, netto: 100 }],
  paymentStatus: 'Offen',
} as unknown as Omit<Invoice, 'id' | 'companyId' | 'createdAt'>;

beforeEach(() => rpc.mockClear());

describe('rechnung_anlegen bekommt das Material je Ausgabe', () => {
  it('setzt das Kennzeichen und schickt Anforderungen und Rüstlistenpositionen als Belege', async () => {
    await createInvoice('perl', { ...RECHNUNG, linkedOrders: ['o1'], linkedRuestPositionen: ['p1'] });
    const args = rpc.mock.calls[0][1] as { p_kopf: Record<string, unknown>; p_belege: Record<string, string[]> };
    expect(args.p_kopf.material_je_ausgabe).toBe(true);
    expect(args.p_belege).toEqual({ material_order: ['o1'], ruest_position: ['p1'] });
  });

  it('Gleichbleiben: ohne Material auch keine Materialbelege — das Kennzeichen steht trotzdem', async () => {
    await createInvoice('perl', { ...RECHNUNG, linkedEntries: ['z1'] });
    const args = rpc.mock.calls[0][1] as { p_kopf: Record<string, unknown>; p_belege: Record<string, string[]> };
    expect(args.p_belege).toEqual({ time_entry: ['z1'] });
    expect(args.p_kopf.material_je_ausgabe).toBe(true);
    expect(args.p_kopf).not.toHaveProperty('linked_ruest_positionen');
  });
});
