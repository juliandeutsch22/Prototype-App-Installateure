// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildStornoPdf, stornoDateiname, stornoTag } from '@/features/invoices/stornoPdf';
import type { Company, Invoice } from '@/types';

/**
 * Die Stornorechnung als Beleg (offene Punkte B7). Geprüft wird der
 * Textstrom des PDFs, wie bei der Mahnung.
 */

const firma: Company = {
  id: 'perl',
  name: 'Perl Installationen GmbH',
  iban: 'AT12 3456 7890 1234 5678',
  vatId: 'ATU12345678',
} as Company;

const rechnung: Invoice = {
  id: 'r1',
  companyId: 'perl',
  invoiceNumber: 'RE-2026-0042',
  projectNumber: 'B-001',
  customerName: 'Baumeister Gruber',
  invoiceDate: '2026-08-20',
  dueDate: '2026-09-03',
  totalNetto: 1000,
  totalVat: 200,
  totalBrutto: 1200,
  vatRate: 0.2,
  paymentStatus: 'Storniert',
  cancellationNote: 'Doppelt verrechnet',
  cancelledAt: new Date('2026-09-10T08:00:00+02:00').getTime(),
} as Invoice;

// Tausendertrenner hängt an den Gebietsdaten der Umgebung (siehe mahnungPdf.test.ts).
const betrag = (n: string) => new RegExp(n.replace(/[.]/g, '.'));

async function text(invoice: Invoice = rechnung): Promise<string> {
  const blob = await buildStornoPdf({ company: firma, invoice, nummer: 'RE-2026-0051' });
  return await new Promise<string>((fertig, fehler) => {
    const leser = new FileReader();
    leser.onload = () => fertig(String(leser.result));
    leser.onerror = () => fehler(leser.error);
    leser.readAsText(blob, 'latin1');
  });
}

describe('Was auf der Stornorechnung steht', () => {
  it('ihre eigene Nummer, den Tag des Stornos und die stornierte Rechnung', async () => {
    const s = await text();
    expect(s).toContain('Stornorechnung');
    expect(s).toContain('RE-2026-0051');
    expect(s).toContain('10.09.2026');
    expect(s).toContain('RE-2026-0042');
    expect(s).toContain('20.08.2026');
    expect(s).toContain('Doppelt verrechnet');
  });

  /*
    TESTBERICHT 30.09.2026, H6: der Beleg trug den Tag des Stornos; wurde er
    später ausgestellt, stand eine höhere Nummer mit älterem Datum im Kreis.
  */
  it('trägt das Ausstellungsdatum und nennt den Tag des Stornos im Text', async () => {
    const s = await text({ ...rechnung, stornoAm: new Date('2026-09-30T09:00:00+02:00').getTime() });
    expect(s).toMatch(/Datum[\s\S]*30\.09\.2026/);
    // Der Satz bricht im PDF um — geprüft werden seine Teile.
    expect(s).toMatch(/Der Storno wurde am/);
    expect(s).toMatch(/10\.09\.2026 erfasst/);
  });

  it('am selben Tag ausgestellt: kein doppeltes Datum im Text', async () => {
    const s = await text({ ...rechnung, stornoAm: new Date('2026-09-10T15:00:00+02:00').getTime() });
    expect(s).not.toContain('Der Storno wurde am');
  });

  it('die Beträge der Rechnung mit umgekehrtem Vorzeichen', async () => {
    const s = await text();
    expect(s).toMatch(betrag('- 1.000,00'));
    expect(s).toMatch(betrag('- 200,00'));
    expect(s).toMatch(betrag('- 1.200,00'));
  });

  it('bei Reverse Charge keine Steuer, sondern den Übergang', async () => {
    const s = await text({ ...rechnung, reverseCharge: true, totalVat: 0, totalBrutto: 1000 });
    expect(s).toContain('Steuerschuld');
    expect(s).not.toMatch(betrag('- 200,00'));
  });

  it('eine bezahlte Rechnung: die Erstattung, sonst: die Forderung entfällt', async () => {
    expect(await text()).toContain('entfällt');
    const bezahlt = await text({ ...rechnung, bezahltBetrag: 1200 });
    expect(bezahlt).toContain('erstatten');
  });
});

describe('Datum und Dateiname', () => {
  it('der Stornotag ist der Kalendertag in Wien', () => {
    // 23:30 UTC am 30.09. ist in Wien schon der 01.10.
    expect(stornoTag(Date.parse('2026-09-30T23:30:00Z'))).toBe('2026-10-01');
  });

  it('nennt die Bestellnummer der Rechnung, wenn es eine gibt (05.10.2026)', async () => {
    expect(await text({ ...rechnung, bestellnummer: '4500123456' })).toContain('Ihre Bestellnummer: 4500123456');
    expect(await text()).not.toContain('Bestellnummer');
  });

  it('der Dateiname nennt die Stornorechnung', () => {
    expect(stornoDateiname('RE-2026-0051')).toBe('Stornorechnung_RE-2026-0051.pdf');
  });
});
