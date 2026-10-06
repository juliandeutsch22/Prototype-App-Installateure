// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// Wie in `rechnungEmpfaenger`: unter Node ist der Default von `jspdf-autotable` keine Funktion.
vi.mock('jspdf-autotable', () => ({
  default: (doc: { lastAutoTable?: { finalY: number } }, opts: { startY?: number }) => {
    doc.lastAutoTable = { finalY: (opts.startY ?? 60) + 40 };
  },
}));

import { ersterBelegTag, belegArchiv } from '@/features/invoices/belegArchiv';
import { druckAngaben } from '@/features/invoices/nachdruck';
import type { Company, Invoice } from '@/types';

/**
 * Das Belegarchiv (Stand-Datei 11.1, Punkt 6): Rechnungen und
 * Stornorechnungen des Zeitraums als PDF, das Rechnungsausgangsbuch als CSV,
 * und was fehlt, steht in „Hinweise.txt“.
 */

const firma = { id: 'perl', name: 'Perl Installationen GmbH' } as Company;

const rechnung = (p: Partial<Invoice>): Invoice => ({
  companyId: 'perl',
  invoiceNumber: 'RE-2026-0001',
  projectNumber: 'B-1',
  customerName: 'Hausverwaltung Nord',
  address: 'Ringstraße 1, 1010 Wien',
  invoiceDate: '2026-03-02',
  dueDate: '2026-03-16',
  totalNetto: 600,
  totalVat: 120,
  totalBrutto: 720,
  vatRate: 0.2,
  paymentStatus: 'Offen',
  positions: [{ label: 'Facharbeit', qty: 8, unit: 'h', unitPrice: 75, netto: 600 }],
  ...p,
}) as Invoice;

/** Liest Namen und Inhalt aller Dateien — wie ein Entpackprogramm, vom Verzeichnis aus. */
async function entpacken(blob: Blob): Promise<Map<string, Uint8Array>> {
  const puffer = await new Promise<ArrayBuffer>((fertig) => {
    const leser = new FileReader();
    leser.onload = () => fertig(leser.result as ArrayBuffer);
    leser.readAsArrayBuffer(blob);
  });
  const v = new DataView(puffer);
  const ende = puffer.byteLength - 22;
  let p = v.getUint32(ende + 16, true);
  const dateien = new Map<string, Uint8Array>();
  for (let i = 0; i < v.getUint16(ende + 10, true); i++) {
    const groesse = v.getUint32(p + 24, true);
    const n = v.getUint16(p + 28, true);
    const versatz = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(puffer, p + 46, n));
    const start = versatz + 30 + v.getUint16(versatz + 26, true) + v.getUint16(versatz + 28, true);
    dateien.set(name, new Uint8Array(puffer.slice(start, start + groesse)));
    p += 46 + n;
  }
  return dateien;
}

const text = (b?: Uint8Array) => new TextDecoder('latin1').decode(b);

const MAERZ = Date.parse('2026-03-20T10:00:00+01:00');
const BESTAND: Invoice[] = [
  rechnung({}),
  rechnung({ invoiceNumber: 'RE-2026-0002', positions: [] }),
  rechnung({
    invoiceNumber: 'RE-2026-0003', paymentStatus: 'Storniert', cancelledAt: MAERZ,
    stornoNummer: 'RE-2026-0005', stornoAm: MAERZ,
  }),
  rechnung({ invoiceNumber: 'RE-2026-0004', paymentStatus: 'Storniert', cancelledAt: MAERZ }),
  // Ausserhalb des Zeitraums — gehört nicht hinein.
  rechnung({ invoiceNumber: 'RE-2025-0099', invoiceDate: '2025-12-30', dueDate: '2026-01-13' }),
];

