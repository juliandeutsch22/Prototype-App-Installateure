import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { positionsTabelle } from '@/lib/belegLayout';

/**
 * U6 / G17 (Nachtest 01.10.2026): „Pauschale“ brach im Beleg in
 * „Pauschal / e“ um. Geprüft am Satz selbst: die Zelle der Einheit trägt
 * das Wort in EINER Zeile.
 */
describe('Positionstabelle der Belege', () => {
  it('setzt „Pauschale“ in der Spalte Einheit in eine Zeile', () => {
    const doc = new jsPDF({ unit: 'mm' });
    const zeilen: string[][] = [];
    const umhuellt: typeof autoTable = ((d: jsPDF, opt: Parameters<typeof autoTable>[1]) =>
      autoTable(d, {
        ...opt,
        didDrawCell: (c) => {
          if (c.section === 'body' && c.column.index === 2) zeilen.push(c.cell.text);
        },
      })) as typeof autoTable;
    positionsTabelle(doc, umhuellt, {
      positions: [{ label: 'Anzahlung laut Angebot', qty: 1, unit: 'Pauschale', unitPrice: 2454.9, netto: 2454.9 }],
      fuss: [['', '', '', 'Netto', '2.454,90']],
      startY: 40,
    });
    expect(zeilen).toEqual([['Pauschale']]);
  });
});
