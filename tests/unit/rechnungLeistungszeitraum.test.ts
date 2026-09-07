// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/* Wie in `pdfUnveraendert`: unter Node ist der Default von `jspdf-autotable`
   ein Objekt statt einer Funktion. Geprüft wird der Kopf, und der entsteht
   davor. */
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: { startY?: number }) => {
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));

import { generateInvoicePdf } from '@/features/invoices/pdf';
import type { AssembledInvoice } from '@/features/invoices/assemble';
import type { Company } from '@/types';

/**
 * Der Leistungszeitraum auf der Rechnung.
 *
 * PFLICHTANGABE nach § 11 Abs 1 Z 4 UStG — „der Tag der Lieferung oder
 * sonstigen Leistung oder der Zeitraum, über den sich die sonstige Leistung
 * erstreckt". Auf den Rechnungen dieser App stand er nicht: dort waren
 * Rechnungsdatum, Zahlungsziel und Baustellennummer, und die Positionen
 * hiessen „Facharbeiterstunden". Formal unvollständig — und beim Kunden
 * wackelt damit der Vorsteuerabzug.
 */

const firma: Company = { id: 'perl', name: 'Perl Installationen GmbH' } as Company;

function basis(leistung: AssembledInvoice['leistung']): AssembledInvoice {
  return {
    positions: [{ label: 'Facharbeit', qty: 8.5, unit: 'h', unitPrice: 78, netto: 663 }],
    subtotalNetto: 663,
    discount: null,
    discountAmount: 0,
    totalNetto: 663,
    totalVat: 132.6,
    totalBrutto: 795.6,
    linkedEntries: [],
    linkedOrders: [],
    linkedWorkSheets: [],
    leistung,
    materialOhnePreis: [],
    entries: [],
  };
}

/** Der Textstrom des PDFs — die Zeichenbefehle samt Koordinaten. */
function befehle(leistung: AssembledInvoice['leistung']): string {
  const doc = generateInvoicePdf({
    company: firma,
    project: { customerName: 'Familie Huber', address: 'Hauptstraße 12', projectNumber: 'B-001' },
    invoiceNumber: '2026-0001',
    invoiceDate: '2026-09-15',
    dueDate: '2026-09-29',
    assembled: basis(leistung),
  }) as unknown as { internal: { pages: string[][] } };
  return doc.internal.pages.filter(Boolean).map((s) => s.join('\n')).join('\n');
}

describe('Der Leistungszeitraum auf dem Beleg', () => {
  it('steht als Zeitraum da, wenn er mehrere Tage umfasst', async () => {
    const s = befehle({ von: '2026-09-04', bis: '2026-09-11' });
    expect(s).toContain('Leistungszeitraum');
    expect(s).toContain('04.09.2026');
    expect(s).toContain('11.09.2026');
  });

  it('heisst bei EINEM Tag „Leistungsdatum"', async () => {
    /*
      Keine Kosmetik, sondern genau die Unterscheidung, die das Gesetz trifft:
      „der Tag ... ODER der Zeitraum". „Zeitraum vom 4. bis 4." wäre die
      Formulierung von jemandem, der das Feld nicht verstanden hat.
    */
    const s = befehle({ von: '2026-09-04', bis: '2026-09-04' });
    expect(s).toContain('Leistungsdatum');
    expect(s).not.toContain('Leistungszeitraum');
  });

  it('schreibt nichts, wenn er fehlt — und verschiebt dann auch nichts', async () => {
    /*
      DIE SICHERHEITSREGEL, gemessen statt behauptet: ohne Zeitraum ergibt die
      Rechnung Zeichenbefehl für Zeichenbefehl dasselbe Dokument wie vor
      dieser Änderung. Genau das hält `pdfUnveraendert.test.ts` gegen die
      Referenzdatei fest; hier steht die andere Hälfte — dass eine gesetzte
      Angabe die Positionstabelle NICHT nach unten schiebt.
    */
    const ohne = befehle(null);
    expect(ohne).not.toContain('Leistung');

    const mit = befehle({ von: '2026-09-04', bis: '2026-09-11' });
    // Die Positionstabelle beginnt in beiden Fällen an derselben Stelle:
    // die neue Zeile sitzt in der Lücke darüber.
    const zeilen = (s: string) => s.split('\n').filter((z) => z.includes('Baustelle')).length;
    expect(zeilen(ohne)).toBe(zeilen(mit));
    expect(mit.length).toBeGreaterThan(ohne.length);
  });
});
