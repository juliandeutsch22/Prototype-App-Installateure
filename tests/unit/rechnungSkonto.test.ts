// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/*
  Wie in `pdfUnveraendert`: unter Node ist der Default von `jspdf-autotable`
  ein Objekt statt einer Funktion. Der Ersatz merkt sich, wo die Tabelle
  beginnt — eine Zeile mehr darüber darf sie nicht überdecken.
*/
const tabellen: Array<{ startY?: number }> = [];
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: { startY?: number }) => {
    tabellen.push({ startY: opts.startY });
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));

import { generateInvoicePdf } from '@/features/invoices/pdf';
import type { AssembledInvoice } from '@/features/invoices/assemble';
import type { Company } from '@/types';

/**
 * Skonto auf der Rechnung (offene Punkte B7, Teil 2): mit Frist und Betrag,
 * nicht nur als Prozentsatz — sonst rechnet jeder Kunde anders. Ohne Zusage
 * bleibt der Beleg, wie er war (`pdfUnveraendert.test.ts`).
 */

const firma: Company = { id: 'perl', name: 'Perl Installationen GmbH' } as Company;

const LEISTUNG: AssembledInvoice = {
  positions: [{ label: 'Facharbeit', qty: 8, unit: 'h', unitPrice: 75, netto: 600 }],
  subtotalNetto: 600,
  discount: null,
  discountAmount: 0,
  totalNetto: 600,
  totalVat: 120,
  totalBrutto: 720,
  linkedEntries: [],
  linkedOrders: [],
  linkedWorkSheets: [],
  leistung: null,
  materialOhnePreis: [],
  entries: [],
};

function beleg(skonto?: { skontoProzent: number; skontoBis: string } | null): string {
  const doc = generateInvoicePdf({
    company: firma,
    project: { customerName: 'Baumeister Gruber', address: 'Bergweg 3', projectNumber: 'B-001' },
    invoiceNumber: 'RE-2026-1001',
    invoiceDate: '2026-09-15',
    dueDate: '2026-09-29',
    assembled: LEISTUNG,
    skonto,
  }) as unknown as { internal: { pages: string[][] } };
  return doc.internal.pages.filter(Boolean).map((s) => s.join('\n')).join('\n');
}

describe('Skonto auf der Rechnung', () => {
  it('nennt Frist, Satz und den Betrag nach Abzug', () => {
    // 720 € − 2 % (14,40 €) = 705,60 €
    const text = beleg({ skontoProzent: 2, skontoBis: '2026-09-22' });
    expect(text).toContain('Bei Zahlung bis 22.09.2026 abzüglich 2 % Skonto: 705,60');
  });

  it('ohne Zusage steht nichts davon da', () => {
    expect(beleg(null)).not.toContain('Skonto');
    expect(beleg()).not.toContain('Skonto');
  });
});
