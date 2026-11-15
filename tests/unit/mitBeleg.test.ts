import { describe, it, expect } from 'vitest';
import { mitBeleg } from '@/features/invoices/mitBeleg';
import type { Invoice, RechnungsKopf } from '@/types';

/**
 * DER KOPF VON JETZT MIT DEM BELEG VOM ÖFFNEN (L6). Die Liste trägt nur
 * Köpfe; was beim Öffnen kam, liefert nur Positionen, Abdeckung und
 * Leistungsnachweis — der Stand (Zahlung, Storno, Reaktivierung) kommt aus
 * der Liste.
 */
const voll = {
  id: 'r1', invoiceNumber: 'RE-1', customerName: 'Huber', invoiceDate: '2026-09-01', dueDate: '2026-09-15',
  totalNetto: 100, totalVat: 20, totalBrutto: 120, paymentStatus: 'Storniert', cancelledAt: '2026-09-20T10:00:00Z',
  cancellationNote: 'Falscher Kunde',
  positions: [{ label: 'Arbeit', qty: 1, unit: 'h', unitPrice: 100, netto: 100 }],
  linkedEntries: ['z1'], leistungsnachweis: [{ datum: '2026-09-01' }],
} as unknown as Invoice;

describe('mitBeleg', () => {
  it('nimmt Positionen, Abdeckung und Nachweis aus dem Beleg, den Rest aus dem Kopf', () => {
    const kopf = { ...voll, paymentStatus: 'Teilbezahlt', bezahltBetrag: 50 } as unknown as RechnungsKopf;
    delete (kopf as Partial<Invoice>).positions;
    const r = mitBeleg(kopf, voll);
    expect(r.positions).toEqual(voll.positions);
    expect(r.linkedEntries).toEqual(['z1']);
    expect(r.leistungsnachweis).toEqual(voll.leistungsnachweis);
    expect(r.paymentStatus).toBe('Teilbezahlt');
  });

  it('ein seit dem Öffnen geleertes Kopffeld kommt nicht aus dem älteren Beleg zurück (Reaktivierung)', () => {
    const kopf = { id: 'r1', invoiceNumber: 'RE-1', customerName: 'Huber', invoiceDate: '2026-09-01', dueDate: '2026-09-15',
      totalNetto: 100, totalVat: 20, totalBrutto: 120, paymentStatus: 'Offen' } as unknown as RechnungsKopf;
    const r = mitBeleg(kopf, voll);
    expect(r.paymentStatus).toBe('Offen');
    expect(r.cancelledAt).toBeUndefined();
    expect(r.cancellationNote).toBeUndefined();
    // Gegenprobe: das schlichte Zusammenlegen brächte den Storno zurück.
    expect({ ...voll, ...kopf }.cancelledAt).toBe('2026-09-20T10:00:00Z');
  });
});
