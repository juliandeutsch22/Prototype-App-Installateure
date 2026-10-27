import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import RechnungDetail from '@/features/invoices/RechnungDetail';
import type { Invoice } from '@/types';

/**
 * Die Rechnung im Seitenfenster (Testbericht Runde 6, G1): der Kopf „Menge“
 * brach zu „Meng/e“, und die Zeile las sich „1 Stk7 500,50“. Layout rechnet
 * jsdom nicht — geprüft wird, was es verhindert: Köpfe und Zahlen brechen
 * nicht, und die Zahlenspalten halten Abstand zur Spalte davor.
 */
const RECHNUNG = {
  id: 'r1', companyId: 'perl', invoiceNumber: 'RE-2026-1502', projectNumber: 'PR-2026-0190', customerName: 'Familie Huber',
  address: 'Hauptplatz 1, 8200 Gleisdorf', invoiceDate: '2026-10-20', dueDate: '2026-11-03', vatRate: 0.2,
  positions: [{ label: 'Therme samt Montage', qty: 1, unit: 'Stk', unitPrice: 7500.5, netto: 7500.5 }],
  subtotalNetto: 7500.5, totalNetto: 7500.5, totalVat: 1500.1, totalBrutto: 9000.6, paymentStatus: 'Offen',
} as unknown as Invoice;

describe('Rechnung im Seitenfenster: Spalten (G1)', () => {
  it('Köpfe „Menge“ und „Netto“ brechen nicht, und die Zahlen kleben nicht aneinander', () => {
    render(<RechnungDetail inv={RECHNUNG} onClose={() => undefined} aktionen={[]} />);
    const tabelle = within(screen.getByRole('region', { name: 'Leistungen' })).getByRole('table');
    for (const name of ['Menge', 'Netto']) {
      const kopf = within(tabelle).getByRole('columnheader', { name });
      expect(kopf.className).toContain('whitespace-nowrap');
      expect(kopf.className).toContain('pl-3');
    }
    const zellen = within(tabelle).getAllByRole('cell');
    expect(zellen.map((z) => z.textContent)).toEqual(['Therme samt Montage', '1 Stk', expect.stringContaining('7')]);
    for (const zelle of zellen.slice(1)) {
      expect(zelle.className).toContain('whitespace-nowrap');
      expect(zelle.className).toContain('pl-3');
    }
    // Gleich bleibt: die Bezeichnung darf weiter umbrechen.
    expect(zellen[0].className).not.toContain('whitespace-nowrap');
  });
});
