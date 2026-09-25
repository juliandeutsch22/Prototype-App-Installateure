import { describe, it, expect } from 'vitest';
import { pauschalAngebot, pauschaleVerrechnetMit, pauschalVorschau } from '@/features/invoices/pauschale';
import type { AssembledInvoice } from '@/features/invoices/assemble';
import type { Invoice, Quote } from '@/types';

/**
 * Die Rechnung einer Pauschalbaustelle (Launch-Check 25.09.2026, K3).
 *
 * Vorher: Angebot 275 € netto, Rechnung 6 h × 65 € plus Material — der
 * Pauschalkunde bekam eine Stundenrechnung.
 */

const BELEGE: AssembledInvoice = {
  positions: [{ label: 'Facharbeiterstunden', qty: 6, unit: 'h', unitPrice: 65, netto: 390 }],
  subtotalNetto: 390, discountAmount: 0, totalNetto: 390, totalVat: 78, totalBrutto: 468,
  linkedEntries: ['z1'], linkedOrders: ['o1'], linkedWorkSheets: ['s1'],
  leistung: { von: '2026-09-20', bis: '2026-09-24' },
  materialOhnePreis: ['Heizkörper'], entries: [],
};

const angebot = (rest: Partial<Quote> = {}): Quote => ({
  id: 'q1', companyId: 'perl', quoteNumber: 'AN-2026-0003', customerName: 'Max', quoteDate: '2026-09-01',
  validUntil: '2026-10-01', status: 'Angenommen',
  positions: [
    { label: 'Heizkörper', qty: 1, unit: 'Stk', unitPrice: 200, netto: 200 },
    { label: 'Montage', qty: 1, unit: 'Pauschale', unitPrice: 75, netto: 75 },
  ],
  subtotalNetto: 275, totalNetto: 275, totalVat: 55, totalBrutto: 330, vatRate: 0.2,
  ...rest,
} as Quote);

describe('pauschalVorschau', () => {
  it('nimmt die Positionen des Angebots, nicht die Stunden — und markiert die Belege', () => {
    const v = pauschalVorschau('einzel', BELEGE, angebot(), 0.2);
    expect(v.positions.map((p) => p.label)).toEqual(['Heizkörper', 'Montage']);
    expect(v.totalNetto).toBe(275);
    expect(v.totalBrutto).toBe(330);
    // Enthalten, also verrechnet: sie tauchen nicht wieder auf.
    expect(v.linkedEntries).toEqual(['z1']);
    expect(v.linkedWorkSheets).toEqual(['s1']);
    expect(v.leistung).toEqual({ von: '2026-09-20', bis: '2026-09-24' });
    expect(v.materialOhnePreis).toEqual([]);
  });

  it('übernimmt den Rabatt des Angebots', () => {
    const v = pauschalVorschau('schluss', BELEGE, angebot({ discount: { mode: 'percent', value: 10 } }), 0.2);
    expect(v.totalNetto).toBe(247.5);
  });

  it('ohne Angebot: eine Null, die eine Entscheidung ist', () => {
    const v = pauschalVorschau('einzel', BELEGE, null, 0.2);
    expect(v.positions).toEqual([{ label: 'Pauschale gemäß Vereinbarung', qty: 1, unit: 'Pauschale', unitPrice: 0, netto: 0 }]);
  });

  it('eine Teilrechnung verbraucht keine Belege — die Schlussrechnung zieht sie ab', () => {
    const v = pauschalVorschau('teil', BELEGE, angebot(), 0.2);
    expect(v.positions[0].label).toBe('Teilbetrag der Pauschale laut Angebot AN-2026-0003');
    expect(v.totalNetto).toBe(0);
    expect(v.linkedEntries).toEqual([]);
    expect(v.linkedWorkSheets).toEqual([]);
    expect(v.linkedOrders).toEqual([]);
  });
});

describe('Welches Angebot, und ist es schon verrechnet?', () => {
  it('nimmt das jüngste angenommene', () => {
    const alt = angebot({ id: 'a', quoteDate: '2026-08-01' });
    const neu = angebot({ id: 'b', quoteDate: '2026-09-01' });
    const abgelehnt = angebot({ id: 'c', quoteDate: '2026-09-10', status: 'Abgelehnt' });
    expect(pauschalAngebot([alt, abgelehnt, neu])?.id).toBe('b');
    expect(pauschalAngebot([abgelehnt])).toBeNull();
  });

  it('eine Einzel- oder Schlussrechnung verrechnet die Pauschale — Storno, Anzahlung, Teil nicht', () => {
    const r = (art: Invoice['art'], paymentStatus = 'Offen', projectNumber = 'PR-2026-0002') =>
      ({ invoiceNumber: `RE-${art}-${paymentStatus}`, art, paymentStatus, projectNumber }) as Invoice;
    expect(pauschaleVerrechnetMit([r('anzahlung'), r('teil'), r('einzel', 'Storniert')], '2026-0002')).toBeNull();
    expect(pauschaleVerrechnetMit([r(undefined)], '2026-0002')).toBe('RE-undefined-Offen');
    expect(pauschaleVerrechnetMit([r('schluss')], 'PR-2026-0002')).toBe('RE-schluss-Offen');
    expect(pauschaleVerrechnetMit([r('einzel', 'Offen', 'PR-2026-0009')], 'PR-2026-0002')).toBeNull();
  });
});