describe('Belegarchiv', () => {
  it('enthält jede Rechnung und Stornorechnung des Zeitraums als PDF, dazu das Journal', async () => {
    const stand: Array<[number, number]> = [];
    const e = await belegArchiv({
      company: firma, rechnungen: BESTAND, kunden: [], von: '2026-01-01', bis: '2026-12-31',
      fortschritt: (f, g) => stand.push([f, g]),
    });
    const d = await entpacken(e.blob);
    expect([...d.keys()].sort()).toEqual([
      'Hinweise.txt',
      'Rechnungen/RE-2026-0001.pdf',
      'Rechnungen/RE-2026-0003.pdf',
      'Rechnungen/RE-2026-0004.pdf',
      'Rechnungsausgangsbuch_2026-01-01_bis_2026-12-31.csv',
      'Stornorechnungen/Stornorechnung_RE-2026-0005.pdf',
    ]);
    expect(e).toMatchObject({ rechnungen: 3, stornos: 1 });
    expect(text(d.get('Rechnungen/RE-2026-0001.pdf')).startsWith('%PDF')).toBe(true);
    expect(text(d.get('Rechnungen/RE-2026-0001.pdf'))).toContain('RE-2026-0001');
    expect(text(d.get('Stornorechnungen/Stornorechnung_RE-2026-0005.pdf'))).toContain('RE-2026-0005');
    const csv = new TextDecoder().decode(d.get('Rechnungsausgangsbuch_2026-01-01_bis_2026-12-31.csv'));
    expect(csv).toContain('RE-2026-0002');
    expect(csv).not.toContain('RE-2025-0099');
    // Vier Rechnungen im Zeitraum, zwei storniert: sechs Schritte, der letzte ist „6 von 6“.
    expect(stand[stand.length - 1]).toEqual([6, 6]);
  });

  it('nennt, was fehlt — und erzeugt keine Stornorechnung, die nie ausgestellt wurde', async () => {
    const e = await belegArchiv({ company: firma, rechnungen: BESTAND, kunden: [], von: '2026-01-01', bis: '2026-12-31' });
    expect(e.hinweise).toEqual([
      expect.stringMatching(/^RE-2026-0002: keine Positionen gespeichert/),
      expect.stringMatching(/^RE-2026-0004: storniert, aber keine Stornorechnung ausgestellt/),
    ]);
    const hinweise = new TextDecoder().decode((await entpacken(e.blob)).get('Hinweise.txt'));
    expect(hinweise).toContain('Zeitraum: 01.01.2026 bis 31.12.2026');
    expect(hinweise).toContain('Rechnungen als PDF: 3');
    expect(hinweise).toContain('- RE-2026-0004: storniert');
  });

  /*
    RUNDE 3, M7: EINE QUELLE FÜR DAS BELEGDATUM (`stornoBelegTag`). Bis hier
    stand die Stornorechnung im Archiv und im Journal im Jahr des Stornos, auf
    dem Beleg und in der Liste mit dem Tag ihrer Ausstellung. Jetzt trägt sie
    überall den Tag der Ausstellung; ohne ausgestellte Stornorechnung zählt der
    Tag des Stornos. Welches Datum gilt, klärt die Steuerberatung.
  */
  it('die Stornorechnung steht im Jahr ihres Belegdatums, die Rechnung in ihrem', async () => {
    const alt = rechnung({
      invoiceNumber: 'RE-2025-0050', invoiceDate: '2025-11-03', dueDate: '2025-11-17',
      // Storniert im März 2026, die Stornorechnung erst im Jänner 2027 ausgestellt.
      paymentStatus: 'Storniert', cancelledAt: MAERZ, stornoNummer: 'RE-2026-0010',
      stornoAm: Date.parse('2027-01-10T10:00:00+01:00'),
    });
    const jahr = async (j: string) => [...(await entpacken((await belegArchiv({
      company: firma, rechnungen: [alt], kunden: [], von: `${j}-01-01`, bis: `${j}-12-31`,
    })).blob)).keys()].filter((n) => n.endsWith('.pdf'));
    expect(await jahr('2027')).toEqual(['Stornorechnungen/Stornorechnung_RE-2026-0010.pdf']);
    expect(await jahr('2025')).toEqual(['Rechnungen/RE-2025-0050.pdf']);
    expect(await jahr('2026')).toEqual([]);
  });

  it('G11: der erste Beleg — Rechnungsdatum oder Belegdatum einer Stornorechnung', () => {
    const a = rechnung({ invoiceNumber: 'RE-2026-0060', invoiceDate: '2026-04-01' });
    const b = rechnung({ invoiceNumber: 'RE-2026-0061', invoiceDate: '2026-02-15' });
    expect(ersterBelegTag([a, b], '2026-10-06')).toBe('2026-02-15');
    expect(ersterBelegTag([], '2026-10-06')).toBe('2026-10-06');
  });

  it('meldet Lücken im Nummernkreis zuerst', async () => {
    const e = await belegArchiv({
      company: firma, kunden: [], von: '2026-01-01', bis: '2026-12-31',
      rechnungen: [rechnung({}), rechnung({ invoiceNumber: 'RE-2026-0003' })],
    });
    expect(e.hinweise[0]).toMatch(/Fehlende Nummern im Nummernkreis: RE-2026-0002/);
  });

  it('Gegenprobe: ein Jahr ohne Belege ergibt ein Archiv nur mit Journal und Hinweisen', async () => {
    const e = await belegArchiv({ company: firma, rechnungen: BESTAND, kunden: [], von: '2024-01-01', bis: '2024-12-31' });
    expect([...(await entpacken(e.blob)).keys()].sort()).toEqual([
      'Hinweise.txt', 'Rechnungsausgangsbuch_2024-01-01_bis_2024-12-31.csv',
    ]);
    expect(e.hinweise).toEqual([]);
  });
});

describe('Nachdruck und Archiv drucken dasselbe', () => {
  it('alle Angaben aus dem Dokument — Reverse Charge, Bestellnummer, Rücklass, Skonto, Abzug', () => {
    const inv = rechnung({
      reverseCharge: true, customerVatId: 'ATU12345678', bestellnummer: 'B-77', leistungsort: 'Baustelle Süd',
      ruecklassArt: 'haft', ruecklassProzent: 5, ruecklassBetrag: 36, ruecklassBis: '2029-03-02',
      skontoProzent: 2, skontoBis: '2026-03-10', art: 'schluss', gesamtBrutto: 1000, gesamtNetto: 900, gesamtVat: 100,
    });
    expect(druckAngaben(firma, inv)).toMatchObject({
      invoiceNumber: 'RE-2026-0001',
      reverseCharge: true,
      customerVatId: 'ATU12345678',
      bestellnummer: 'B-77',
      leistungsort: 'Baustelle Süd',
      ruecklass: { art: 'haft', prozent: 5, betrag: 36, bis: '2029-03-02' },
      skonto: { skontoProzent: 2, skontoBis: '2026-03-10' },
      art: 'schluss',
      // Die volle Leistung — das PDF zieht die Vorrechnungen selbst ab.
      assembled: { totalBrutto: 1000, totalNetto: 900, totalVat: 100 },
    });
  });
});
