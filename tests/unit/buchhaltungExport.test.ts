import { describe, it, expect } from 'vitest';
import { buildInvoiceCsv, findeLuecken, invoiceCsvFilename } from '@/features/invoices/buchhaltungExport';
import type { Customer, Invoice } from '@/types';

/**
 * Das Rechnungsausgangsbuch geht an den Steuerberater und von dort in die
 * Umsatzsteuervoranmeldung. Zwei Regeln entscheiden, ob es brauchbar ist —
 * und beide sind leicht falsch zu machen:
 *
 *  1. STORNIERTE RECHNUNGEN GEHÖREN INS JOURNAL, aber nicht in die Summe.
 *     Sie wegzufiltern ist der naheliegende Fehler und erzeugt eine Lücke im
 *     Nummernkreis — für jede Prüfung ein Befund.
 *  2. LÜCKEN MÜSSEN AUFFALLEN. Eine fehlende Nummer heißt: eine Rechnung
 *     fehlt, oder sie wurde gelöscht statt storniert. Beides gehört geklärt,
 *     bevor der Export die Kanzlei erreicht.
 */

const re = (nr: string, netto: number, status: Invoice['paymentStatus'] = 'Offen'): Invoice => ({
  id: nr,
  companyId: 'perl',
  invoiceNumber: nr,
  projectNumber: 'B-001',
  customerName: 'Hausverwaltung Nord',
  invoiceDate: '2026-08-15',
  dueDate: '2026-08-29',
  totalNetto: netto,
  totalVat: netto * 0.2,
  totalBrutto: netto * 1.2,
  vatRate: 0.2,
  paymentStatus: status,
});

const kunden: Customer[] = [
  {
    id: 'k1',
    companyId: 'perl',
    name: 'Hausverwaltung Nord',
    vatId: 'ATU12345678',
  },
];

describe('Rechnungsausgangsbuch', () => {
  it('nimmt stornierte Rechnungen auf, zählt sie aber nicht zur Summe', () => {
    const rows = [re('RE-2026-0001', 1000), re('RE-2026-0002', 500, 'Storniert')];
    const e = buildInvoiceCsv(rows, kunden, '2026-08-01', '2026-08-31');

    // Beide im Journal …
    expect(e.csv).toContain('RE-2026-0001');
    expect(e.csv).toContain('RE-2026-0002');
    expect(e.anzahl).toBe(2);
    // … aber nur eine in der Summe.
    expect(e.summeNetto).toBe(1000);
    expect(e.csv).toContain('Summe (ohne Storni)');
  });

  it('meldet eine Lücke im Nummernkreis', () => {
    const luecken = findeLuecken([re('RE-2026-0001', 100), re('RE-2026-0003', 100)]);
    expect(luecken).toEqual(['RE-2026-0002']);
  });

  it('meldet keine Lücke, wenn der Kreis geschlossen ist', () => {
    expect(
      findeLuecken([re('RE-2026-0001', 1), re('RE-2026-0002', 1), re('RE-2026-0003', 1)]),
    ).toEqual([]);
  });

  it('prüft je Jahr getrennt — der Kreis beginnt jährlich neu', () => {
    /**
     * Ohne die Trennung nach Jahr wäre der Sprung von RE-2025-0087 auf
     * RE-2026-0001 eine Lücke von sechsundachtzig Nummern — und die Meldung
     * damit wertlos, weil sie jedes Jahr einmal falsch Alarm schlägt.
     */
    const a = { ...re('RE-2025-0087', 1), invoiceDate: '2025-12-20' };
    const b = re('RE-2026-0001', 1);
    expect(findeLuecken([a, b])).toEqual([]);
  });

  it('nimmt die UID-Nummer aus den Kundenstammdaten', () => {
    /**
     * Vor den Kundenstammdaten gab es die UID im System gar nicht — die
     * Rechnung trägt nur einen Kundennamen. Für Rechnungen an Unternehmen im
     * EU-Ausland ist sie Pflichtangabe.
     */
    const e = buildInvoiceCsv([re('RE-2026-0001', 100)], kunden, '2026-08-01', '2026-08-31');
    expect(e.csv).toContain('ATU12345678');
  });

  it('lässt die UID leer, wenn der Kunde keine hat', () => {
    const e = buildInvoiceCsv([re('RE-2026-0001', 100)], [], '2026-08-01', '2026-08-31');
    expect(e.csv).not.toContain('ATU');
    expect(e.anzahl).toBe(1);
  });

  it('grenzt auf den Zeitraum ein', () => {
    const drin = re('RE-2026-0001', 100);
    const draussen = { ...re('RE-2026-0002', 100), invoiceDate: '2026-09-02' };
    const e = buildInvoiceCsv([drin, draussen], kunden, '2026-08-01', '2026-08-31');
    expect(e.anzahl).toBe(1);
    expect(e.csv).not.toContain('RE-2026-0002');
  });

  it('schreibt Zahlen im deutschen Format', () => {
    // Der Steuerberater öffnet die Datei in Excel mit deutscher Einstellung;
    // ein Punkt als Dezimaltrenner ergäbe dort Tausender.
    const e = buildInvoiceCsv([re('RE-2026-0001', 1234.5)], kunden, '2026-08-01', '2026-08-31');
    expect(e.csv).toContain('1234,50');
    expect(e.csv).toContain('20,00'); // USt-Satz in Prozent
  });

  it('schützt Felder mit Semikolon', () => {
    /**
     * Ein Kundenname wie „Huber; Sohn KG" würde die Spalten verschieben und
     * damit stillschweigend Beträge in die falschen Felder rutschen lassen.
     */
    const heikel = { ...re('RE-2026-0001', 100), customerName: 'Huber; Sohn KG' };
    const e = buildInvoiceCsv([heikel], [], '2026-08-01', '2026-08-31');
    expect(e.csv).toContain('"Huber; Sohn KG"');
  });

  it('benennt die Datei nach dem Zeitraum', () => {
    expect(invoiceCsvFilename('2026-08-01', '2026-08-31')).toBe(
      'Rechnungsausgangsbuch_2026-08-01_bis_2026-08-31.csv',
    );
  });
});
