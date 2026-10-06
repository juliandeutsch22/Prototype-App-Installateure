import { describe, it, expect } from 'vitest';
import { stornoBelegTag } from '@/features/invoices/stornoBelegTag';
import { buildInvoiceCsv } from '@/features/invoices/buchhaltungExport';
import { buildBmdCsv, type Buchungskonto } from '@/features/invoices/bmdExport';
import type { Invoice } from '@/types';

/**
 * Runde 3, M7: RE-2026-1503 stand in Liste und PDF mit 30.09.2026, in
 * Ausgangsbuch und BMD-Stapel mit 25.09.2026. Jetzt eine Quelle.
 */
const STORNO = Date.parse('2026-09-25T10:00:00+02:00');
const AUSGESTELLT = Date.parse('2026-09-30T09:00:00+02:00');

const rechnung = (x: Partial<Invoice> = {}): Invoice => ({
  companyId: 'perl', invoiceNumber: 'RE-2026-1500', projectNumber: 'PR-2026-0001', customerName: 'Huber',
  invoiceDate: '2026-09-10', dueDate: '2026-09-24', totalNetto: 100, totalVat: 20, totalBrutto: 120,
  vatRate: 0.2, paymentStatus: 'Storniert', cancelledAt: STORNO, stornoNummer: 'RE-2026-1503',
  stornoAm: AUSGESTELLT, ...x,
} as Invoice);

const konten: Buchungskonto[] = [
  { zweck: 'debitoren', konto: '2000' },
  { zweck: 'erloes', konto: '4000', ustSatz: 0.2, steuercode: '02' },
];

describe('Belegdatum der Stornorechnung — eine Quelle (M7)', () => {
  it('der Tag der Ausstellung, wenn die Stornorechnung ausgestellt ist', () => {
    expect(stornoBelegTag(rechnung())).toBe('2026-09-30');
  });

  it('ohne Stornorechnung der Tag des Stornos', () => {
    expect(stornoBelegTag(rechnung({ stornoAm: undefined, stornoNummer: undefined }))).toBe('2026-09-25');
    expect(stornoBelegTag(rechnung({ stornoAm: undefined, cancelledAt: undefined }))).toBeNull();
  });

  it('in Wiener Zeit: 00:30 am 1. Oktober ist der 1. Oktober', () => {
    expect(stornoBelegTag({ stornoAm: Date.parse('2026-09-30T22:30:00Z'), cancelledAt: undefined })).toBe('2026-10-01');
  });

  it('Ausgangsbuch und BMD-Stapel tragen dasselbe Datum wie der Beleg', () => {
    const journal = buildInvoiceCsv([rechnung()], [], '2026-09-01', '2026-09-30');
    const gegen = journal.csv.split('\n').find((z) => z.startsWith('RE-2026-1503'))!;
    expect(gegen.split(';')[1]).toBe('30.09.2026');
    const bmd = buildBmdCsv([rechnung()], konten, '2026-09-01', '2026-09-30');
    const storno = bmd.zeilen.find((z) => z.belegnummer === 'RE-2026-1503')!;
    expect(storno.belegdatum).toBe('30.09.2026');
  });

  it('Gegenprobe: die Rechnung selbst bleibt an ihrem Tag', () => {
    const bmd = buildBmdCsv([rechnung()], konten, '2026-09-01', '2026-09-30');
    expect(bmd.zeilen.find((z) => z.belegnummer === 'RE-2026-1500')!.belegdatum).toBe('10.09.2026');
  });

  it('ein Storno ohne Stornorechnung wird im Ausgangsbuch genannt', () => {
    const j = buildInvoiceCsv([rechnung({ stornoAm: undefined, stornoNummer: undefined })], [], '2026-09-01', '2026-09-30');
    expect(j.ohneStornorechnung).toEqual(['RE-2026-1500']);
    expect(buildInvoiceCsv([rechnung()], [], '2026-09-01', '2026-09-30').ohneStornorechnung).toEqual([]);
  });
});
