// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Der Ersatz für `jspdf-autotable` schreibt mit, welche Tabellen entstehen —
  geprüft wird, WAS gedruckt wird, nicht wie.
*/
const tabellen: Array<Record<string, unknown>> = [];
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: Record<string, unknown>) => {
    tabellen.push(opts);
    doc.lastAutoTable = { finalY: ((opts.startY as number) ?? 60) + 40 };
  },
}));

import { generateInvoicePdf } from '@/features/invoices/pdf';
import { druckAngaben } from '@/features/invoices/nachdruck';
import { leistungsnachweisZeilen } from '@/features/invoices/leistungsnachweis';
import type { Company, Invoice, TimeEntry } from '@/types';

/**
 * Der Leistungsnachweis gehört zum Beleg (Durchsicht 15.11.2026, G6).
 *
 * Vorher druckten Nachdruck und Belegarchiv eine Rechnung immer ohne ihn
 * (`entries: []`, `appendDetail: false`) — obwohl der Haken beim Anlegen
 * vorbelegt ist und der Kunde ihn mit dem Original bekam. Gegenprobe: ohne
 * die Änderung entsteht beim Nachdruck nur EINE Tabelle (die Positionen).
 */

const firma = { id: 'perl', name: 'Perl Installationen GmbH', iban: 'AT611904300234573201', vatId: 'ATU12345678' } as Company;

const buchung = (id: string, date: string, start: string, ende: string, extra: Partial<TimeEntry> = {}) => ({
  id, companyId: 'perl', date, status: 'Anwesend', startTime: start, endTime: ende,
  breakDuration: 0, userId: 'm1', userName: 'Manfred Monteur', ...extra,
}) as TimeEntry & { id: string };

const rechnung = (extra: Partial<Invoice> = {}): Invoice => ({
  companyId: 'perl', invoiceNumber: 'RE-2026-1001', projectNumber: 'B-001', customerName: 'Familie Huber',
  address: 'Gartengasse 12, 2700 Wiener Neustadt', invoiceDate: '2026-09-15', dueDate: '2026-09-29',
  positions: [{ label: 'Facharbeit', qty: 12, unit: 'h', unitPrice: 78, netto: 936 }],
  subtotalNetto: 936, totalNetto: 936, totalVat: 187.2, totalBrutto: 1123.2, vatRate: 0.2,
  paymentStatus: 'Offen', createdAt: 0,
  ...extra,
}) as Invoice;

beforeEach(() => {
  tabellen.length = 0;
});

describe('Leistungsnachweis im Beleg (G6)', () => {
  const zeilen = leistungsnachweisZeilen({
    entries: [
      buchung('e2', '2026-09-02', '07:00', '11:00', { comment: 'Eigene Notiz' }),
      buchung('e1', '2026-09-01', '07:00', '15:00', { userId: 'm2', userName: 'Lisa Lehrling', satz: 'lj1' } as Partial<TimeEntry>),
    ],
    taetigkeiten: { e1: 'Bad, Rohinstallation' },
  });

  it('die Zeilen: nach Datum, mit Person, Typ, Tätigkeit und Minuten — so, wie sie gedruckt werden', () => {
    expect(zeilen).toEqual([
      { uid: 'm2', datum: '2026-09-01', mitarbeiter: 'Lisa Lehrling', typ: 'Lehrling', taetigkeit: 'Bad, Rohinstallation', minuten: 480 },
      { uid: 'm1', datum: '2026-09-02', mitarbeiter: 'Manfred Monteur', typ: 'Fachkraft', taetigkeit: 'Eigene Notiz', minuten: 240 },
    ]);
  });

  it('der Nachdruck druckt den festgehaltenen Nachweis — auch ohne Buchungen in der Hand', () => {
    generateInvoicePdf(druckAngaben(firma, rechnung({ leistungsnachweis: zeilen })));
    expect(tabellen).toHaveLength(2);
    expect(tabellen[1].body).toEqual([
      ['01.09.2026', 'Lisa Lehrling', 'Lehrling', 'Bad, Rohinstallation', '8,00'],
      ['02.09.2026', 'Manfred Monteur', 'Fachkraft', 'Eigene Notiz', '4,00'],
    ]);
    expect(tabellen[1].foot).toEqual([['', '', '', 'Summe', '12,00']]);
  });

  it('erster Druck und Nachdruck ergeben denselben Nachweis', () => {
    const assembled = {
      positions: [{ label: 'Facharbeit', qty: 12, unit: 'h', unitPrice: 78, netto: 936 }],
      subtotalNetto: 936, discount: null, discountAmount: 0, totalNetto: 936, totalVat: 187.2, totalBrutto: 1123.2,
      linkedEntries: [], linkedOrders: [], linkedWorkSheets: [], leistung: null, materialOhnePreis: [],
      entries: [
        buchung('e2', '2026-09-02', '07:00', '11:00', { comment: 'Eigene Notiz' }),
        buchung('e1', '2026-09-01', '07:00', '15:00', { userId: 'm2', userName: 'Lisa Lehrling', satz: 'lj1' } as Partial<TimeEntry>),
      ],
      taetigkeiten: { e1: 'Bad, Rohinstallation' },
    };
    generateInvoicePdf({
      company: firma, project: { customerName: 'Familie Huber', address: 'x', projectNumber: 'B-001' },
      invoiceNumber: 'RE-2026-1001', invoiceDate: '2026-09-15', dueDate: '2026-09-29',
      assembled, appendDetail: true, leistungsnachweis: leistungsnachweisZeilen(assembled),
    });
    const erst = tabellen[1].body;
    tabellen.length = 0;
    generateInvoicePdf(druckAngaben(firma, rechnung({ leistungsnachweis: leistungsnachweisZeilen(assembled) })));
    expect(tabellen[1].body).toEqual(erst);
  });

  // Bleibt gleich: eine Rechnung ohne festgehaltenen Nachweis (davor, oder ohne Haken) druckt keinen.
  it('ohne festgehaltenen Nachweis: nur die Positionen, wie bisher', () => {
    generateInvoicePdf(druckAngaben(firma, rechnung()));
    expect(tabellen).toHaveLength(1);
    generateInvoicePdf(druckAngaben(firma, rechnung({ leistungsnachweis: null })));
    expect(tabellen).toHaveLength(2);
  });
});
