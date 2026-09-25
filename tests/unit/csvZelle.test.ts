import { describe, it, expect } from 'vitest';
import { csvZelle } from '@/lib/csvZelle';
import { buildInvoiceCsv } from '@/features/invoices/buchhaltungExport';
import { buildBmdCsv, type Buchungskonto } from '@/features/invoices/bmdExport';
import { buildMonthCsv } from '@/features/accounting/export';
import { calcMonthStats } from '@/lib/time';
import type { AppUser, Invoice, TimeEntry } from '@/types';

/**
 * CSV-Formelinjektion (Prüflauf 25.09.2026, P2-23).
 *
 * Ein Kundenname „=HYPERLINK(…)" stand unverändert in der Datei, die die
 * Kanzlei in Excel öffnet — und Excel führt ihn als Formel aus. Entschärft
 * wird jedes TEXTfeld, das mit =, +, -, @, Tabulator oder Wagenrücklauf
 * beginnt. Ein negativer Betrag ist keine Formel und bleibt, wie er ist.
 */
describe('Ein CSV-Feld', () => {
  it('entschärft, was Excel als Formel läse', () => {
    expect(csvZelle('=HYPERLINK("http://x","klick")')).toBe(`"'=HYPERLINK(""http://x"",""klick"")"`);
    expect(csvZelle('+43 1 234')).toBe("'+43 1 234");
    expect(csvZelle('-Rabatt')).toBe("'-Rabatt");
    expect(csvZelle('@SUMME(A1)')).toBe("'@SUMME(A1)");
    expect(csvZelle('\tversteckt')).toBe("'\tversteckt");
    expect(csvZelle('\rversteckt')).toBe(`"'\rversteckt"`);
  });

  it('lässt Beträge und gewöhnlichen Text unverändert', () => {
    expect(csvZelle('-500,00')).toBe('-500,00');
    expect(csvZelle('+12,5')).toBe('+12,5');
    expect(csvZelle(-3)).toBe('-3');
    expect(csvZelle('1.200,00')).toBe('1.200,00');
    expect(csvZelle('Familie Huber')).toBe('Familie Huber');
    expect(csvZelle('Huber; Wien')).toBe('"Huber; Wien"');
    expect(csvZelle(null)).toBe('');
  });
});

const rechnung = (p: Partial<Invoice> = {}): Invoice => ({
  id: 'r1',
  companyId: 'perl',
  invoiceNumber: 'RE-2026-0001',
  projectNumber: 'B-001',
  customerName: '=cmd|"/c calc"!A1',
  invoiceDate: '2026-04-30',
  dueDate: '2026-05-14',
  totalNetto: 1000,
  totalVat: 200,
  totalBrutto: 1200,
  vatRate: 0.2,
  paymentStatus: 'Offen',
  ...p,
});

describe('Die Exporte', () => {
  it('Rechnungsausgangsbuch: der Kundenname wird entschärft, die Gegenbuchung bleibt eine Zahl', () => {
    const storno = rechnung({
      paymentStatus: 'Storniert',
      cancelledAt: new Date(2026, 3, 30, 12, 0).getTime(),
    });
    const e = buildInvoiceCsv([storno], [], '2026-04-01', '2026-04-30');
    expect(e.csv).toContain(`"'=cmd|""/c calc""!A1"`);
    expect(e.csv).not.toMatch(/;=cmd/);
    expect(e.csv).toContain(';-1000,00;');
    expect(e.csv).not.toContain("'-1000,00");
  });

  it('Buchungsstapel: auch der Buchungstext', () => {
    const konten: Buchungskonto[] = [
      { zweck: 'debitoren', konto: '2000' },
      { zweck: 'erloes', ustSatz: 0.2, konto: '4000', steuercode: 'M20' },
    ];
    const b = buildBmdCsv([rechnung({ customerName: '@SUMME(1+1)' })], konten, '2026-04-01', '2026-04-30');
    expect(b.csv).toContain(";'@SUMME(1+1) / B-001;");
  });
});

describe('Der Stundenexport', () => {
  it('entschärft auch einen Kommentar, der wie eine Formel beginnt', () => {
    const u = {
      id: 'u1', companyId: 'c', uid: 'u1', name: 'Max Mustermann', email: 'max@perl.at',
      role: 'Mitarbeiter', active: true, weeklyTargetHours: 40, yearlyVacationDays: 25,
      workDays: [1, 2, 3, 4, 5], appStartDate: '2025-01-01', initialOvertime: 0,
    } as unknown as AppUser;
    const e = {
      id: 'e1', companyId: 'c', date: '2025-06-02', status: 'Anwesend', userId: 'u1',
      userName: 'Max Mustermann', startTime: '07:00', endTime: '16:30', breakDuration: 30,
      comment: '=1+1',
    } as unknown as TimeEntry;
    const csv = buildMonthCsv(
      [{ user: u, monthEntries: [e], stats: calcMonthStats(u, [e], [e], 2025, 5) }], 2025, 5,
    );
    expect(csv).toContain("'=1+1");
    expect(csv).not.toMatch(/;=1\+1/);
  });
});
