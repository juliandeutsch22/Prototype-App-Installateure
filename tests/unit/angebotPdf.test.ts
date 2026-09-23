// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Der Ersatz für `jspdf-autotable` schreibt die Tabellenoptionen mit — unter
  Node ist der Default der Bibliothek ein Objekt, und geprüft wird ohnehin,
  WAS in die Tabelle geht.
*/
const tabellen: Array<{ body?: string[][]; foot?: string[][]; startY?: number }> = [];
vi.mock('jspdf-autotable', () => ({
  default: (
    doc: { lastAutoTable?: { finalY: number } },
    opts: { body?: string[][]; foot?: string[][]; startY?: number },
  ) => {
    tabellen.push(opts);
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));

import { buildAngebotPdf, angebotDateiname } from '@/features/quotes/angebotPdf';
import type { Company, Quote } from '@/types';

/**
 * Das Angebot als Beleg.
 *
 * GEMELDET: „ein erstelltes Angebot kann man nicht als PDF herunterladen".
 * Geprüft wird der Textstrom — was draufsteht — und was in die Tabelle geht.
 */

const firma: Company = {
  id: 'perl',
  name: 'Perl Installationen GmbH',
  addressLine: 'Hauptplatz 7 · 2700 Wiener Neustadt',
  iban: 'AT12 3456 7890 1234 5678',
  vatId: 'ATU12345678',
} as Company;

const angebot: Quote = {
  id: 'q1',
  companyId: 'perl',
  quoteNumber: 'AN-2026-0007',
  customerId: 'k1',
  customerName: 'Gemeinde Neudorf',
  address: 'Schulgasse 2, 2700 Wiener Neustadt',
  quoteDate: '2026-09-01',
  validUntil: '2026-10-01',
  status: 'Versendet',
  positions: [{ label: 'Facharbeiterstunden', qty: 16.5, unit: 'h', unitPrice: 78, netto: 1287 }],
  subtotalNetto: 1287,
  totalNetto: 1287,
  totalVat: 257.4,
  totalBrutto: 1544.4,
  vatRate: 0.2,
  kalkulierteStunden: 16.5,
  notes: 'Arbeiten nur in den Schulferien.',
};

async function text(o: Partial<Parameters<typeof buildAngebotPdf>[0]> = {}): Promise<string> {
  const doc = (await buildAngebotPdf({
    company: firma,
    quote: angebot,
    kunde: { name: 'Gemeinde Neudorf', address: 'Rathausplatz 1, 2700 Wiener Neustadt' },
    ...o,
  })) as unknown as { internal: { pages: string[][] } };
  return doc.internal.pages.filter(Boolean).map((s) => s.join('\n')).join('\n');
}

beforeEach(() => {
  tabellen.length = 0;
});

describe('Das Angebots-PDF', () => {
  it('nennt Nummer, Datum und Bindefrist', async () => {
    const s = await text();
    expect(s).toContain('(Angebot) Tj');
    expect(s).toContain('(AN-2026-0007) Tj');
    expect(s).toContain('01.09.2026');
    expect(s).toContain('01.10.2026');
  });

  it('geht an die Anschrift des Kunden und nennt den Ort der Leistung eigens', async () => {
    const s = await text();
    expect(s).toContain('(Rathausplatz 1) Tj');
    expect(s).toContain('(Ort der Leistung: Schulgasse 2, 2700 Wiener Neustadt) Tj');
  });

  it('nimmt ohne Kundenstamm den Ort der Leistung als Anschrift — und nennt ihn nicht doppelt', async () => {
    const s = await text({ kunde: null });
    expect(s).toContain('(Schulgasse 2) Tj');
    expect(s).not.toContain('Ort der Leistung');
  });

  it('bringt Positionen und Summen in die Tabelle', async () => {
    await text();
    expect(tabellen[0].body?.[0]).toEqual(['Facharbeiterstunden', '16,5', 'h', '78,00', '1 287,00']);
    const fuss = (tabellen[0].foot ?? []).map((z) => z.join(' | ')).join('\n');
    expect(fuss).toContain('USt. 20%');
    expect(fuss).toContain('Brutto');
  });

  it('trägt die Anmerkungen', async () => {
    expect(await text()).toContain('Arbeiten nur in den Schulferien.');
  });

  it('verrät die kalkulierten Stunden nicht — sie sind eine interne Zahl', async () => {
    const s = await text();
    expect(s).not.toMatch(/kalkuliert/i);
    expect(s).not.toMatch(/Stundenbudget/i);
  });

  it('trägt Bank und UID in der Fusszeile', async () => {
    const s = await text();
    expect(s).toContain('IBAN AT12 3456 7890 1234 5678');
    expect(s).toContain('UID: ATU12345678');
  });

  it('heisst beim Herunterladen, was es ist', () => {
    expect(angebotDateiname(angebot)).toBe('Angebot_AN-2026-0007.pdf');
  });
});
