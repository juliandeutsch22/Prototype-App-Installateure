/**
 * Was auf einer Schlussrechnung unter der Positionstabelle steht.
 *
 * DAS IST DER TEIL DES BELEGS, DEN DAS FINANZAMT LIEST. § 11 Abs 12 UStG:
 * wer eine Steuer ausweist, schuldet sie. Die Steuer der Anzahlung ist auf
 * deren Beleg schon ausgewiesen; fehlt sie hier im Abzug, schuldet der
 * Betrieb sie ein zweites Mal, bis er berichtigt — und der Kunde zieht
 * Vorsteuer, die ihm nicht zusteht.
 */
import { describe, it, expect } from 'vitest';
import { summenZeilen, UEBERSCHRIFT } from '@/features/invoices/pdf';
import type { AssembledInvoice } from '@/features/invoices/assemble';
import type { Vorrechnung } from '@/types';

/** Die volle Leistung: 3.000 netto, 600 USt, 3.600 brutto. */
const gesamt: AssembledInvoice = {
  positions: [{ label: 'Facharbeiterstunden', qty: 40, unit: 'h', unitPrice: 75, netto: 3000 }],
  subtotalNetto: 3000,
  discount: null,
  discountAmount: 0,
  totalNetto: 3000,
  totalVat: 600,
  totalBrutto: 3600,
  linkedEntries: [],
  linkedOrders: [],
  linkedWorkSheets: [],
  leistung: { von: '2026-05-01', bis: '2026-08-31' },
  materialOhnePreis: [],
  entries: [],
};

const anzahlung: Vorrechnung = {
  invoiceId: 'a1',
  invoiceNumber: 'RE-2026-1001',
  invoiceDate: '2026-05-02',
  netto: 1000,
  vat: 200,
  brutto: 1200,
};

/**
 * Der Tausenderpunkt wird angeglichen, der Betrag nicht.
 *
 * `Intl.NumberFormat('de-AT')` trennt in dieser Laufzeit mit einem
 * GESCHÜTZTEN LEERZEICHEN (U+00A0), im Browser des Betriebs kann dort ein
 * Punkt stehen. Geprüft werden soll die Rechenregel, nicht die Schreibweise
 * einer fremden Bibliothek.
 */
const punkt = (t: string) => t.replace(/(\d)[\u00a0 ](\d)/g, '$1.$2');

/** Nur die Beschriftung und der Betrag — die Leerspalten tragen nichts. */
const zeilen = (o: Partial<Parameters<typeof summenZeilen>[0]> = {}) =>
  summenZeilen({ assembled: gesamt, vatRate: 0.2, rc: false, abzuege: [], forderung: 3600, ...o })
    .map((z) => [punkt(z[0]), punkt(z[3]), punkt(z[4])]);

describe('Die Überschrift benennt den Beleg', () => {
  it('unterscheidet Anzahlung, Teil- und Schlussrechnung', () => {
    // „Rechnung" über einer Anzahlung liest sich wie eine Forderung für eine
    // Leistung, die niemand erbracht hat.
    expect(UEBERSCHRIFT.einzel).toBe('Rechnung');
    expect(UEBERSCHRIFT.anzahlung).toBe('Anzahlungsrechnung');
    expect(UEBERSCHRIFT.teil).toBe('Teilrechnung');
    expect(UEBERSCHRIFT.schluss).toBe('Schlussrechnung');
  });
});

describe('Die Summenzeilen', () => {
  it('bleiben ohne Abzug, wie sie waren', () => {
    const z = zeilen();
    expect(z).toEqual([
      ['', 'Netto', '3.000,00'],
      ['', 'USt. 20%', '600,00'],
      ['', 'Brutto', '3.600,00'],
    ]);
  });

  it('weisen jede Anzahlung einzeln aus — mit ihrem Entgelt UND ihrer Steuer', () => {
    const z = zeilen({ abzuege: [anzahlung], forderung: 2400 });
    expect(z).toEqual([
      ['', 'Netto', '3.000,00'],
      ['', 'USt. 20%', '600,00'],
      // Nicht mehr „Brutto": wo abgezogen wird, ist das nicht der
      // Rechnungsbetrag, sondern die volle Leistung.
      ['', 'Gesamtleistung brutto', '3.600,00'],
      [
        'abzüglich RE-2026-1001 vom 02.05.2026',
        'netto 1.000,00 + USt 200,00',
        '- 1.200,00',
      ],
      ['', 'Restforderung brutto', '2.400,00'],
    ]);
  });

  it('zieht mehrere Anzahlungen jede für sich ab', () => {
    // Zusammengefasst stünde ein Betrag da, den der Kunde keiner seiner
    // Rechnungen zuordnen kann — und der Prüfer auch nicht.
    const zweite: Vorrechnung = { ...anzahlung, invoiceId: 'a2', invoiceNumber: 'RE-2026-1002', brutto: 600, netto: 500, vat: 100 };
    const z = zeilen({ abzuege: [anzahlung, zweite], forderung: 1800 });
    expect(z.filter((r) => r[0].startsWith('abzüglich'))).toHaveLength(2);
    expect(z[z.length - 1]).toEqual(['', 'Restforderung brutto', '1.800,00']);
  });

  it('weist bei Reverse Charge keine Steuer aus, auch nicht im Abzug', () => {
    /*
      Eine ausgewiesene Steuer schuldet der Betrieb kraft Rechnungslegung. Bei
      Übergang der Steuerschuld darf deshalb auch die Abzugszeile keine
      nennen — sonst steht auf einem Beleg ohne Steuer plötzlich eine.
    */
    const ohneUst: Vorrechnung = { ...anzahlung, vat: 0, brutto: 1000 };
    const z = zeilen({ rc: true, abzuege: [ohneUst], forderung: 2000 });
    expect(z.map((r) => r[1])).toEqual([
      'Netto',
      'Umsatzsteuer',
      'Gesamtleistung brutto',
      'netto',
      'Restforderung brutto',
    ]);
    // Nirgends ein Steuerbetrag — auch nicht in der Abzugszeile.
    expect(z.some((r) => /USt\s*[\d-]/.test(r.join(' ')))).toBe(false);
  });

  it('behält den Rabatt über der Gesamtleistung', () => {
    const mitRabatt = {
      ...gesamt,
      discount: { mode: 'percent' as const, value: 10 },
      discountAmount: 300,
      subtotalNetto: 3300,
    };
    const z = zeilen({ assembled: mitRabatt, abzuege: [anzahlung], forderung: 2400 });
    expect(z[0]).toEqual(['', 'Zwischensumme', '3.300,00']);
    expect(z[1]).toEqual(['', 'Rabatt 10 %', '- 300,00']);
  });
});
