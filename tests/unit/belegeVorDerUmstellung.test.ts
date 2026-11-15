// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/* Wie in `rechnungSkonto.test.ts`: unter Node ist der Default von `jspdf-autotable` kein Aufruf. */
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: { startY?: number }) => {
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));

import { generateInvoicePdf } from '@/features/invoices/pdf';
import { druckAngaben } from '@/features/invoices/nachdruck';
import { ebiPruefen, ebInterfaceXml, type EbiOptionen } from '@/features/invoices/ebinterface';
import type { Company, Invoice } from '@/types';

/**
 * AUSGESTELLTE BELEGE WERDEN NICHT NEU GERECHNET (Durchsicht 15.11.2026, G7).
 *
 * Seit der einen Geldrundung ergibt 2 % auf 106,75 € einen Skonto von
 * 2,14 € (vorher 2,13 €) und 4,25 × 72,30 € eine Zeile über 307,28 €
 * (vorher 307,27 €). Gespeichert sind Zeilen, Summen und Steuern — nicht aber
 * der Skontobetrag im Zahlungssatz und nicht, mit welcher Rundung eine Zeile
 * entstand. Nachdruck, Belegarchiv und E-Rechnung einer älteren Rechnung
 * müssen trotzdem genau den Beleg ergeben, den der Kunde bekam.
 *
 * Gegenprobe: ohne die Wiedergabe der alten Rundung nennt der Nachdruck der
 * alten Rechnung „104,61“ statt „104,62“, und die E-Rechnung weist die alte
 * Zeile über 307,27 € als falsch gerechnet ab.
 */

const firma = {
  id: 'perl', name: 'Perl Installationen GmbH', strasse: 'Hauptstraße 12', plz: '2700', ort: 'Wiener Neustadt',
  land: 'AT', contactLine: 'office@perl.at', iban: 'AT61 1904 3002 3457 3201', bic: 'BKAUATWW', vatId: 'ATU12345678',
} as Company;

/** 88,96 € netto, 17,79 € USt, 106,75 € brutto; 2 % Skonto bis 22.09. */
function alteRechnung(extra: Partial<Invoice> = {}): Invoice {
  return {
    id: 'r1', companyId: 'perl', invoiceNumber: 'RE-2026-1001', projectNumber: 'B-001',
    customerName: 'Baumeister Gruber', address: 'Bergweg 3, 2700 Wiener Neustadt',
    invoiceDate: '2026-09-15', dueDate: '2026-09-29', leistungVon: '2026-09-01', leistungBis: '2026-09-10',
    vatRate: 0.2,
    positions: [{ label: 'Leistung', qty: 1, unit: 'Pauschale', unitPrice: 88.96, netto: 88.96 }],
    subtotalNetto: 88.96, totalNetto: 88.96, totalVat: 17.79, totalBrutto: 106.75,
    paymentStatus: 'Offen', skontoProzent: 2, skontoBis: '2026-09-22',
    ...extra,
  } as Invoice;
}

function text(doc: unknown): string {
  return (doc as { internal: { pages: string[][] } }).internal.pages.filter(Boolean).map((s) => s.join('\n')).join('\n');
}

describe('Der Skontobetrag im Nachdruck', () => {
  it('eine ältere Rechnung (ohne festgehaltenen Betrag) nennt, was damals gedruckt wurde: 104,62 €', () => {
    const angaben = druckAngaben(firma, alteRechnung());
    expect(angaben.skonto).toEqual({ skontoProzent: 2, skontoBis: '2026-09-22', betrag: 2.13 });
    expect(text(generateInvoicePdf(angaben))).toContain('abzüglich 2 % Skonto: 104,62');
  });

  it('eine Rechnung mit festgehaltenem Betrag nimmt ihn — und rechnet nichts', () => {
    const angaben = druckAngaben(firma, alteRechnung({ skontoZugesagt: 2.14 }));
    expect(angaben.skonto?.betrag).toBe(2.14);
    expect(text(generateInvoicePdf(angaben))).toContain('abzüglich 2 % Skonto: 104,61');
  });

  it('der erste Druck ohne Betrag rechnet mit der einen Rundung — wie die Datenbank', () => {
    const angaben = druckAngaben(firma, alteRechnung());
    expect(text(generateInvoicePdf({ ...angaben, skonto: { skontoProzent: 2, skontoBis: '2026-09-22' } })))
      .toContain('abzüglich 2 % Skonto: 104,61');
  });
});

describe('Die E-Rechnung einer älteren Rechnung', () => {
  const allgemein = (inv: Invoice): EbiOptionen => ({ company: firma, invoice: inv, empfaengerArt: 'allgemein' });
  /** Eine Zeile 4,25 h × 72,30 € mit dem Betrag, den die Rechnung festhält. */
  const mitZeile = (netto: number, extra: Partial<Invoice> = {}) => {
    const vat = Math.round(netto * 20) / 100;
    return alteRechnung({
      positions: [{ label: 'Facharbeit', qty: 4.25, unit: 'h', unitPrice: 72.3, netto }],
      subtotalNetto: netto, totalNetto: netto, totalVat: vat, totalBrutto: Math.round((netto + vat) * 100) / 100,
      skontoProzent: null, skontoBis: null,
      ...extra,
    });
  };

  it('eine Zeile, die vor der Umstellung 307,27 € ergab, bleibt richtig', () => {
    expect(ebiPruefen(allgemein(mitZeile(307.27))).fehler.filter((f) => f.startsWith('Position'))).toEqual([]);
  });

  it('die neue Rundung (307,28 €) ist ebenso richtig', () => {
    expect(ebiPruefen(allgemein(mitZeile(307.28))).fehler.filter((f) => f.startsWith('Position'))).toEqual([]);
  });

  it('Gegenprobe: ein Cent daneben in die andere Richtung ist weiter ein Fehler', () => {
    expect(ebiPruefen(allgemein(mitZeile(307.26))).fehler.some((f) => f.startsWith('Position 1'))).toBe(true);
  });

  it('der Skonto in der Datei ist der des Belegs: 2,13 € alt, der festgehaltene neu', () => {
    expect(ebInterfaceXml(allgemein(alteRechnung()))).toMatch(/<Discount>[\s\S]*<Amount>2.13<\/Amount>/);
    expect(ebInterfaceXml(allgemein(alteRechnung({ skontoZugesagt: 2.14 })))).toMatch(/<Discount>[\s\S]*<Amount>2.14<\/Amount>/);
  });
});
