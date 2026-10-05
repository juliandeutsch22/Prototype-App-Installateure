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
import type { Company, RechnungsArt } from '@/types';

/**
 * Die Rechnung geht an den Kunden, nicht an die Baustelle.
 *
 * PRÜFLAUF 25.09.2026, P2-02: als Empfänger stand die Anschrift der
 * BAUSTELLE. Jetzt steht dort die des Kunden, und die Baustelle als „Ort der
 * Leistung" in einer eigenen Zeile — wie beim Angebot. Ohne Leistungsort
 * (Altbestand beim Nachdruck) bleibt der Beleg, wie er war; das hält
 * `pdfUnveraendert.test.ts` fest.
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

function beleg(extra: {
  leistungsort?: string; art?: RechnungsArt; bestellnummer?: string;
  ruecklass?: { art: 'haft' | 'deckung'; prozent: number; betrag: number; bis: string } | null;
} = {}): string {
  tabellen.length = 0;
  const doc = generateInvoicePdf({
    company: firma,
    project: {
      customerName: 'Hausverwaltung Nord',
      address: 'Ringstraße 1, 1010 Wien',
      projectNumber: 'B-001',
    },
    invoiceNumber: 'RE-2026-1001',
    invoiceDate: '2026-09-15',
    dueDate: '2026-09-29',
    assembled: LEISTUNG,
    ...extra,
  }) as unknown as { internal: { pages: string[][] } };
  return doc.internal.pages.filter(Boolean).map((s) => s.join('\n')).join('\n');
}

describe('Empfänger und Ort der Leistung', () => {
  it('der Empfänger ist die übergebene Anschrift, der Ort der Leistung eine eigene Zeile', () => {
    const text = beleg({ leistungsort: 'Mietwohnung Top 4, Bergweg 3, 2700 Wiener Neustadt' });
    expect(text).toContain('Ringstraße 1');
    expect(text).toContain('Ort der Leistung: Mietwohnung Top 4, Bergweg 3, 2700 Wiener Neustadt');
  });

  it('ohne Leistungsort steht keine solche Zeile da', () => {
    expect(beleg()).not.toContain('Ort der Leistung');
  });

  it('ist der Leistungsort die Anschrift des Empfängers, steht er nicht doppelt da', () => {
    expect(beleg({ leistungsort: 'Ringstraße 1, 1010 Wien' })).not.toContain('Ort der Leistung');
  });

  it('die Tabelle rückt nach, wenn über ihr zwei Zeilen stehen', () => {
    beleg({ leistungsort: 'Bergweg 3', art: 'anzahlung' });
    const mitZwei = tabellen[0].startY!;
    beleg({ art: 'anzahlung' });
    const mitEiner = tabellen[0].startY!;
    expect(mitZwei).toBeGreaterThan(mitEiner);
  });
});

/*
  DIE BESTELLNUMMER DES KUNDEN (seit 05.10.2026) — eine eigene Zeile wie der
  Ort der Leistung. Ohne Angabe bleibt der Beleg, wie er war.
*/
describe('Bestellnummer des Kunden', () => {
  it('steht als eigene Zeile auf dem Beleg', () => {
    expect(beleg({ bestellnummer: '4500123456/10' })).toContain('Ihre Bestellnummer: 4500123456/10');
  });

  it('Gegenprobe: ohne Bestellnummer keine solche Zeile, und die Tabelle beginnt wie vorher', () => {
    beleg({ bestellnummer: '  ' });
    const leer = tabellen[0].startY!;
    expect(beleg()).not.toContain('Bestellnummer');
    expect(tabellen[0].startY).toBe(leer);
  });

  it('die Tabelle rückt nach, wenn sie dasteht', () => {
    beleg({ leistungsort: 'Bergweg 3', art: 'anzahlung' });
    const ohne = tabellen[0].startY!;
    beleg({ leistungsort: 'Bergweg 3', art: 'anzahlung', bestellnummer: 'PO-77' });
    expect(tabellen[0].startY!).toBeGreaterThan(ohne);
  });
});

/*
  DER RÜCKLASS (05.10.2026) mindert den Zahlbetrag, nicht die Rechnung: die
  Summen bleiben voll, darunter steht der Einbehalt mit Fälligkeit, und der
  Überweisungssatz nennt den Betrag ohne ihn.
*/
describe('Rücklass auf dem Beleg', () => {
  it('nennt Einbehalt und Fälligkeit, und der Überweisungssatz den Zahlbetrag', () => {
    const text = beleg({ ruecklass: { art: 'haft', prozent: 5, betrag: 36, bis: '2029-09-15' } });
    // Das Eurozeichen steht im Datenstrom des PDFs anders kodiert.
    expect(text).toMatch(/Haftrücklass 5 %: 36,00 . werden einbehalten und sind am 15\.09\.2029 fällig\./);
    expect(text).toContain('Bitte überweisen Sie 684,00');
  });

  it('Gegenprobe: ohne Rücklass der volle Betrag und kein Einbehalt', () => {
    const text = beleg();
    expect(text).not.toContain('einbehalten');
    expect(text).toContain('Bitte überweisen Sie 720,00');
  });
});
