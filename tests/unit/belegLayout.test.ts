// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Der Ersatz für `jspdf-autotable` schreibt die Optionen mit — geprüft wird,
  WAS an die Tabelle geht (Stil, Zeilen), nicht wie sie gezeichnet wird.
*/
const tabellen: Array<Record<string, unknown>> = [];
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: Record<string, unknown>) => {
    tabellen.push(opts);
    doc.lastAutoTable = { finalY: ((opts.startY as number) ?? 60) + 40 };
  },
}));

import { adresszeilen, fmtMenge, TABELLENSTIL } from '@/lib/belegLayout';
import { generateInvoicePdf } from '@/features/invoices/pdf';
import type { AssembledInvoice } from '@/features/invoices/assemble';
import type { Company, TimeEntry } from '@/types';

/**
 * Das Layout der Kundenbelege.
 *
 * GEMELDET: „die Rechnungen sehen nicht professionell aus, die Vollfarb-Boxen
 * wirken billig" — die türkisfarbenen Summenfelder waren die Voreinstellung
 * von `jspdf-autotable`, die niemand überschrieben hatte.
 */

const firma: Company = {
  id: 'perl',
  name: 'Perl Installationen GmbH',
  addressLine: 'Hauptplatz 7 · 2700 Wiener Neustadt',
  iban: 'AT12 3456 7890 1234 5678',
  bic: 'RLNWATWW',
  bankName: 'Raiffeisenbank',
  vatId: 'ATU12345678',
  companyRegister: 'FN 123456a',
} as Company;

const KOMMENTAR =
  'Demontage der alten Sanitärobjekte, Vorwandinstallation für WC und Waschtisch, Druckprobe';

function rechnung(): { internal: { pages: string[][] } } {
  const assembled: AssembledInvoice = {
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
    leistung: null,
    materialOhnePreis: [],
    entries: [
      {
        companyId: 'perl',
        date: '2026-09-01',
        status: 'Anwesend',
        startTime: '07:00',
        endTime: '15:30',
        breakDuration: 30,
        userId: 'm1',
        userName: 'Manfred Monteur',
        comment: KOMMENTAR,
      } as TimeEntry,
    ],
  };
  return generateInvoicePdf({
    company: firma,
    project: {
      customerName: 'Familie Huber',
      address: 'Gartengasse 12, 2700 Wiener Neustadt',
      projectNumber: 'B-001',
    },
    invoiceNumber: 'RE-2026-0001',
    invoiceDate: '2026-09-15',
    dueDate: '2026-09-29',
    assembled,
    appendDetail: true,
  }) as unknown as { internal: { pages: string[][] } };
}

beforeEach(() => {
  tabellen.length = 0;
});

describe('Der Tabellenstil', () => {
  it('setzt keine Flächenfarbe in Kopf und Fuss', () => {
    // Ohne `false` füllt autotable beide mit seiner eigenen Farbe.
    expect(TABELLENSTIL.theme).toBe('plain');
    expect(TABELLENSTIL.headStyles?.fillColor).toBe(false);
    expect(TABELLENSTIL.footStyles?.fillColor).toBe(false);
  });

  it('gilt für Positionen UND Leistungsnachweis', () => {
    rechnung();
    expect(tabellen).toHaveLength(2);
    for (const t of tabellen) {
      expect(t.theme).toBe('plain');
      expect((t.headStyles as { fillColor: unknown }).fillColor).toBe(false);
      expect((t.footStyles as { fillColor: unknown }).fillColor).toBe(false);
    }
  });

  it('schreibt die Summen nur unter die letzte Seite', () => {
    // Die Voreinstellung wiederholt den Tabellenfuss auf jeder Seite — bei
    // einer langen Rechnung stünde die Endsumme dann mitten im Beleg.
    rechnung();
    expect(tabellen[0].showFoot).toBe('lastPage');
  });
});

describe('Die Rechnung im neuen Layout', () => {
  it('schreibt Mengen deutsch: 8,5 statt „8.5"', () => {
    rechnung();
    const zeile = (tabellen[0].body as string[][])[0];
    expect(zeile[1]).toBe('8,5');
  });

  it('kürzt die Tätigkeit im Leistungsnachweis nicht mehr ab', () => {
    rechnung();
    const zeile = (tabellen[1].body as string[][])[0];
    expect(zeile[3]).toBe(KOMMENTAR);
  });

  it('trägt Bank und UID in der Fusszeile JEDER Seite', () => {
    const seiten = rechnung().internal.pages.filter(Boolean);
    expect(seiten).toHaveLength(2);
    for (const s of seiten) {
      const text = s.join('\n');
      expect(text).toContain('IBAN AT12 3456 7890 1234 5678');
      expect(text).toContain('UID: ATU12345678');
      expect(text).toContain('FN 123456a');
    }
  });

  it('setzt den Ort unter die Strasse, wie im Kuvertfenster', () => {
    const text = rechnung().internal.pages.filter(Boolean)[0].join('\n');
    expect(text).toContain('(Gartengasse 12) Tj');
    expect(text).toContain('(2700 Wiener Neustadt) Tj');
  });
});

describe('Anschrift in Zeilen', () => {
  it('trennt vor der Postleitzahl', () => {
    expect(adresszeilen('Gartengasse 12, 2700 Wiener Neustadt')).toEqual([
      'Gartengasse 12',
      '2700 Wiener Neustadt',
    ]);
    expect(adresszeilen('Hauptstraße 1, A-1010 Wien')).toEqual(['Hauptstraße 1', 'A-1010 Wien']);
  });

  it('lässt ein Komma ohne Postleitzahl stehen', () => {
    expect(adresszeilen('Industriestraße 5, Stiege 2, 2700 Wiener Neustadt')).toEqual([
      'Industriestraße 5, Stiege 2',
      '2700 Wiener Neustadt',
    ]);
    expect(adresszeilen('Hauptstraße 12')).toEqual(['Hauptstraße 12']);
  });

  it('gibt ohne Anschrift keine Zeile', () => {
    expect(adresszeilen(undefined)).toEqual([]);
    expect(adresszeilen('  ')).toEqual([]);
  });
});

describe('Mengen', () => {
  it('ohne erzwungene Nachkommastellen, mit Komma', () => {
    expect(fmtMenge(24)).toBe('24');
    expect(fmtMenge(1.25)).toBe('1,25');
    expect(fmtMenge(0.333333)).toBe('0,333');
  });
});
