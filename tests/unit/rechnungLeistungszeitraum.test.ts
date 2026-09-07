// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/*
  Wie in `pdfUnveraendert`: unter Node ist der Default von `jspdf-autotable`
  ein Objekt statt einer Funktion.

  Der Ersatz SCHREIBT HIER MIT, statt nur die Endhöhe zu melden. Die
  Summenzeilen — und damit die Entscheidung zwischen „USt. 20 %" und dem
  Übergang der Steuerschuld — laufen durch die Tabelle und erscheinen nie in
  den Zeichenbefehlen des Dokuments. Ohne dieses Mitschreiben prüfte ein Test
  darauf etwas, das es im Testlauf gar nicht gibt; genau das ist mir hier beim
  ersten Anlauf passiert.
*/
const tabellen: Array<{ foot?: unknown[][] }> = [];
vi.mock('jspdf-autotable', () => ({
  default: (
    doc: { lastAutoTable?: { finalY: number } },
    opts: { startY?: number; foot?: unknown[][] },
  ) => {
    tabellen.push({ foot: opts.foot });
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));

/** Die Fusszeilen der Positionstabelle als flacher Text. */
function summen(): string {
  return (tabellen[0]?.foot ?? []).map((z) => z.join(' | ')).join('\n');
}

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
function befehle(
  leistung: AssembledInvoice['leistung'],
  extra?: { reverseCharge?: boolean; customerVatId?: string; vatRate?: number },
): string {
  tabellen.length = 0;
  const doc = generateInvoicePdf({
    company: firma,
    project: { customerName: 'Familie Huber', address: 'Hauptstraße 12', projectNumber: 'B-001' },
    invoiceNumber: '2026-0001',
    invoiceDate: '2026-09-15',
    dueDate: '2026-09-29',
    assembled: basis(leistung),
    ...extra,
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

/**
 * Bauleistung mit Übergang der Steuerschuld auf dem Beleg.
 *
 * Drei Dinge müssen zusammenkommen, und zwei davon sind Pflicht: KEINE
 * ausgewiesene Steuer, der Hinweis nach § 11 Abs 1a UStG, und die UID des
 * Leistungsempfängers. Fehlt eines, ist der Beleg unvollständig — und eine
 * trotzdem ausgewiesene Steuer schuldet der Betrieb kraft Rechnungslegung.
 */
describe('Reverse Charge auf dem Beleg', () => {
  const MIT = { reverseCharge: true, customerVatId: 'ATU11112222', vatRate: 0 };

  it('trägt den Pflichthinweis', async () => {
    const s = befehle({ von: '2026-09-04', bis: '2026-09-11' }, MIT);
    expect(s).toContain('Steuerschuld');
    expect(s).toContain('Leistungsempf');
    expect(s).toContain('19 Abs 1a');
  });

  it('trägt die UID des Empfängers', async () => {
    // Ohne sie ist der Übergang nicht belegt.
    expect(befehle(null, MIT)).toContain('ATU11112222');
  });

  it('weist KEINE Umsatzsteuer aus — auch keine 0 %', async () => {
    /*
      „0 %" ist ein Steuersatz und etwas anderes als ein Übergang der
      Steuerschuld. Eine ausgewiesene Steuer schuldet der Betrieb bis zur
      Berichtigung, und sei sie null.
    */
    befehle(null, MIT);
    expect(summen()).not.toContain('USt.');
    expect(summen()).toContain('Übergang der Steuerschuld');
  });

  it('nennt die Summe „Rechnungsbetrag" statt „Brutto"', async () => {
    // „Brutto" heisst: da ist Steuer drin. Hier ist keine drin.
    befehle(null, MIT);
    expect(summen()).toContain('Rechnungsbetrag');
    expect(summen()).not.toContain('Brutto');
  });

  it('lässt die gewöhnliche Rechnung unberührt', async () => {
    /*
      DIE SICHERHEITSREGEL. Ohne den Haken darf sich am Beleg nichts ändern —
      dieselbe Zusage wie beim Leistungszeitraum, und `pdfUnveraendert`
      prüft sie gegen die Referenzdatei aus der Zeit davor.
    */
    const s = befehle({ von: '2026-09-04', bis: '2026-09-11' });
    expect(s).not.toContain('Steuerschuld');
    expect(summen()).toContain('USt. 20%');
    expect(summen()).toContain('Brutto');
    expect(summen()).not.toContain('Übergang');
  });

  it('schreibt die Kunden-UID auch ohne Reverse Charge, wenn sie mitgegeben wird', async () => {
    // Sie gehört ab 10.000 € brutto ohnehin auf jede Rechnung an einen
    // Unternehmer (§ 11 Abs 1 Z 2 UStG) — das Feld ist deshalb nicht an den
    // Haken gebunden.
    expect(befehle(null, { customerVatId: 'ATU33334444' })).toContain('ATU33334444');
  });
});
